const { MongoClient } = require('mongodb');
require('dotenv').config();

const client = new MongoClient(process.env.MONGODB_URI);
let db;

/**
 * Connects to MongoDB Atlas and ensures required indexes exist.
 * Call this once at startup, before the server begins listening.
 */
async function connectDB() {
  if (db) return db;

  await client.connect();
  db = client.db(process.env.MONGODB_DB_NAME || 'ingenzi_ledger');
  console.log('Connected to MongoDB');

  // A phone number can only belong to one account; a product name is
  // unique per user; each user has exactly one score_state document.
  await db.collection('users').createIndex({ telNumber: 1 }, { unique: true });
  await db.collection('products').createIndex({ userId: 1, name: 1 }, { unique: true });
  await db.collection('scoreState').createIndex({ userId: 1 }, { unique: true });

  return db;
}

/**
 * Returns the connected database handle. Throws if connectDB() hasn't
 * run yet — this should never happen in normal operation since server.js
 * awaits connectDB() before mounting any routes.
 */
function getDB() {
  if (!db) throw new Error('Database not connected yet. Call connectDB() first.');
  return db;
}

module.exports = { connectDB, getDB };