const { MongoClient } = require('mongodb');
const mongoose = require('mongoose');
const EventEmitter = require('events');

const uri = process.env.MONGO_URI;

// Fail fast on disconnect so callers can enter listening/retry mode quickly
// instead of hanging for the default 30 s.
const SERVER_SELECTION_TIMEOUT_MS = 8_000;

// Connection pool tuned for concurrent reads (search) + writes (Discord listener).
// maxPoolSize 50 is plenty for a single Node process and prevents one slow query
// from starving the rest. minPoolSize keeps a few warm connections.
const client = new MongoClient(uri, {
    maxPoolSize: 50,
    minPoolSize: 5,
    retryWrites: true,
    retryReads: true,
    serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
});

let questionsCollection = null;
let _isConnected = false;

const dbEvents = new EventEmitter();
dbEvents.setMaxListeners(100);

async function connectDB() {
    if (!uri) {
        throw new Error('MONGO_URI is not set in environment variables');
    }

    // Connect native MongoDB client
    await client.connect();
    const db = client.db();
    questionsCollection = db.collection('mgapogiv3');

    // Connect mongoose using the same URI
    await mongoose.connect(uri, {
        maxPoolSize: 50,
        minPoolSize: 5,
        retryWrites: true,
        serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
    });

    _isConnected = true;

    // Track live connection state so the search route can react without waiting
    // for a full serverSelectionTimeout on every dropped-connection request.
    mongoose.connection.on('connected', () => {
        if (!_isConnected) {
            _isConnected = true;
            console.log('[DB] Reconnected to MongoDB');
            dbEvents.emit('reconnected');
        }
    });
    mongoose.connection.on('disconnected', () => {
        _isConnected = false;
        console.warn('[DB] Disconnected from MongoDB');
        dbEvents.emit('disconnected');
    });

    // Ensure all mongoose-defined indexes (including the unique Question_ID index
    // declared in schema.js) are actually built before we accept any writes.
    // syncIndexes drops indexes that no longer exist in the schema and creates
    // new ones — safe to call on every startup.
    const ParsedMessage = require('../Database/models/schema');
    const LastFetchedId = require('../Database/models/lastFetchedId');
    await Promise.all([
        ParsedMessage.syncIndexes(),
        LastFetchedId.syncIndexes(),
    ]);

    return { db, client };
}

function getQuestionsCollection() {
    if (!questionsCollection) throw new Error('DB not connected');
    return questionsCollection;
}

function isConnected() {
    return _isConnected;
}

// Returns a promise that resolves when the DB reconnects, or rejects after
// timeoutMs if it never does. Resolves immediately if already connected.
function waitForReconnect(timeoutMs = 30_000) {
    if (_isConnected) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            dbEvents.removeListener('reconnected', onReconnect);
            reject(new Error('Timed out waiting for DB reconnect'));
        }, timeoutMs);
        function onReconnect() {
            clearTimeout(timer);
            resolve();
        }
        dbEvents.once('reconnected', onReconnect);
    });
}

async function closeDB() {
    await Promise.allSettled([client.close(), mongoose.connection.close()]);
}

module.exports = { connectDB, getQuestionsCollection, closeDB, isConnected, waitForReconnect };