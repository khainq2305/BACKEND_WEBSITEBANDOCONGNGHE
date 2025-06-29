const express = require('express');
const router = express.Router();

const productRoutes = require('./productRoutes');
const variantRoutes = require('./variantRoutes');
const variantValueRoutes = require('./variantValue.routes'); 
const brandRoutes = require('./brand.route'); 
const categoryRoutes = require('./category.route'); 

const userRoutes = require('./user.route'); 
const couponRoutes = require('./coupon.routes'); 
const highlightedCategoryItemRoutes = require('./highlightedCategoryItem.routes'); 
const sectionRoutes = require('./section.routes'); 
const flashSaleRoutes = require('./flashSale.routes'); 
const postRoutes = require('./post.routes');
const postCategoryRoutes = require('./categoryPost.routes')
const orderRoutes = require('./order.routes');
const uploadRoutes = require("./upload.routes"); 
const bannerRoutes = require('./banner.routes'); 
const tagsRoute = require('./tags.route')
const notificationRoutes = require('./notification.route');
const notificationUserRoutes = require('./notificationUser.route');
const seoRoutes = require('./seo.routes');
const postSEORoutes = require('./postseo.routes');

router.use('/', orderRoutes);  

router.use('/tags', tagsRoute)
router.use('/', bannerRoutes); 
router.use('/notifications', notificationRoutes);
router.use('/notification-users', notificationUserRoutes);

router.use('/', productRoutes); 
router.use('/', userRoutes); 
router.use('/quan-ly-bai-viet', postRoutes);
router.use('/quan-ly-danh-muc', postCategoryRoutes);
router.use('/', variantRoutes);
router.use('/', variantValueRoutes); 
router.use('/', couponRoutes);
router.use('/', highlightedCategoryItemRoutes);
router.use('/', sectionRoutes); 
router.use('/', flashSaleRoutes); 
router.use('/categories', categoryRoutes);
router.use("/", uploadRoutes);
router.use('/quan-ly-bai-viet', postRoutes);
router.use('/brands', brandRoutes);
router.use('/seo', seoRoutes);
router.use('/post-seo', postSEORoutes);

module.exports = router;
