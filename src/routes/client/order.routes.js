const express = require('express');
const router = express.Router();
const OrderController = require('../../controllers/client/orderController');
const { checkJWT } = require('../../middlewares/checkJWT');

router.post('/create', checkJWT, OrderController.createOrder);
router.get('/user-orders', checkJWT, OrderController.getAllByUser);
router.get('/code/:code', checkJWT, OrderController.getById);
router.put('/:id/cancel', checkJWT, OrderController.cancel);
router.post('/:id/reorder', checkJWT, OrderController.reorder);
router.put("/:id/mark-completed", checkJWT, OrderController.markAsCompleted);
router.post('/shippings/options', checkJWT , OrderController.getShippingOptions);
router.get('/lookup', OrderController.lookupOrder);

module.exports = router;