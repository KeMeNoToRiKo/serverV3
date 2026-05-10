import OpenAI from "openai";
const client = new OpenAI();

async function callOpenAI(question, answerChoice, model, prompt) {
    let MASTER_PROMPT = `${prompt} ${question}`;
    if (answerChoice) {
        MASTER_PROMPT += `\nAnswer Choices: ${answerChoice}`;
    }
    console.log("Calling OpenAI with prompt:", MASTER_PROMPT);

    try {
        const response = await client.responses.create({
            model: model,
            input: MASTER_PROMPT
        });

        return response.output_text;

    } catch (error) {
        console.error("Error calling OpenAI:", error);
        throw error;
    }
}


module.exports = { callOpenAI };