const { MongoClient } = require('mongodb');
const mongoose = require('mongoose');

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);

let questionsCollection;

/**
 * Connect both the native MongoClient (used by some parts of the app)
 * and mongoose (used by Mongoose models). Resolves when both are ready.
 */
async function connectDB() {
  // Connect native MongoDB client
  await client.connect();
  const db = client.db();
  questionsCollection = db.collection('mgapogiv3');
  await questionsCollection.createIndex({ questionId: 1 });
  await questionsCollection.createIndex({ Question: 1 });

  // Connect mongoose using the same URI so Mongoose models are ready
  // Connect mongoose (modern mongoose & driver ignore useNewUrlParser/useUnifiedTopology)
  await mongoose.connect(uri);
}

function getQuestionsCollection() {
  if (!questionsCollection) throw new Error('DB not connected');
  return questionsCollection;
}

module.exports = { connectDB, getQuestionsCollection };