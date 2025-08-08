const express = require('express');
const router = express.Router();
const PaymentController = require('../../controllers/client/paymentController');
const { upload } = require('../../config/cloudinary');
const bodyParser = require('body-parser');
const { checkJWT } = require('../../middlewares/checkJWT');

router.post('/momo', checkJWT, PaymentController.momoPay);
router.get('/momo-callback', PaymentController.momoCallback);
router.post('/momo-callback', PaymentController.momoCallback);

router.post('/zalopay', checkJWT, PaymentController.zaloPay);
router.get('/zalopay-callback', PaymentController.zaloCallback);
router.post('/zalopay-callback', PaymentController.zaloCallback);

router.post('/vnpay', checkJWT, PaymentController.vnpay);
router.get('/vnpay-callback', PaymentController.vnpayCallback);
router.post('/vnpay-callback', PaymentController.vnpayCallback);


router.post('/stripe', checkJWT, PaymentController.stripePay);
router.post('/stripe-webhook', bodyParser.raw({ type: 'application/json' }), PaymentController.handleStripeWebhook);
router.post('/payos', checkJWT, PaymentController.payosPay);
router.post('/payos-webhook', PaymentController.payosWebhook);

router.post('/generate-vietqr', PaymentController.generateVietQR);
router.post('/:id/proof', checkJWT, upload.single('proof'), PaymentController.uploadProof);

router.post('/:id/pay-again', checkJWT, PaymentController.payAgain);
router.get('/payment-methods', PaymentController.getPaymentMethods);

module.exports = router;