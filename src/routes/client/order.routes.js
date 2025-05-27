const express = require('express');
const router = express.Router();
const OrderController = require('../../controllers/client/orderController');
// const { checkJWT } = require('../../middlewares/checkJWT');

// ✅ Tạo đơn hàng (COD / chuyển khoản / ví...)
router.post('/create',  OrderController.createOrder);

// ✅ Tính phí GHN theo địa chỉ và items (gọi trước khi đặt hàng)
router.post('/calculate-shipping-fee', OrderController.getShippingFee);

module.exports = router;
