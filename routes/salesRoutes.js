const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/auth');
const { createSale, getSales, getScore } = require('../controllers/salesController');

router.use(requireAuth);

router.get('/score', getScore);
router.get('/', getSales);
router.post('/', createSale);

module.exports = router;
