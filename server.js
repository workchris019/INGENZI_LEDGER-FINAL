require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { connectDB } = require('./config/db');

const authRoutes = require('./routes/authRoutes');
const stockRoutes = require('./routes/stockRoutes');
const salesRoutes = require('./routes/salesRoutes');
const insightRoutes = require('./routes/insightRoutes');

const app = express();

app.use(cors());
app.use(express.json());

// Serve the frontend pages (index.html, middlepage.html, stock.html, sales.html)
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'ingenzi-ledger-backend' });
});

app.use('/api/auth', authRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/insights', insightRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong' });
});

const PORT = process.env.PORT || 4000;

// Connect to MongoDB (and create indexes) before accepting any requests,
// so a route never hits a database that isn't ready yet.
connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Ingenzi Ledger backend running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to connect to MongoDB:', err.message);
    process.exit(1);
  });
