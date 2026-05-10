function discordToDatabase() {
    const client = require('./bot/client');
    const { getTodaysBibleVerse } = require('../utils/bible');

    // Return a promise that resolves after initial fetch and listener setup are complete
    return new Promise(async (resolve) => {
        const token = process.env.DISCORD_TOKEN || process.env.BOT_TOKEN;
        if (!token) {
            console.error('Discord token not set. Please set DISCORD_TOKEN in .env');
            resolve();
            return;
        }

        try {
            // Listen for the custom event that signals fetch AND listener are ready
            client.once('fetchAndListenerReady', async () => {
                // Clear console and display startup message AFTER fetch is completely done
                console.clear();
                console.log("MgaPogi Server V3");
                console.log("Version: 3.0.1");
                console.log();
                console.log("Today's Bible Verse:");
                
                // Wait for the Bible verse to load
                const verseData = await getTodaysBibleVerse();
                if (verseData) {
                    console.log(`${verseData.text} — ${verseData.reference}`);
                }
                console.log("Thanks be to God!");
                console.log();
                console.log("Server is running...");
                console.log("Discord client is connected and monitoring for new messages.");
                
                // Now resolve the promise
                resolve();
            });

            await client.login(token);
            console.log("Starting Discord to Database process...");
        } catch (err) {
            console.error('Failed to login Discord client:', err);
            resolve();
        }
    });
}

module.exports = { discordToDatabase };