const express = require('express');
const router = express.Router();
const OrderController = require('../../controllers/admin/orderController');

router.get('/list', OrderController.getAll);
router.get('/:id', OrderController.getById);
router.post('/:id/cancel', OrderController.cancelOrder);
router.put('/:id/status', OrderController.updateOrderStatus);
module.exports = router;