// webhook/payosWebhookRoute.js
const express = require('express');
const router = express.Router();
const PaymentController = require('../controllers/client/paymentController');

router.post("/", PaymentController.payosWebhook);

module.exports = router;
