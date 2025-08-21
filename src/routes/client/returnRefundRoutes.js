const express = require('express');
const router = express.Router();
const ReturnRefundController = require('../../controllers/client/returnRefundController');
const { upload } = require('../../config/cloudinary');
const { checkJWT } = require('../../middlewares/checkJWT');

router.post(
  '/',
  checkJWT,
  (req, res, next) => {
    console.log('📦 Middleware upload.fields trước khi parse');
    next();
  },
  upload.fields([
    { name: 'images', maxCount: 6 },
    { name: 'videos', maxCount: 1 }
  ]),
  (req, res, next) => {
    console.log('📦 Middleware upload.fields sau khi parse');
    console.log('📦 req.body:', req.body);
    console.log('📦 req.files:', req.files);
    next();
  },
  ReturnRefundController.requestReturn
);
router.get('/by-code/:code', checkJWT, ReturnRefundController.getReturnRequestByCode);
router.get('/:id/detail', (req, res, next) => {
  console.log("🔥 Vào được route /:id/detail");
  next();
},checkJWT, ReturnRefundController.getReturnRequestDetail);

router.put('/:id/cancel', checkJWT, ReturnRefundController.cancelReturnRequest);
router.put('/:id/choose-method', checkJWT, ReturnRefundController.chooseReturnMethod);
router.post('/:id/book-pickup', checkJWT, ReturnRefundController.bookReturnPickup);
router.get('/by-code/:code', checkJWT, ReturnRefundController.getReturnRequestByCode);
// ✅ Lấy danh sách dịch vụ vận chuyển (drop-off services)
router.get('/:id/dropoff-services', checkJWT, ReturnRefundController.getDropoffServices);

// ✅ Tạo đơn trả hàng khi user chọn dịch vụ drop-off
router.post('/:id/create-dropoff', checkJWT, ReturnRefundController.createDropoffReturnOrder);
router.get('/:id/pickup-fee', checkJWT, ReturnRefundController.getPickupFee);

module.exports = router;