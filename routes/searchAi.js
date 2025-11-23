async function searchAi(questionText, answerChoices, aiProvider, modelName) {
    if (aiProvider === 'gemini') {
        return callGemini(questionText, answerChoices, modelName);
    } else if (aiProvider === 'ollama') {
        return callOllama(questionText, answerChoices, modelName);
    } else {
        throw new Error(`Unknown AI provider: ${aiProvider}`);
    }
}

module.exports = { searchAi };