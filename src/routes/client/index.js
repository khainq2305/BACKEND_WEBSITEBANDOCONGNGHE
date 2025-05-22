const express = require('express');
const router = express.Router();

const authRoutes = require('./auth.route');
const shippingRoutes = require('./shipping.routes');
const userAddressRoutes = require('./userAddress.route'); // ✅ thêm dòng này

router.use('/', authRoutes);
router.use('/shipping', shippingRoutes);
router.use('/user-address', userAddressRoutes); // ✅ mount đúng prefix

module.exports = router;
