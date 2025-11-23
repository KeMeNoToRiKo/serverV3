function discordToDatabase() {
    const client = require('./bot/client');
    const { getTodaysBibleVerse } = require('../utils/bible');

    // Return a promise that resolves when the client is destroyed so callers may await if they want.
    return new Promise(async (resolve) => {
        client.once('destroyed', () => {
            console.log('Client destroyed. Discord-to-database task finished.');
            //console.clear(); // Clear the console screen
            console.log("MgaPogi Server V3");
            console.log();
            console.log("Today's Bible Verse:");
            getTodaysBibleVerse().then(verseData => {
                if (verseData) {
                    console.log(`${verseData.text} — ${verseData.reference}`);
                }
                console.log("Thanks be to God!");
                console.log();
                console.log("Server is running...");
                // Do not exit the process here; resolve the promise so the caller can handle continuation.
                resolve();
            });
        });

        const token = process.env.DISCORD_TOKEN || process.env.BOT_TOKEN;
        if (!token) {
            console.error('Discord token not set. Please set DISCORD_TOKEN in .env');
            resolve();
            return;
        }

        try {
            await client.login(token);
            console.log("Starting Discord to Database process...");
        } catch (err) {
            console.error('Failed to login Discord client:', err);
            resolve();
        }
    });
}

module.exports = { discordToDatabase };