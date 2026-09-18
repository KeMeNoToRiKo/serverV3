const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const ini = require('ini');
const chalk = require('chalk');

const { getQuestionsCollection, isConnected, waitForReconnect } = require('../db/mongo');
const { callGemini } = require('../ai/Gemini');
const { callOllama } = require('../ai/ollama');
const { fuzzySearch, pickBest, similarityRatio, normalize } = require('./searchUtils');

// ---------- Config (loaded once at module init) ----------
let aiProvider = null;
let modelName = null;
let MASTER_PROMPT = null;

try {
    const config = ini.parse(
        fs.readFileSync(path.join(__dirname, '../config.ini'), 'utf-8')
    );
    aiProvider = config?.ai?.provider || null;
    if (aiProvider) {
        modelName = config?.model?.[aiProvider] || null;
        console.log(`Model for ${aiProvider}: ${modelName}`);
    }
    MASTER_PROMPT = config?.prompt?.masterPrompt || null;
    console.log('AI Provider from config:', aiProvider);
} catch (error) {
    console.error('Error reading config.ini:', error);
}

// ---------- Helpers ----------
function withTimeout(promise, ms, label = 'operation') {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
        ),
    ]);
}

function normalizeAiResponse(aiResponse) {
    if (!aiResponse) return null;
    if (typeof aiResponse === 'string') {
        const answers = aiResponse
            .split(/\r?\n|(?<=\d[\.\)])\s*/)
            .map((a) => a.trim())
            .filter(Boolean);
        return { answers };
    }
    if (Array.isArray(aiResponse)) return { answers: aiResponse };
    return aiResponse;
}

function isConnectionError(err) {
    const name = err?.name || '';
    const msg = err?.message || '';
    return (
        name === 'MongoServerSelectionError' ||
        name === 'MongoNetworkError' ||
        name === 'MongoNotConnectedError' ||
        msg.includes('ECONNREFUSED') ||
        msg.includes('connection') ||
        msg.includes('timed out')
    );
}

async function tryAtlasSearch(collection, questionText) {
    try {
        const atlasResults = await collection
            .aggregate([
                {
                    $search: {
                        index: 'default',
                        text: {
                            query: questionText,
                            path: 'Question',
                            fuzzy: { maxEdits: 2, prefixLength: 2 },
                        },
                    },
                },
                { $limit: 5 },
            ])
            .toArray();
        return pickBest(atlasResults);
    } catch (err) {
        // Atlas Search index may not be configured — fall through silently.
        console.warn('Atlas Search unavailable or errored:', err.message);
        return null;
    }
}

// Ranks candidate docs by how many of the page's answer IDs overlap with each
// doc's Answer array. The more IDs that match, the more likely it's the same
// question. Breaks ties by preferring docs that have a Correct answer stored.
// Ranks candidates by answer ID overlap (primary) + question text similarity (secondary).
// Overlap is the core signal — text similarity only breaks ties between docs with equal
// overlap counts, so a strong ID match can never be beaten by a text-similar but ID-mismatched doc.
function pickBestByAnswerIdOverlap(docs, answerIds, questionText = null) {
    if (!docs || docs.length === 0) return null;
    const queryIdSet = new Set(answerIds.map(id => String(id)));
    const normalizedQuery = questionText ? normalize(questionText) : null;

    const scored = docs
        .map(doc => {
            const docIds = new Set(
                (doc.Answer || []).map(a => String(a.Answer_ID)).filter(Boolean)
            );
            const overlap = [...queryIdSet].filter(id => docIds.has(id)).length;
            const hasCorrect = (doc.Answer || []).some(a => a.Correct === true) ? 0.5 : 0;
            // Text similarity: max contribution 0.3 — enough to resolve ties but never
            // overrides even a single-ID overlap advantage.
            const textSim = normalizedQuery
                ? similarityRatio(normalizedQuery, normalize(doc.Question || '')) * 0.3
                : 0;
            return { doc, score: overlap + textSim + hasCorrect };
        })
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score);

    return scored.length > 0 ? scored[0].doc : null;
}

function logResult(result) {
    console.log();
    console.log(chalk.bold.yellowBright('================ DB Search Result ================'));
    if (Array.isArray(result.Answer) && result.Answer.length > 0) {
        result.Answer.forEach((ans, idx) => {
            console.log(chalk.bold('Question Text:') + ' ' + chalk.green(result.Question));
            console.log(chalk.bold('Question ID:') + ' ' + chalk.green(ans.Question_ID));
            console.log(chalk.bold(`Answer ${idx + 1}:`) + ' ' + chalk.green(ans.Answer_Text));
            console.log(chalk.bold.yellowBright('--------------------------------------------------'));
        });
    } else {
        console.log(chalk.red('(No answers array present)'));
    }
}

// Runs DB search steps 1-4. Throws on connection errors so the caller can retry.
async function performSearch(collection, questionText, questionId, answerIds = []) {
    let result = null;
    let searchMethod = null;

    // 1. Search by questionId (cheap and exact)
    if (questionId) {
        const docs = await collection
            .find({ Answer: { $elemMatch: { Question_ID: questionId } } })
            .limit(5)
            .toArray();
        result = pickBest(docs);
        if (result) searchMethod = 'questionId';
    }

    // 1.5. Search by answer IDs — find questions that own these answer choices.
    // Collects all questions containing any of the provided Answer_IDs, then ranks
    // them by overlap count so the question whose full answer set best matches the
    // page wins. Works even when questionId and questionText both fail (e.g. shuffled
    // question pools or questions with image-only text).
    if (!result && answerIds.length > 0) {
        const candidates = await collection
            .find({ Answer: { $elemMatch: { Answer_ID: { $in: answerIds } } } })
            .limit(10)
            .toArray();
        if (candidates.length > 0) {
            result = pickBestByAnswerIdOverlap(candidates, answerIds, questionText);
            if (result) searchMethod = 'answerIds';
        }
    }

    // 2. Exact Question field match
    if (!result && questionText) {
        const docs = await collection.find({ Question: questionText }).limit(5).toArray();
        result = pickBest(docs);
        if (result) searchMethod = 'questionText';
    }

    // 3. Atlas Search (fuzzy, if available)
    if (!result && questionText) {
        const atlas = await tryAtlasSearch(collection, questionText);
        if (atlas) { result = atlas; searchMethod = 'questionText'; }
    }

    // 4. In-app fuzzy fallback
    if (!result && questionText) {
        const found = await fuzzySearch(collection, questionText, {
            tokenMatchThreshold: 0.7,
            minSimilarity: 0.6,
            candidateLimit: 50,
        });
        if (found) { result = found.result; searchMethod = 'questionText'; }
    }

    return { result, searchMethod };
}

// Wraps performSearch with: pre-check → attempt → retry → listening mode → final attempt.
async function searchWithReconnect(collection, questionText, questionId, answerIds = []) {
    const attempt = () => performSearch(collection, questionText, questionId, answerIds);

    // If we already know we're disconnected, wait for reconnect before even trying.
    if (!isConnected()) {
        console.warn('[Search] DB disconnected on request start — entering listening mode');
        await waitForReconnect(30_000);
    }

    try {
        return await attempt();
    } catch (err) {
        if (!isConnectionError(err)) throw err;
        console.warn('[Search] DB connection issue on first attempt, retrying once…', err.message);
    }

    try {
        return await attempt();
    } catch (err) {
        if (!isConnectionError(err)) throw err;
        console.warn('[Search] Retry also failed — entering listening mode…', err.message);
        // Throws if reconnect times out (caught by route handler → 503).
        await waitForReconnect(30_000);
    }

    return await attempt();
}

// ---------- Router ----------
router.get('/', async (req, res) => {
    console.log('\nSearch route loaded');

    const { questionText, questionId, answerChoice, answerIds: answerIdsParam } = req.query;

    // Parse comma-separated answer IDs sent by the extension
    const answerIds = answerIdsParam
        ? answerIdsParam.split(',').map(id => id.trim()).filter(Boolean)
        : [];

    if (!questionText && !questionId && answerIds.length === 0) {
        return res.status(400).json({ error: 'Provide questionText, questionId, or answerIds' });
    }

    let collection;
    try {
        collection = getQuestionsCollection();
    } catch (err) {
        console.error('DB not connected:', err);
        return res.status(503).json({ error: 'Database unavailable' });
    }

    try {
        const { result, searchMethod } = await searchWithReconnect(collection, questionText, questionId, answerIds);

        if (result) {
            logResult(result);
            return res.json({
                result: {
                    ...result,
                    searchMethod,
                    originalQuestion: questionText,
                },
            });
        }

        // 5. AI fallback
        if (questionText) {
            if (!aiProvider || !modelName) {
                console.warn('AI provider not configured. Returning 404.');
                return res
                    .status(404)
                    .json({ error: 'No matching question found and AI is not configured' });
            }

            console.log(`Using AI (${aiProvider}) for: ${questionText}`);
            let aiResponse;
            try {
                const provider = aiProvider.toLowerCase();
                const aiCall =
                    provider.includes('gemini')
                        ? callGemini(questionText, answerChoice, modelName, MASTER_PROMPT)
                        : provider.includes('ollama')
                          ? callOllama(questionText, answerChoice, modelName, MASTER_PROMPT)
                          : null;

                if (!aiCall) {
                    console.warn('Unknown AI provider:', aiProvider);
                    return res.status(500).json({ error: 'Unknown AI provider configured' });
                }

                aiResponse = await withTimeout(aiCall, 30_000, `AI (${aiProvider})`);

                if (!aiResponse) {
                    return res.status(404).json({ error: 'AI provider returned no response' });
                }

                return res.status(200).json([
                    {
                        answer_text: null,
                        answer_id: null,
                        question_id: questionId || null,
                        question_text: questionText || null,
                        question_type: null,
                        searchMethod: 'ai',
                        correct: null,
                        aiModel: modelName,
                        aiProvider: aiProvider,
                        aiAnswer: normalizeAiResponse(aiResponse),
                    },
                ]);
            } catch (err) {
                console.error('AI provider error:', err);
                return res.status(502).json({
                    error: 'AI provider error',
                    details: err.message,
                });
            }
        }

        return res.status(404).json({ error: 'No matching question found' });
    } catch (error) {
        if (isConnectionError(error)) {
            console.error('[Search] DB unavailable after all retries:', error.message);
            return res.status(503).json({ error: 'Database unavailable, please try again later' });
        }
        console.error('Error accessing DB:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;