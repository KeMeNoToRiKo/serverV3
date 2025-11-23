const axios = require('axios');

async function callOllama(question, answerChoice, model, prompt) {
    let MASTER_PROMPT = `${prompt} ${question}`;
    if (answerChoice) {
        MASTER_PROMPT += `\nAnswer Choices: ${answerChoice}`;
    }

    console.log("Calling Ollama with prompt:", MASTER_PROMPT);
    try {
        const response = await axios.post('http://localhost:11434/api/generate', {
            model: model,
            prompt: MASTER_PROMPT,
            stream: false
        });
        //console.log("Ollama response:", response.data.response);
        return response.data.response;
    } catch (error) {
        console.error("Error calling Ollama:", error);
        throw error;
    }
}

module.exports = { callOllama };