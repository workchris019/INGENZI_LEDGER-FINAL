const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/auth');
const { saveStock, getStock, hasAnyStock } = require('../controllers/stockController');

router.use(requireAuth);

router.get('/', getStock);
router.get('/has-any', hasAnyStock);
router.post('/', saveStock);

module.exports = router;
