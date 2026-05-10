const mongoose = require('mongoose');

const AnswerSchema = new mongoose.Schema({
    Answer_Text: String,
    Answer_ID: String,
    Question_ID: String,
    Question_Type: String,
    Correct: Boolean,
    
});

const ParsedMessageSchema = new mongoose.Schema({
  Title: String,
  Question: String,
  Answer: [AnswerSchema],
  HasPartial: Boolean,
});

module.exports = mongoose.model("MgaPogiV3", ParsedMessageSchema);