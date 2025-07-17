const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');
const OrderController = require('../controllers/client/orderController');

router.post(
  '/stripe/webhook',
  bodyParser.raw({ type: 'application/json' }),
  OrderController.handleStripeWebhook
);

module.exports = router;
