// searchEngine.js
const { fuzzySearch } = require('./searchUtils');

// ---- MongoDB TEXT SEARCH ----
async function textSearch(collection, query) {
    if (!query || !query.trim()) return null;

    try {
        const results = await collection.find(
            { $text: { $search: query } },
            { projection: { score: { $meta: "textScore" } } }
        )
        .sort({ score: { $meta: "textScore" } })
        .limit(1)
        .toArray();

        if (results.length > 0) {
            return { method: "text", result: results[0] };
        }
    } catch (e) {
        console.warn("⚠ textSearch failed:", e.message);
    }

    return null;
}


// ---- SMART SEARCH (text first, fuzzy fallback) ----
async function smartSearch(collection, questionText) {

    // 1. try fast, optimized MongoDB $text search
    const textResult = await textSearch(collection, questionText);
    if (textResult) return textResult;

    // 2. fallback to fuzzy search (for code, formulas, typos, etc.)
    const fuzzyResult = await fuzzySearch(collection, questionText, {
        minSimilarity: 0.45,
        noiseWindow: 50,
        minSignificantTokenLength: 3,
        tokenMatchThreshold: 0.6,
        candidateLimit: 100
    });

    if (fuzzyResult) return fuzzyResult;

    // 3. nothing matched
    return null;
}

module.exports = { textSearch, smartSearch };
