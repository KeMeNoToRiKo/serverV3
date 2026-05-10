async function parseMessageEmbed(message) {
    const content = message.content || '';
    const contentMatch = content.toLowerCase();

    let matchedInEmbed = false;
    let embedContent = [];
    const embeds = message.embeds || [];

    // If no embeds, return a simple object when content exists, otherwise null
    if (!embeds || embeds.length === 0) {
        if (!contentMatch) return null;
        return {
            author: message.author?.username || 'Unknown',
            content: message.content,
            timestamp: message.createdAt,
            embeds: [],
            footer: [],
            partial: false,
        };
    }

    // console.log("Embeds", embeds)

    for (const embed of embeds) {
        let partsToSearch = [];

        if (embed.title) partsToSearch.push(embed.title);
        if (embed.description) partsToSearch.push(embed.description);
        if (embed.fields?.length) {
            embed.fields.forEach(f => {
                partsToSearch.push(f.name, f.value);
            });
        }
        if (embed.footer?.text) partsToSearch.push(embed.footer.text);

        

        embedContent = embedContent.concat(partsToSearch);
        if (partsToSearch.some(text => typeof text === 'string' && text.toLowerCase().includes('question')) ) {
            matchedInEmbed = true;
        }

        }
    
    if (!matchedInEmbed && !contentMatch) return null;

        // FORMATTING

        //TITLE
        const title = embedContent[0] || '';
        //QUESTIONS
         const question = embedContent.find(e => typeof e === 'string' && e.includes('**Question:**'))?.replace('**Question:**', '').trim() || '';
        
         //ANSWER LINES
         const answerLines = embedContent
        .flatMap(e => e.split('\n'))
        .filter(line => line.includes('✅') || line.includes('❌') || line.includes('⚠️'));

        //FOOTER
        const footerText = embeds[0]?.footer?.text || '';
    const [, questionId = '', questionType = ''] = footerText.split('•').map(x => x.trim());

        const answers = answerLines.map(answer => {
            const emojiMatch = answer.match(/(✅|❌|⚠️)/);
            if (!emojiMatch) return null;

            const parts = answer.trim().split(' ');
            const answerId = parts[parts.length - 1].replace(/`/g, '');
            const answerText = parts.slice(1, parts.length - 1).join(' ').replace(/`/g, '').trim();

            const emoji = emojiMatch[0];
            // For warning emoji, mark Correct as null (unknown)
            const correct = emoji === '✅' ? true : (emoji === '❌' ? false : null);

            return {
                Answer_Text: answerText,
                Answer_ID: answerId,
                Question_ID: questionId,
                Question_Type: questionType,
                Correct: correct,
                _rawEmoji: emoji,
            };
        }).filter(Boolean);

        const hasWarning = answers.some(a => a._rawEmoji === '⚠️');

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