const { ObjectId } = require('mongodb');
const { getDB } = require('../config/db');

// POST /api/sales
// Body: { product, quantity, unitPrice, mode }  mode: income|credit|debt
async function createSale(req, res) {
  const { product, quantity, unitPrice, mode } = req.body;

  const name = (product || '').trim();
  const qty = Number(quantity) || 0;
  const price = Number(unitPrice) || 0;

  if (!name) return res.status(400).json({ error: 'product is required' });
  if (!['income', 'credit', 'debt'].includes(mode)) {
    return res.status(400).json({ error: 'mode must be income, credit, or debt' });
  }

  const db = getDB();
  const userId = new ObjectId(req.userId);
  const today = new Date().toISOString().slice(0, 10);
  const amount = qty * price;

  try {
    const products = db.collection('products');
    const productDoc = await products.findOne({ userId, name });
    let productId;

    if (productDoc) {
      productId = productDoc._id;
      const newQty = Math.max(Number(productDoc.quantityInStock) - qty, 0);
      const update = { $set: { quantityInStock: newQty, lastSoldAt: today, updatedAt: new Date() } };
      if (price > 0) update.$set.unitPrice = price;
      await products.updateOne({ _id: productId }, update);
    } else {
      // Product sold without a prior stock record — still log it so it
      // shows up in insights (will read "out of stock").
      const result = await products.insertOne({
        userId, name, quantityInStock: 0, unitCost: 0, unitPrice: price,
        lastRestockedAt: null, lastSoldAt: today,
        createdAt: new Date(), updatedAt: new Date()
      });
      productId = result.insertedId;
    }

    const saleResult = await db.collection('sales').insertOne({
      userId, productId, mode, quantity: qty, unitPrice: price, amount,
      entryDate: today, createdAt: new Date()
    });

    // Update the Ingenzi Score streak (mirrors the frontend's own +2/-2 rule)
    const scoreState = db.collection('scoreState');
    const scoreRow = await scoreState.findOne({ userId });

    if (scoreRow) {
      if (!scoreRow.lastRecordedDate) {
        await scoreState.updateOne(
          { userId },
          { $set: { lastRecordedDate: today, currentStreak: 1 } }
        );
      } else {
        const last = new Date(scoreRow.lastRecordedDate);
        const diffDays = Math.round((new Date(today) - last) / 86400000);

        if (diffDays === 1) {
          const newScore = Math.min(100, scoreRow.score + 2);
          await scoreState.updateOne(
            { userId },
            { $set: { score: newScore, lastRecordedDate: today }, $inc: { currentStreak: 1 } }
          );
        } else if (diffDays > 1) {
          const newScore = Math.max(0, scoreRow.score - 2);
          await scoreState.updateOne(
            { userId },
            { $set: { score: newScore, lastRecordedDate: today, currentStreak: 1 } }
          );
        }
        // diffDays === 0 (already recorded today): no change
      }
    }

    return res.status(201).json({ id: saleResult.insertedId, message: 'Sale recorded' });
  } catch (err) {
    console.error('Create sale error:', err);
    return res.status(500).json({ error: 'Server error recording sale' });
  }
}

// GET /api/sales?from=&to=&mode=
async function getSales(req, res) {
  const { from, to, mode } = req.query;
  const db = getDB();
  const userId = new ObjectId(req.userId);

  const filter = { userId };
  if (from || to) {
    filter.entryDate = {};
    if (from) filter.entryDate.$gte = from;
    if (to) filter.entryDate.$lte = to;
  }
  if (mode) filter.mode = mode;

  try {
    const sales = await db.collection('sales').find(filter).sort({ entryDate: -1, _id: -1 }).toArray();

    const productIds = [...new Set(sales.map(s => s.productId.toString()))].map(id => new ObjectId(id));
    const products = productIds.length
      ? await db.collection('products').find({ _id: { $in: productIds } }).toArray()
      : [];
    const nameById = new Map(products.map(p => [p._id.toString(), p.name]));

    const enriched = sales.map(s => ({ ...s, productName: nameById.get(s.productId.toString()) }));
    return res.json(enriched);
  } catch (err) {
    console.error('Get sales error:', err);
    return res.status(500).json({ error: 'Server error fetching sales' });
  }
}

// GET /api/sales/score — for the Ingenzi Score ring
async function getScore(req, res) {
  try {
    const db = getDB();
    const userId = new ObjectId(req.userId);
    const row = await db.collection('scoreState').findOne({ userId });
    if (!row) return res.json({ score: 0, currentStreak: 0, lastRecordedDate: null });
    return res.json({
      score: row.score,
      currentStreak: row.currentStreak,
      lastRecordedDate: row.lastRecordedDate
    });
  } catch (err) {
    console.error('Get score error:', err);
    return res.status(500).json({ error: 'Server error fetching score' });
  }
}

module.exports = { createSale, getSales, getScore };
