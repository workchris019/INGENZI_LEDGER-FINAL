const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');
const { getDB } = require('../config/db');

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '180d'
  });
}

function toPublicUser(doc) {
  return {
    id: doc._id.toString(),
    ownerName: doc.ownerName,
    idNumber: doc.idNumber,
    telNumber: doc.telNumber,
    businessName: doc.businessName,
    regNumber: doc.regNumber,
    tinNumber: doc.tinNumber,
    businessType: doc.businessType,
    location: doc.location,
    languagePref: doc.languagePref
  };
}

// POST /api/auth/register
async function register(req, res) {
  const {
    ownerName, idNumber, telNumber,
    businessName, regNumber, tinNumber, businessType, location,
    pin
  } = req.body;

  const required = { ownerName, idNumber, telNumber, businessName, regNumber, tinNumber, businessType, location, pin };
  for (const [key, value] of Object.entries(required)) {
    if (!value || String(value).trim() === '') {
      return res.status(400).json({ error: `${key} is required` });
    }
  }

  if (!/^\d{4}$/.test(pin)) {
    return res.status(400).json({ error: 'PIN must be exactly 4 digits' });
  }

  try {
    const db = getDB();
    const users = db.collection('users');

    const existing = await users.findOne({ telNumber });
    if (existing) {
      return res.status(409).json({ error: 'An account with this phone number already exists' });
    }

    const pinHash = await bcrypt.hash(pin, 10);
    const now = new Date();

    const result = await users.insertOne({
      ownerName, idNumber, telNumber, businessName, regNumber, tinNumber,
      businessType, location, pinHash, languagePref: 'eng',
      createdAt: now, updatedAt: now
    });

    const userId = result.insertedId;

    await db.collection('scoreState').insertOne({
      userId, score: 0, currentStreak: 0, lastRecordedDate: null
    });

    const token = signToken(userId.toString());
    const userDoc = await users.findOne({ _id: userId });

    return res.status(201).json({ token, user: toPublicUser(userDoc) });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Server error during registration' });
  }
}

// POST /api/auth/login
async function login(req, res) {
  const { telNumber, pin } = req.body;

  if (!telNumber || !pin) {
    return res.status(400).json({ error: 'telNumber and pin are required' });
  }

  try {
    const db = getDB();
    const user = await db.collection('users').findOne({ telNumber });
    if (!user) {
      return res.status(401).json({ error: 'Invalid phone number or PIN' });
    }

    const match = await bcrypt.compare(pin, user.pinHash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid phone number or PIN' });
    }

    const token = signToken(user._id.toString());
    return res.json({ token, user: toPublicUser(user) });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Server error during login' });
  }
}

// GET /api/auth/me
async function me(req, res) {
  try {
    const db = getDB();
    const user = await db.collection('users').findOne({ _id: new ObjectId(req.userId) });
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json({ user: toPublicUser(user) });
  } catch (err) {
    console.error('Me error:', err);
    return res.status(500).json({ error: 'Server error fetching profile' });
  }
}

module.exports = { register, login, me };
