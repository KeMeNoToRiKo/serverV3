const mongoose = require('mongoose');

const AnswerSchema = new mongoose.Schema({
    Answer_Text: String,
    Answer_ID: String,
    Question_ID: String,
    Question_Type: String,
    Correct: Boolean,
}, { _id: false });

const ParsedMessageSchema = new mongoose.Schema(
    {
        // NOTE: indexed but NOT unique. We rely on the atomic findOneAndUpdate
        // in fetch.js to avoid creating duplicates under concurrent writes.
        // If you ever want stricter safety, run the migration script and
        // change `unique: false` to `unique: true` here.
        Question_ID: { type: String, index: true },
        Title: String,
        Question: String,
        Answer: [AnswerSchema],
        HasPartial: Boolean,
    },
    { timestamps: true }
);

ParsedMessageSchema.index({ 'Answer.Question_ID': 1 });
ParsedMessageSchema.index({ Question: 1 });

module.exports = mongoose.model('MgaPogiV3', ParsedMessageSchema);