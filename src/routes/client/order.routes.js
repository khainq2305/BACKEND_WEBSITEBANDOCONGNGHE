const express = require('express');
const router = express.Router();
const OrderController = require('../../controllers/client/orderController');
const {upload } = require('../../config/cloudinary');
const { checkJWT } = require('../../middlewares/checkJWT');
router.get('/user-orders', checkJWT, OrderController.getAllByUser);

router.get('/code/:code', checkJWT, OrderController.getById);
router.post("/momo-callback", OrderController.momoCallback);
router.post('/create', checkJWT, OrderController.createOrder);
router.post("/momo", checkJWT, OrderController.momoPay);
router.post("/zalopay", checkJWT, OrderController.zaloPay);
router.post("/vnpay", checkJWT, OrderController.vnpay);
// ✅ API mua lại đơn hàng
router.post('/:id/reorder', checkJWT, OrderController.reorder);

// Chọn phương thức hoàn hàng: ghn đến lấy hoặc tự gửi
router.put(
  '/return/:id/choose-method',
  checkJWT,
  OrderController.chooseReturnMethod
);
router.put("/:id/mark-completed", checkJWT, OrderController.markAsCompleted);

router.put('/:id/cancel', checkJWT, OrderController.cancel);

router.post("/generate-vietqr", OrderController.generate);
router.post('/calculate-shipping-fee', OrderController.getShippingFee);

// Chỉ cần là /lookup
router.get('/lookup', OrderController.lookupOrder);
// routes/client/order.js

router.post(
  '/return',
  checkJWT,
  upload.fields([
    { name: 'images', maxCount: 5 },
    { name: 'videos', maxCount: 2 }
  ]),
  OrderController.requestReturn
);


module.exports = router;
