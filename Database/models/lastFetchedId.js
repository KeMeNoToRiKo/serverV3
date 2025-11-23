const mongoose = require('mongoose');

const lastFetchedIdSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: String, required: true }
});

const LastFetchedId = mongoose.model('LastFetchedId', lastFetchedIdSchema);

module.exports = LastFetchedId;
