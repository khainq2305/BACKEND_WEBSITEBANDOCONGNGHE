const express = require('express');
const router = express.Router();

const authRoutes = require('./auth.route');
const shippingRoutes = require('./shipping.routes');
const userAddressRoutes = require('./userAddress.route'); // ✅ thêm dòng này
const productRoutes = require('./product.route'); // ✅ import riêng
const cartRoutes = require('./cart.route'); // ✅ thêm
const highlightedCategoryRoutes = require('./highlightedCategory.route');
const orderRoutes = require('./order.routes'); 
const categoryRoutes = require('./category.route'); 
const searchRoutes = require('./search.routes');
const brandRoutes = require('./brand.route');


router.use('/', searchRoutes);
router.use('/api/client/categories', categoryRoutes); 
router.use('/', highlightedCategoryRoutes);
router.use('/orders', orderRoutes);

router.use('/', authRoutes);
router.use('/shipping', shippingRoutes);
router.use('/user-address', userAddressRoutes); 
// router.use('/', productRoutes);
router.use('/cart', cartRoutes);
router.use('/api/client/categories', categoryRoutes); 
router.use('/api/client/products', productRoutes);
router.use('/api/client/brands', brandRoutes);

module.exports = router;
