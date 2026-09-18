const { callGemini } = require('../ai/Gemini');
const { callOllama } = require('../ai/ollama');
const { callOpenAI } = require('../ai/openai');

async function searchAi(questionText, answerChoices, aiProvider, modelName, masterPrompt) {
    const provider = (aiProvider || '').toLowerCase();
    if (provider.includes('gemini')) {
        return callGemini(questionText, answerChoices, modelName, masterPrompt);
    } else if (provider.includes('ollama')) {
        return callOllama(questionText, answerChoices, modelName, masterPrompt);
    } else if (provider.includes('openai')) {
        return callOpenAI(questionText, answerChoices, modelName, masterPrompt);
    } else {
        throw new Error(`Unknown AI provider: ${aiProvider}`);
    }
}

module.exports = { searchAi };
