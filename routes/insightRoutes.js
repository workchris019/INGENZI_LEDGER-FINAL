const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/auth');
const { getInsights } = require('../controllers/insightController');

router.use(requireAuth);

router.get('/', getInsights);

module.exports = router;
