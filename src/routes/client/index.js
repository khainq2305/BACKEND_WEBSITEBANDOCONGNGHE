const express = require('express');
const router = express.Router();

const authRoutes = require('./auth.route');
const shippingRoutes = require('./shipping.routes');
const userAddressRoutes = require('./userAddress.route'); // ✅ thêm dòng này
const postRoutes = require('./post.route')
router.use('/', authRoutes);
router.use('/shipping', shippingRoutes);
router.use('/user-address', userAddressRoutes); // ✅ mount đúng prefix
router.use('/tin-noi-bat', postRoutes);
module.exports = router;
