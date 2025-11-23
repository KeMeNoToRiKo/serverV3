// improved fuzzy search (replace your previous file with this)
const DEFAULT_OPTIONS = {
    tokenMatchThreshold: 0.6,
    candidateLimit: 50,
    noiseWindow: 12,
    minSimilarity: 0.45,
    minSignificantTokenLength: 3,
    positionWeight: 0.1,
    debug: false
};

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalize = (s) => {
    if (!s) return '';
    // remove URLs
    const noUrls = s.replace(/https?:\/\/\S+/g, '');
    // Insert spaces before CamelCase / digit+Upper transitions
    let cleaned = noUrls
        .replace(/\(/g, ' ')
        .replace(/\)/g, ' ')
        // replace any non-word except underscore, equals, slash, ϵ
        .replace(/[^\w\s_=/ϵ]+/g, ' ')
        // insert spaces in camelCase / digitUpper transitions
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2');

    // collapse whitespace and lowercase
    return cleaned.replace(/\s+/g, ' ').trim().toLowerCase();
};

// Split camel/case or snake_case tokens into meaningful parts
function tokenVariants(token) {
    if (!token) return [];
    const variants = new Set();
    const t = token.trim().toLowerCase();
    variants.add(t);

    // split on underscores and non-alnum boundaries
    t.split(/[\W_]+/).forEach(part => {
        if (!part) return;
        variants.add(part);
        // split camelCase inside parts (if any)
        const camelParts = part.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/\s+/);
        camelParts.forEach(cp => cp && variants.add(cp.toLowerCase()));
    });

    // also include a flattened alphanumeric version (remove anything not a-z0-9)
    const flat = t.replace(/[^a-z0-9]/g, '');
    if (flat) variants.add(flat);

    return Array.from(variants).filter(Boolean);
}

// Levenshtein - unchanged (keeps correctness; could be optimized if needed)
function levenshteinDistance(a, b) {
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    const matrix = Array.from({ length: b.length + 1 }, (_, j) =>
        Array.from({ length: a.length + 1 }, (_, i) => (j === 0 ? i : i === 0 ? j : 0))
    );

    for (let j = 1; j <= b.length; j++) {
        for (let i = 1; i <= a.length; i++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[j][i] = Math.min(
                matrix[j][i - 1] + 1,
                matrix[j - 1][i] + 1,
                matrix[j - 1][i - 1] + cost
            );
        }
    }
    return matrix[b.length][a.length];
}

function similarityRatio(s1, s2) {
    const maxLen = Math.max(s1.length, s2.length);
    if (maxLen === 0) return 1.0;
    return (maxLen - levenshteinDistance(s1, s2)) / maxLen;
}

async function fuzzySearch(collection, questionText, userOptions = {}) {
    const options = { ...DEFAULT_OPTIONS, ...userOptions };
    const {
        tokenMatchThreshold,
        candidateLimit,
        noiseWindow,
        minSimilarity,
        minSignificantTokenLength,
        positionWeight,
        debug
    } = options;

    const normalizedQuery = normalize(questionText);
    if (debug) console.log("Normalized query:", normalizedQuery);

    // Strategy 1: exact case-insensitive match on the original field (fast path)
    try {
        const exactEscaped = escapeRegex(questionText || '');
        if (exactEscaped) {
            const result = await collection.findOne({
                Question: { $regex: `^${exactEscaped}$`, $options: 'i' }
            });
            if (result) return { method: 'exact', result };
        }
    } catch (err) {
        if (debug) console.warn("Exact-match query failed:", err.message);
    }

    if (!normalizedQuery) return null;

    // Get tokens and expand variants
    const tokens = normalizedQuery.split(' ').filter(Boolean);
    let expandedTokens = [];
    tokens.forEach(t => expandedTokens.push(...tokenVariants(t)));
    // dedupe while preserving approximate order
    expandedTokens = Array.from(new Set(expandedTokens));
    // keep tokens that meet minimal length (but allow small tokens if requested)
    const significantTokens = expandedTokens.filter(t => t.length >= minSignificantTokenLength);

    if (significantTokens.length === 0 && tokens.length > 0) {
        // fallback: try tokens of length >= 3
        significantTokens.push(...tokens.filter(t => t.length >= 3));
    }

    if (significantTokens.length === 0) return null;

    // Strategy 2: single token boundary match (use variants for robustness)
    if (significantTokens.length === 1) {
        const single = significantTokens[0];
        const variants = tokenVariants(single);
        for (const v of variants) {
            const escaped = escapeRegex(v);
            // Use word boundary \b for typical word boundaries (works for letters/digits/underscore)
            const regex = `\\b${escaped}\\b`;
            const r = await collection.findOne({ Question: { $regex: regex, $options: 'i' } });
            if (r) return { method: 'token', result: r };
        }
    }

    // Strategy 3: ordered fuzzy regex with a noise window (build from primary token words)
    if (significantTokens.length > 1) {
        const pieces = significantTokens.map(t => escapeRegex(t));
        const fuzzy = pieces.join(`.{0,${noiseWindow}}`);
        try {
            const r = await collection.findOne({ Question: { $regex: fuzzy, $options: 'i' } });
            if (r) return { method: 'fuzzy_regex', result: r };
        } catch (err) {
            if (debug) console.warn("fuzzy_regex failed:", err.message);
        }
    }

    // Strategy 4: token scoring - get candidate docs that match any token variant
    if (debug) console.log("Advanced token scoring for:", significantTokens);

    // Build tokenChecks: for each significant token include regex checks for its variants
    const tokenChecks = [];
    significantTokens.forEach(t => {
        const variants = tokenVariants(t);
        variants.forEach(v => {
            const esc = escapeRegex(v);
            tokenChecks.push({ Question: { $regex: `\\b${esc}\\b`, $options: 'i' } });
            // also allow substring match for short meaningful fragments (no word boundary)
            if (v.length >= 3) tokenChecks.push({ Question: { $regex: esc, $options: 'i' } });
        });
    });

    if (tokenChecks.length === 0) return null;

    const candidates = await collection.find({ $or: tokenChecks }).limit(candidateLimit).toArray();

    if (!candidates || candidates.length === 0) return null;

    const scored = candidates.map(doc => {
        const nq = normalize(doc.Question || '');
        const docTokens = nq.split(' ').filter(Boolean);

        // Count token hits: for each significant token check if any variant matches any docToken
        let tokensFound = 0;
        const matchedPositions = []; // list of doc token indexes for matched tokens (for positionScore)
        significantTokens.forEach((t) => {
            const variants = tokenVariants(t);
            let matched = false;
            let matchedPos = -1;

            // check each doc token for any variant match
            for (let dtIndex = 0; dtIndex < docTokens.length && !matched; dtIndex++) {
                const dt = docTokens[dtIndex];
                for (const v of variants) {
                    if (!v) continue;
                    // exact token equality
                    if (dt === v) { matched = true; matchedPos = dtIndex; break; }
                    // substring match (good for flattened/camel parts)
                    if (v.length >= 3 && dt.includes(v)) { matched = true; matchedPos = dtIndex; break; }
                    // similarity match (for short/typo'd tokens) — compare variant to doc token
                    const sim = similarityRatio(v, dt);
                    if (sim >= 0.80) { matched = true; matchedPos = dtIndex; break; }
                }
            }

            if (matched) {
                tokensFound += 1;
                matchedPositions.push(matchedPos);
            }
        });

        // Position score: higher when matched tokens appear in roughly same relative order/positions
        let positionScore = 0;
        if (matchedPositions.length > 0) {
            const docLen = Math.max(1, docTokens.length);
            // compute expected positions for the query tokens: spaced across the doc token length
            significantTokens.forEach((_, i) => {
                const pos = matchedPositions[i] !== undefined ? matchedPositions[i] : -1;
                if (pos === -1) return;
                const expectedPos = Math.floor((i / Math.max(1, significantTokens.length - 1)) * (docLen - 1));
                const diff = Math.abs(pos - expectedPos) / Math.max(1, docLen);
                positionScore += 1 - Math.min(diff, 1);
            });
            // normalize by number of significant tokens to keep 0..1
            positionScore = positionScore / Math.max(1, significantTokens.length);
        }

        // Overall similarity between entire normalized query and normalized doc (tie-breaker)
        const similarity = similarityRatio(normalizedQuery, nq);

        // Combined score: tokensFound ratio dominates, with a small position weight and a tiny similarity tie-break
        const tokenRatio = tokensFound / Math.max(1, significantTokens.length);
        const score = tokenRatio * (1 - positionWeight) + positionScore * positionWeight + similarity * 0.02;

        return { doc, score, similarity, tokensFound };
    }).sort((a, b) => b.score - a.score);

    const best = scored[0];
    const minMatch = Math.ceil(significantTokens.length * tokenMatchThreshold);

    if (best && (best.tokensFound >= minMatch || (best.score >= tokenMatchThreshold && best.similarity >= minSimilarity))) {
        return { method: 'token_scoring', result: best.doc, debug: { best } };
    }

    return null;
}

module.exports = { fuzzySearch, normalize, tokenVariants, similarityRatio };
