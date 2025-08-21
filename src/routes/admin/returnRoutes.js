const express = require('express');
const router = express.Router();
const ReturnController = require('../../controllers/admin/returnController');
const { checkJWT } = require('../../middlewares/checkJWT');
const { attachUserDetail } = require('../../middlewares/getUserDetail ');
const { authorize } = require('../../middlewares/authorize');

router.use(checkJWT);
router.use(attachUserDetail);
router.use(authorize("ReturnRequest"))
// TRẢ HÀNG
router.get('/order/:orderId/returns', ReturnController.getReturnByOrder);
router.put('/returns/:id/status', ReturnController.updateReturnStatus);
router.get('/returns/:id', ReturnController.getReturnDetail); // ✅ Thêm route chi tiết trả hàng
// HOÀN TIỀN
router.get('/order/:orderId/refunds', ReturnController.getRefundByOrder);
router.put('/refunds/:id/status', ReturnController.updateRefundStatus);

module.exports = router;
