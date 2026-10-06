const { ObjectId } = require('mongodb');
const { getDB } = require('../config/db');

// POST /api/stock
// Body: { rows: [{ product, quantity, unitPrice }, ...] }
// unitPrice here is the COST price. Each row creates the product if new,
// adds to quantityInStock, updates unitCost, and logs a stockMovements doc.
async function saveStock(req, res) {
  const { rows } = req.body;

  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'rows must be a non-empty array' });
  }

  const db = getDB();
  const products = db.collection('products');
  const stockMovements = db.collection('stockMovements');
  const userId = new ObjectId(req.userId);
  const today = new Date().toISOString().slice(0, 10);
  const saved = [];

  try {
    for (const row of rows) {
      const name = (row.product || '').trim();
      const quantity = Number(row.quantity) || 0;
      const unitCost = Number(row.unitPrice) || 0;
      if (!name || quantity <= 0) continue; // skip incomplete rows, mirrors frontend's own filter

      const amount = quantity * unitCost;
      const existing = await products.findOne({ userId, name });

      let productId;
      if (existing) {
        productId = existing._id;
        await products.updateOne(
          { _id: productId },
          {
            $inc: { quantityInStock: quantity },
            $set: { unitCost, lastRestockedAt: today, updatedAt: new Date() }
          }
        );
      } else {
        const result = await products.insertOne({
          userId, name, quantityInStock: quantity, unitCost, unitPrice: 0,
          lastRestockedAt: today, lastSoldAt: null,
          createdAt: new Date(), updatedAt: new Date()
        });
        productId = result.insertedId;
      }

      await stockMovements.insertOne({
        userId, productId, quantity, unitCost, amount,
        entryDate: today, createdAt: new Date()
      });

      saved.push({ productId, name, quantity, unitCost, amount });
    }

    return res.status(201).json({ message: 'Stock saved', saved });
  } catch (err) {
    console.error('Save stock error:', err);
    return res.status(500).json({ error: 'Server error saving stock' });
  }
}

// GET /api/stock — current stock levels per product
async function getStock(req, res) {
  try {
    const db = getDB();
    const userId = new ObjectId(req.userId);
    const rows = await db.collection('products').find({ userId }).sort({ name: 1 }).toArray();
    return res.json(rows);
  } catch (err) {
    console.error('Get stock error:', err);
    return res.status(500).json({ error: 'Server error fetching stock' });
  }
}

// GET /api/stock/has-any — used by sales.html to enforce "record stock first"
async function hasAnyStock(req, res) {
  try {
    const db = getDB();
    const userId = new ObjectId(req.userId);
    const count = await db.collection('products').countDocuments({ userId });
    return res.json({ hasStock: count > 0 });
  } catch (err) {
    console.error('Has-any-stock error:', err);
    return res.status(500).json({ error: 'Server error checking stock' });
  }
}

module.exports = { saveStock, getStock, hasAnyStock };
