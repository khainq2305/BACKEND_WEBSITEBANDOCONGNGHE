const express = require('express');
const router = express.Router();

const authRoutes = require('./auth.route');
const shippingRoutes = require('./shipping.routes');
const userAddressRoutes = require('./userAddress.route'); 
const productRoutes = require('./product.route'); 
const cartRoutes = require('./cart.route'); 
const highlightedCategoryRoutes = require('./highlightedCategory.route');
const orderRoutes = require('./order.routes'); 
const categoryRoutes = require('./category.route'); 
const searchRoutes = require('./search.routes');
const sectionClientRoutes = require('./sectionClient.route'); 
const brandRoutes = require('./brand.route');
const wishlistRoutes = require('./wishlist.routes');
const couponRoutes = require('./coupon.route');
const sliderRoutes = require('./banner.routes');  

const flashSaleRoutes = require('./flashSale.routes');
router.use('/', sliderRoutes);             

router.use('/', flashSaleRoutes);  
router.use('/', searchRoutes);
router.use('/api/client/categories', categoryRoutes); 
router.use('/', highlightedCategoryRoutes);
router.use('/orders', orderRoutes);
router.use('/', sectionClientRoutes); 
router.use('/wishlist', wishlistRoutes); 
router.use('/api/client/brands', brandRoutes);
router.use('/', authRoutes);
router.use('/shipping', shippingRoutes);
router.use('/user-address', userAddressRoutes); 
router.use('/', productRoutes);
router.use('/cart', cartRoutes); 
router.use('/', couponRoutes);
module.exports = router;
