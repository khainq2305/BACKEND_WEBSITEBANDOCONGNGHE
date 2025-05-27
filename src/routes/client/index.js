const express = require('express');
const router = express.Router();

const authRoutes = require('./auth.route');
const shippingRoutes = require('./shipping.routes');
const userAddressRoutes = require('./userAddress.route'); // ✅ thêm dòng này
const productRoutes = require('./product.route'); // ✅ import riêng
const cartRoutes = require('./cart.route'); // ✅ thêm
const highlightedCategoryRoutes = require('./highlightedCategory.route');
const orderRoutes = require('./order.routes'); // hoặc ./orderRoutes nếu đúng file của bạn
const categoryRoutes = require('./category.route'); 
const searchRoutes = require('./search.routes');
router.use('/', searchRoutes);
router.use('/api/client/categories', categoryRoutes); 
router.use('/', highlightedCategoryRoutes);
router.use('/orders', orderRoutes);

router.use('/', authRoutes);
router.use('/shipping', shippingRoutes);
router.use('/user-address', userAddressRoutes); // ✅ mount đúng prefix
router.use('/', productRoutes);
router.use('/cart', cartRoutes); // ✅ mount prefix /cart

module.exports = router;
