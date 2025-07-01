const express = require('express');
const router = express.Router();
const OrderController = require('../../controllers/client/orderController');
const {upload } = require('../../config/cloudinary');
const { checkJWT } = require('../../middlewares/checkJWT');
router.get('/user-orders', checkJWT, OrderController.getAllByUser);

router.get('/code/:code', checkJWT, OrderController.getById);
router.get ('/momo-callback', OrderController.momoCallback);
router.post('/momo-callback', OrderController.momoCallback);
// routes
router.post('/:id/pay-again', checkJWT, OrderController.payAgain);

router.post('/create', checkJWT, OrderController.createOrder);
router.post("/momo", checkJWT, OrderController.momoPay);
router.post("/zalopay", checkJWT, OrderController.zaloPay);
router.post("/vnpay", checkJWT, OrderController.vnpay);
router.get ('/vnpay-callback',  OrderController.vnpayCallback); // redirect
router.post('/vnpay-callback', OrderController.vnpayCallback); // IPN (tùy bật)
router.post('/:id/reorder', checkJWT, OrderController.reorder);
router.put(
  '/return/:id/choose-method',
  checkJWT,
  OrderController.chooseReturnMethod
);
router.put("/:id/mark-completed", checkJWT, OrderController.markAsCompleted);
// routes/client/orderRoutes.js
router.post(
  '/return/:id/book-pickup',
  checkJWT,
  OrderController.bookReturnPickup
);
router.all('/viettel-money/callback', OrderController.viettelMoneyCallback);
router.post('/viettel-money', checkJWT, OrderController.viettelMoneyPay);
router.put('/:id/cancel', checkJWT, OrderController.cancel);

router.post("/generate-vietqr", OrderController.generate);
router.post('/calculate-shipping-fee', OrderController.getShippingFee);
router.get('/lookup', OrderController.lookupOrder);

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
