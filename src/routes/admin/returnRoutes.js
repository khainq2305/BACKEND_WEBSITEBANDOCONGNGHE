const express = require('express');
const router = express.Router();
const ReturnController = require('../../controllers/admin/returnController');

// TRẢ HÀNG
router.get('/order/:orderId/returns', ReturnController.getReturnByOrder);
router.put('/returns/:id/status', ReturnController.updateReturnStatus);
router.get('/returns/:id', ReturnController.getReturnDetail); // ✅ Thêm route chi tiết trả hàng
// HOÀN TIỀN
router.get('/order/:orderId/refunds', ReturnController.getRefundByOrder);
router.put('/refunds/:id/status', ReturnController.updateRefundStatus);

module.exports = router;
