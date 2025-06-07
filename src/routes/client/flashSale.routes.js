// routes/client/flashSale.js
const express = require('express');
const router = express.Router();
const FlashSaleClientController = require('../../controllers/client/flashSaleController');

router.get('/flash-sale/list', FlashSaleClientController.getAll);

module.exports = router;
