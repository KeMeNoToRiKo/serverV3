const {Client, GatewayIntentBits} = require('discord.js');
const fetchMessage = require('../fetch/fetch');
const channelId = process.env.CHANNEL_ID;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

// Handler used when the client is ready
const onClientReady = async () => {
    console.log(`Logged in as ${client.user?.tag}`);
    try {
        console.log("channelId: ", channelId);
        await fetchMessage(client, channelId);
        console.log('Fetch complete. Destroying client...');
        client.destroy();
        client.emit('destroyed');
    } catch (err) {
        console.error('Error during fetch:', err);
        client.destroy();
        client.emit('destroyed');
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