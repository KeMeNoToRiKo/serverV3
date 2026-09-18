// SERVER
console.log('Mga Pogi Server V3');
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const searchRoute = require('./routes/search');
const { connectDB, closeDB } = require('./db/mongo');
const { discordToDatabase } = require('./Database/database');

const app = express();
const PORT = process.env.PORT || 3000;

// If you're behind a reverse proxy (nginx, cloudflare, etc.) this is required
// for express-rate-limit to see the real client IP rather than rate-limiting
// every request as if it came from the proxy.
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Rate limit search endpoint specifically rather than the whole app, so the
// Discord ingestion side isn't affected.
app.use(
    '/search',
    rateLimit({
        windowMs: 60 * 1000,
        max: 100,
        standardHeaders: true,
        legacyHeaders: false,
        // Make abuse responses cheap and predictable.
        message: { error: 'Too many requests, please slow down.' },
    }),
    searchRoute
);

// Liveness probe (useful for orchestrators / docker healthcheck)
app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// Generic error handler — never leak stack traces to clients.
app.use((err, req, res, _next) => {
    console.error('Unhandled route error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

let server;

connectDB()
    .then(() => {
        console.log('Connected to MongoDB');

        // Start Discord -> Database processing in background.
        // Don't await so the HTTP server starts even if Discord login is slow.
        discordToDatabase().catch((err) =>
            console.error('discordToDatabase error:', err)
        );

        server = app.listen(PORT, () => {
            console.log(`Server started on http://localhost:${PORT}`);
        });
    })
    .catch((err) => {
        console.error('Error connecting to MongoDB:', err);
        process.exit(1);
    });

// Graceful shutdown: close HTTP server, then DB connections.
async function shutdown(signal) {
    console.log(`\nReceived ${signal}. Shutting down gracefully...`);
    try {
        if (server) await new Promise((r) => server.close(r));
        await closeDB();
        console.log('Shutdown complete.');
        process.exit(0);
    } catch (err) {
        console.error('Error during shutdown:', err);
        process.exit(1);
    }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Don't crash on a single unhandled rejection; log it so issues are visible.
process.on('unhandledRejection', (reason) => {
    console.error('Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
});