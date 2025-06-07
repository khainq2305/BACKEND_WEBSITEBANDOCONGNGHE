const express = require('express');
const router = express.Router();
const OrderController = require('../../controllers/admin/orderController');

// ➤ Gọi: /admin/order/list
router.get('/order/list', OrderController.getAll);

module.exports = router;
