const express = require('express');
const router = express.Router();
const OrderController = require('../../controllers/client/orderController');
const { checkJWT } = require('../../middlewares/checkJWT');
router.get('/user-orders', checkJWT, OrderController.getAllByUser);

router.get('/code/:code', checkJWT, OrderController.getById);

router.post('/create', checkJWT, OrderController.createOrder);
router.post("/momo", checkJWT, OrderController.momoPay);
router.post("/momo-callback", OrderController.momoCallback);
router.put('/:id/cancel', checkJWT, OrderController.cancel);

router.post("/generate-vietqr", OrderController.generate);
router.post('/calculate-shipping-fee', OrderController.getShippingFee);


module.exports = router;
