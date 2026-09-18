/**
 * embedParser.js
 * Parses a Discord message (with embeds) into structured Q&A data.
 *
 * Returns null when the message carries no recognisable question/answer content.
 */
async function parseMessageEmbed(message) {
    const content = message.content || '';
    const contentLower = content.toLowerCase();

    const embeds = message.embeds || [];

    // No embeds — return minimal content object or null.
    if (embeds.length === 0) {
        if (!contentLower) return null;
        return {
            author: message.author?.username || 'Unknown',
            content: message.content,
            timestamp: message.createdAt,
            embeds: [],
            footer: [],
            partial: false,
        };
    }

    // Collect all text parts from every embed and check for a question marker.
    let embedContent = [];
    let matchedInEmbed = false;

    for (const embed of embeds) {
        const partsToSearch = [];

        if (embed.title) partsToSearch.push(embed.title);
        if (embed.description) partsToSearch.push(embed.description);
        if (embed.fields?.length) {
            embed.fields.forEach((f) => partsToSearch.push(f.name, f.value));
        }
        if (embed.footer?.text) partsToSearch.push(embed.footer.text);

        embedContent = embedContent.concat(partsToSearch);

        if (partsToSearch.some((text) => typeof text === 'string' && text.toLowerCase().includes('question'))) {
            matchedInEmbed = true;
        }
    }

    if (!matchedInEmbed && !contentLower) return null;

    // ── Formatting ──────────────────────────────────────────────────────────

    // Title: first element of the collected embed parts.
    const title = embedContent[0] || '';

    // Question: the line tagged with **Question:**.
    const question =
        embedContent
            .find((e) => typeof e === 'string' && e.includes('**Question:**'))
            ?.replace('**Question:**', '')
            .trim() || '';

    // Answer lines: lines containing a result emoji.
    const answerLines = embedContent
        .flatMap((e) => e.split('\n'))
        .filter((line) => line.includes('✅') || line.includes('❌') || line.includes('⚠️'));

    // Footer: "• <Question_ID> • <Question_Type>"
    const footerText = embeds[0]?.footer?.text || '';
    const [, questionId = '', questionType = ''] = footerText.split('•').map((x) => x.trim());

    // Parse each answer line into a structured object.
    const answers = answerLines
        .map((answer) => {
            const emojiMatch = answer.match(/(✅|❌|⚠️)/);
            if (!emojiMatch) return null;

            const parts = answer.trim().split(' ').filter(Boolean);
            if (parts.length < 2) return null; // guard: need at least emoji + answer ID

            const answerId = parts[parts.length - 1].replace(/`/g, '');
            const answerText = parts.slice(1, parts.length - 1).join(' ').replace(/`/g, '').trim();

            const emoji = emojiMatch[0];
            const correct = emoji === '✅' ? true : emoji === '❌' ? false : null;

            return {
                Answer_Text: answerText,
                Answer_ID: answerId,
                Question_ID: questionId,
                Question_Type: questionType,
                Correct: correct,
                _rawEmoji: emoji,
            };
        })
        .filter(Boolean);

    const hasWarning = answers.some((a) => a._rawEmoji === '⚠️');

    return {
        Title: title,
        Question: question,
        Answer: answers,
        Question_ID: questionId || null,
        Question_Type: questionType || null,
        partial: hasWarning || null,
    };
}

module.exports = parseMessageEmbed;
