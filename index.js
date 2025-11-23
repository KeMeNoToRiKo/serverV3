//SERVER
console.log("Mga Pogi Server V3");
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const ratelimit = require('express-rate-limit');
const searchRoute = require('./routes/search');

//Database

const mongoose = require('mongoose');
const { connectDB } = require('./db/mongo');
const { discordToDatabase } = require('./Database/database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(ratelimit({ windowMs: 60 * 1000, max: 100 }));
app.use(express.json());
app.use('/search', searchRoute);

connectDB().then(() => {
  console.log('Connected to MongoDB');

  // Start Discord -> Database processing in background. Do not await so server keeps serving HTTP requests.
  discordToDatabase().catch(err => console.error('discordToDatabase error:', err));


  app.listen(PORT, () => {
    console.log(`Server started on http://localhost:${PORT}`);
  });

}).catch((err) => {
    console.error('Error connecting to MongoDB:', err);
    process.exit(1);
});

