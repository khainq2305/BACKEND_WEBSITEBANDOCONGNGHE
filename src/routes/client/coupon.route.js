const express = require('express');
const router = express.Router();
const CouponController = require('../../controllers/client/couponController');
const { checkJWT, isAdmin } = require("../../middlewares/checkJWT");
router.use(checkJWT);
// 👉 Route để áp dụng mã giảm giá
router.post('/apply', CouponController.applyCoupon);
// routes/client/couponRoute.js

router.get('/available', CouponController.getAvailableCoupons);

module.exports = router;
