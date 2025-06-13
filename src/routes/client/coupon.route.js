const express = require('express');
const router = express.Router();
const CouponController = require('../../controllers/client/couponController');
const { checkJWT, isAdmin } = require("../../middlewares/checkJWT");
router.use(checkJWT);

router.post('/apply', CouponController.applyCoupon);

router.get('/available', CouponController.getAvailableCoupons);

module.exports = router;
