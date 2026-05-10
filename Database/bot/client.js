const {Client, GatewayIntentBits} = require('discord.js');
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

// Store whether listener has been set up
let listenerSetup = false;

const onClientReady = async () => {
    console.log(`Logged in as ${client.user?.tag}`);
    try {
        console.log("channelId: ", channelId);
        console.log('Starting initial fetch of messages...');
        await fetchMessage(client, channelId);
        console.log('Initial fetch complete. Starting real-time message listener...');
        
        // Set up listener for new messages (only after fetch is completely done)
        listenForNewMessages(client, channelId);
        listenerSetup = true;
        console.log('Real-time message listener is now active.');
        
        // Emit custom event to signal completion
        client.emit('fetchAndListenerReady');
    } catch (err) {
        console.error('Error during fetch:', err);
    }
};

// Pick the correct event name based on installed discord.js version to avoid deprecation warnings
let eventName = 'ready';
try {
    const { version } = require('discord.js');
    const major = Number(version.split('.')[0]);
    // In discord.js v14+ the 'clientReady' event is available and using it avoids the deprecation warning
    if (!isNaN(major) && major >= 14) eventName = 'clientReady';
} catch (err) {
    // If we can't read the version, default to 'ready'
}

client.once(eventName, onClientReady);

module.exports = client;
module.exports.isListenerSetup = () => listenerSetup;