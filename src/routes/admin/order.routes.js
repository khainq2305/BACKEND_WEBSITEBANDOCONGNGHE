const express = require('express');
const router = express.Router();
const OrderController = require('../../controllers/admin/orderController');

router.put('/update-status/:id', OrderController.updateStatus);
router.put('/cancel/:id', OrderController.cancelOrder);
router.put('/update-payment-status/:id', OrderController.updatePaymentStatus);

router.get('/list', OrderController.getAll);
router.get('/detail/:id', OrderController.getDetail);

module.exports = router;
