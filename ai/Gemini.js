const { GoogleGenAI } = require("@google/genai");
const gemini = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

async function callGemini(question, answerChoice, model, prompt) {
    let MASTER_PROMPT = `${prompt} ${question}`;
    if (answerChoice) {
        MASTER_PROMPT += `\nAnswer Choices: ${answerChoice}`;
    }

    console.log("Calling Gemini with prompt:", MASTER_PROMPT);
    try {
        const response = await gemini.models.generateContent({
            model: model,
            contents: MASTER_PROMPT
        });
        //console.log("Gemini response:", response);
        //console.log(response.text);
        return response.text;
    } catch (error) {
        console.error("Error calling Gemini:", error);
        throw error;
    }
}

module.exports = { gemini, callGemini };