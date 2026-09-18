const mongoose = require('mongoose');

const lastFetchedIdSchema = new mongoose.Schema(
    {
        key: { type: String, required: true, unique: true, index: true },
        value: { type: String, required: true },
    },
    { timestamps: true }
);

module.exports = mongoose.model('LastFetchedId', lastFetchedIdSchema);