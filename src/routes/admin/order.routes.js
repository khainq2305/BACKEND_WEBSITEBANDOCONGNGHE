const express = require('express');
const router = express.Router();
const OrderController = require('../../controllers/admin/orderController');
router.put('/order/:id/status', OrderController.updateStatus); // ✅ THÊM DÒNG NÀY
router.put('/order/:id/cancel', OrderController.cancelOrder);  // ✅ hủy đơn có lý do
router.get('/order/:orderId/returns', OrderController.getReturnByOrder); // ✅ lấy tất cả yêu cầu trả hàng của đơn
router.put('/returns/:id/status', OrderController.updateReturnStatus);   // ✅ duyệt/trả lời yêu cầu trả hàng

// Quản lý yêu cầu hoàn tiền
router.get('/order/:orderId/refunds', OrderController.getRefundByOrder); // ✅ lấy tất cả yêu cầu hoàn tiền của đơn
router.put('/refunds/:id/status', OrderController.updateRefundStatus);   // ✅ duyệt/trả lời yêu cầu hoàn tiền

// ➤ Gọi: /admin/order/list
router.get('/order/list', OrderController.getAll);
router.get('/order/:id', OrderController.getDetail);
module.exports = router;
