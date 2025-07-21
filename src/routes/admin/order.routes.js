const express = require('express');
const router = express.Router();
const OrderController = require('../../controllers/admin/orderController');
router.put('/order/:id/status', OrderController.updateStatus); // ✅ THÊM DÒNG NÀY
router.put('/order/:id/cancel', OrderController.cancelOrder);  // ✅ hủy đơn có lý do

router.put('/order/:id/payment-status', OrderController.updatePaymentStatus); // ✅ THÊM DÒNG NÀY ĐỂ CẬP NHẬT TRẠNG THÁI THANH TOÁN
// ➤ Gọi: /admin/order/list
router.get('/order/list', OrderController.getAll);
router.get('/order/:id', OrderController.getDetail);
module.exports = router;
