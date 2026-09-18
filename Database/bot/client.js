const { Client, GatewayIntentBits } = require('discord.js');
const fetchMessage = require('../fetch/fetch');
const { listenForNewMessages } = require('../fetch/fetch');

const channelId = process.env.CHANNEL_ID;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

let listenerSetup = false;
let initialFetchDone = false;

const onClientReady = async () => {
    // Defensive: discord.js can occasionally fire 'ready' more than once on
    // reconnects. Don't re-run the backfill or attach duplicate listeners.
    if (initialFetchDone) {
        console.log('Client ready fired again (reconnect?). Skipping initial fetch.');
        return;
    }
    initialFetchDone = true;

    console.log(`Logged in as ${client.user?.tag}`);

    if (!channelId) {
        console.error('CHANNEL_ID is not set. Cannot fetch or listen.');
        return;
    }

    try {
        console.log('channelId:', channelId);
        console.log('Starting initial fetch of messages...');
        await fetchMessage(client, channelId);
        console.log('Initial fetch complete. Starting real-time message listener...');

        if (!listenerSetup) {
            listenForNewMessages(client, channelId);
            listenerSetup = true;
            console.log('Real-time message listener is now active.');
        }

        client.emit('fetchAndListenerReady');
    } catch (err) {
        console.error('Error during fetch:', err);
        // Still emit so the readiness promise resolves and the parent flow continues.
        client.emit('fetchAndListenerReady');
    }
};

// Pick the correct event name based on installed discord.js version.
let eventName = 'ready';
try {
    const { version } = require('discord.js');
    const major = Number(version.split('.')[0]);
    if (!Number.isNaN(major) && major >= 14) eventName = 'clientReady';
} catch (_err) {
    // fall back to 'ready'
}

client.once(eventName, onClientReady);

module.exports = client;
module.exports.isListenerSetup = () => listenerSetup;