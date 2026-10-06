const { ObjectId } = require('mongodb');
const { getDB } = require('../config/db');

const LOW_STOCK_THRESHOLD = Number(process.env.LOW_STOCK_THRESHOLD) || 5;
const SLOW_MOVING_DAYS = Number(process.env.SLOW_MOVING_DAYS) || 14;

function fmtRWF(n) {
  return Math.round(n).toLocaleString('en-US') + ' RWF';
}

// GET /api/insights — returns a list of advice messages, newest/most-urgent first
async function getInsights(req, res) {
  const db = getDB();
  const userId = new ObjectId(req.userId);
  const insights = [];

  try {
    const products = await db.collection('products').find({ userId }).toArray();
    if (products.length === 0) {
      return res.json({ insights: [] });
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const weekSales = await db.collection('sales')
      .find({ userId, entryDate: { $gte: sevenDaysAgo } })
      .toArray();

    // Group this week's sales per product, computing profit against
    // each product's current unitCost (no JOIN available, so done in JS).
    const salesByProduct = new Map();
    for (const s of weekSales) {
      const key = s.productId.toString();
      const product = products.find(p => p._id.toString() === key);
      const unitCost = product ? Number(product.unitCost) : 0;

      const entry = salesByProduct.get(key) || { qtySold: 0, profit: 0, revenue: 0 };
      entry.qtySold += Number(s.quantity);
      entry.profit += (Number(s.unitPrice) - unitCost) * Number(s.quantity);
      entry.revenue += Number(s.amount);
      salesByProduct.set(key, entry);
    }

    // ---- 1. OUT OF STOCK ----
    for (const p of products) {
      if (Number(p.quantityInStock) === 0) {
        insights.push({
          type: 'out_of_stock',
          icon: '🔴',
          title: 'Out of stock',
          message: `${p.name} is out of stock. You may be losing sales if customers are looking for it.`
        });
      }
    }

    // ---- 2. LOW STOCK WARNING ----
    for (const p of products) {
      const q = Number(p.quantityInStock);
      if (q > 0 && q <= LOW_STOCK_THRESHOLD) {
        insights.push({
          type: 'stock_warning',
          icon: '🟡',
          title: 'Stock warning',
          message: `${p.name} is low. Only ${q} unit${q === 1 ? '' : 's'} remain.`
        });
      }
    }

    // ---- 3. FASTEST-MOVING PRODUCT THIS WEEK ----
    let fastest = null;
    for (const p of products) {
      const s = salesByProduct.get(p._id.toString());
      if (s && (!fastest || s.qtySold > fastest.qtySold)) {
        fastest = { ...s, name: p.name };
      }
    }
    if (fastest) {
      insights.push({
        type: 'fastest_moving',
        icon: '📈',
        title: 'Sales + stock',
        message: `You sold ${fastest.qtySold} units of ${fastest.name} this week. It is currently your fastest-moving product.`
      });
    }

    // ---- 4. PROFIT THIS WEEK (top earner) ----
    let topProfit = null;
    for (const p of products) {
      const s = salesByProduct.get(p._id.toString());
      if (s && s.profit > 0 && (!topProfit || s.profit > topProfit.profit)) {
        topProfit = { ...s, name: p.name };
      }
    }
    if (topProfit) {
      insights.push({
        type: 'profit',
        icon: '💚',
        title: 'Profit',
        message: `${topProfit.name} generated ${fmtRWF(topProfit.profit)} in estimated profit this week.`
      });
    }

    // ---- 5. SLOW-MOVING STOCK ----
    for (const p of products) {
      const q = Number(p.quantityInStock);
      if (q === 0) continue; // already flagged as out of stock

      const referenceDate = p.lastRestockedAt || p.createdAt;
      const daysInStock = Math.floor((Date.now() - new Date(referenceDate).getTime()) / 86400000);
      const s = salesByProduct.get(p._id.toString());
      const qtySoldThisWeek = s ? s.qtySold : 0;

      if (daysInStock >= SLOW_MOVING_DAYS && qtySoldThisWeek <= 1) {
        insights.push({
          type: 'slow_moving',
          icon: '💡',
          title: 'Slow-moving stock',
          message: `${p.name} has remained in stock for ${daysInStock} days with few sales. Consider reviewing its price or demand.`
        });
      }
    }

    return res.json({ insights });
  } catch (err) {
    console.error('Get insights error:', err);
    return res.status(500).json({ error: 'Server error generating insights' });
  }
}

module.exports = { getInsights };
