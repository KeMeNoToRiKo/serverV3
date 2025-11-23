const express = require('express');
const router = express.Router();
const { getQuestionsCollection } = require('../db/mongo');
const { callGemini } = require('../ai/Gemini');
const { callOllama } = require('../ai/ollama');

const fs = require('fs');
const ini = require('ini');
const { fuzzySearch } = require('./searchUtils');





// GET AI Provider and Model from config.ini
let aiProvider = null;
let modelName = null;
let MASTER_PROMPT = null;

try {
    const config = ini.parse(fs.readFileSync(require('path').join(__dirname, '../config.ini'), 'utf-8'));
    aiProvider = config.ai.provider;
    if (aiProvider) {
        modelName = config.model[aiProvider];
        console.log(`Model for ${aiProvider}: ${modelName}`);
    }
    MASTER_PROMPT = config.prompt.masterPrompt;
    console.log("AI Provider from config:", aiProvider);
} catch (error) {
    console.error("Error reading config.ini:", error);
}


//ROUTER
router.get('/', async (req, res) => {
    console.log()
    console.log("Search route loaded");

    const { questionText, questionId, answerChoice } = req.query;
    if (!questionText && !questionId) {
        return res.status(400).json({ error: 'Provide questionText or questionId' });
    }

    const collection = getQuestionsCollection();

    try {
        let result = null;
        let searchMethod = null;

        // --------------------------------------
        // 1. Search by questionId
        // --------------------------------------
        if (questionId) {
            // note: model stores answers under Answer.Question_ID
            const idQuery = { 'Answer.Question_ID': questionId };
            console.log("Searching by questionId:", idQuery);
            result = await collection.findOne(idQuery);
            console.log("Result for questionId:", result);
            if (result) searchMethod = 'questionId';
        }


        // --------------------------------------
        // 2. Search by exact Question field
        // --------------------------------------
        if (!result && questionText) {
        const textQuery = { Question: questionText };
        console.log('Searching by questionText:', textQuery);
        result = await collection.findOne(textQuery);
        if (result) searchMethod = 'questionText';
        }


        // --------------------------------------
        // 3. ATLAS SEARCH (fuzzy, high accuracy)
        // --------------------------------------
        if (questionText) {
            console.log("Running Atlas Search fuzzy match...");

            const atlasResults = await collection.aggregate([
                {
                    $search: {
                        index: "default",   // name of your Atlas Search index
                        text: {
                            query: questionText,
                            path: "Question",
                            fuzzy: {
                                maxEdits: 2,
                                prefixLength: 2
                            }
                        }
                    }
                },
                { $limit: 1 }
            ]).toArray();

            if (atlasResults.length > 0) {
                return res.json({
                    result: atlasResults[0],
                    searchMethod: 'questionText',
                    originalQuestion: questionText
                });
            }
        }

        // --------------------------------------
        // 4. Fuzzy search fallback
        // --------------------------------------
        if (!result && questionText) {
            console.log("Trying fuzzy search for:", questionText);

            const found = await fuzzySearch(collection, questionText, {
                tokenMatchThreshold: 0.7,
                minSimilarity: 0.6,
                candidateLimit: 50
            });

            if (found) {
                result = found.result;
                console.log("Found via fuzzy search:", result);
            }
        }

        // If we have a DB result, return it
        if (result) {
            result.searchMethod = 'questionText';
            result.originalQuestion = questionText;
            console.log("Final search result:", result);
            return res.json({ result });
        }

        // No DB result found - try AI fallback

        // Always try AI fallback when DB search fails
        if (questionText) {
            if (!aiProvider || !modelName) {
                console.warn('AI provider not configured. Returning 404.');
                return res.status(404).json({ error: 'No matching question found and AI is not configured' });
            }

            console.log(`Using AI (${aiProvider}) to answer questionText:`, questionText);
            let aiResponse;
            try {
                if (aiProvider.toLowerCase().includes('gemini')) {
                    aiResponse = await callGemini(questionText, answerChoice, modelName, MASTER_PROMPT);
                    console.log('Gemini response received');
                } else if (aiProvider.toLowerCase().includes('ollama')) {
                    aiResponse = await callOllama(questionText, answerChoice, modelName, MASTER_PROMPT);
                    console.log('Ollama response received');
                } else {
                    console.warn('Unknown AI provider:', aiProvider);
                    return res.status(500).json({ error: 'Unknown AI provider configured' });
                }

                if (!aiResponse) {
                    console.warn('AI returned no response');
                    return res.status(404).json({ error: 'AI provider returned no response' });
                }

                // Normalize AI response into { answers: [...] }
                let aiAnswerObj = null;
                if (typeof aiResponse === 'string') {
                    const answers = aiResponse.split(/\r?\n|(?<=\d[\.\)])\s*/)
                        .map(a => a.trim())
                        .filter(a => a);
                    aiAnswerObj = { answers };
                } else if (Array.isArray(aiResponse)) {
                    aiAnswerObj = { answers: aiResponse };
                } else {
                    aiAnswerObj = aiResponse;
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
                        aiAnswer: aiAnswerObj || null
                    }
                ]);

            } catch (err) {
                console.error('AI provider error:', err);
                return res.status(500).json({ 
                    error: 'AI provider error',
                    details: err.message
                });
            }
        }

        // No question text provided and no ID match
        return res.status(400).json({ error: 'No valid question text or ID provided' });

    } catch (error) {
        console.error("Error accessing DB:", error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;