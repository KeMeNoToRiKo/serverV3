const OpenAI = require('openai');

const client = new OpenAI();

async function callOpenAI(question, answerChoice, model, prompt) {
    let MASTER_PROMPT = `${prompt} ${question}`;
    if (answerChoice) {
        MASTER_PROMPT += `\nAnswer Choices: ${answerChoice}`;
    }
    console.log('Calling OpenAI with prompt:', MASTER_PROMPT);

    try {
        const response = await client.chat.completions.create({
            model: model,
            messages: [{ role: 'user', content: MASTER_PROMPT }],
        });

        return response.choices[0]?.message?.content ?? null;
    } catch (error) {
        console.error('Error calling OpenAI:', error);
        throw error;
    }
}

module.exports = { callOpenAI };
