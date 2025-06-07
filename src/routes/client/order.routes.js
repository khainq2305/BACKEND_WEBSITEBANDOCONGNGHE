const express = require('express');
const router = express.Router();
const OrderController = require('../../controllers/client/orderController');
const { checkJWT } = require('../../middlewares/checkJWT');

router.get('/:id', checkJWT, OrderController.getById);
router.post('/create', checkJWT, OrderController.createOrder);
router.post("/momo", checkJWT, OrderController.momoPay);
router.post("/momo-callback", OrderController.momoCallback);

router.post('/calculate-shipping-fee', OrderController.getShippingFee);


module.exports = router;
