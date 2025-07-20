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
const permissionRoutes = require('./permission.route')
const roleRoutes= require('./role.route')
const notificationRoutes = require('./notification.route');
const notificationUserRoutes = require('./notificationUser.route');
const reviewRoutes = require('./Review.routes'); // 👈 mới thêm
const productQuestionRoutes = require('./productQuestion.route');
const dashboardRoutes = require('./dashboard.route')
const spinRewardRoutes = require('./spinReward.routes');
const spinHistoryRoutes = require('./spinHistory.routes'); 

const authRouters = require('./auth.route')
const systemSettingRoutes = require('./systemSetting.routes');
const paymentMethodRoutes          = require('./paymentMethodRoutes');
const shippingProviderRoutes       = require('./shippingProviderRoutes');
const skuRoutes = require("./sku.route")
const returnRoutes = require('./returnRoutes');
router.use('/', returnRoutes); // ✅ THÊM DÒNG NÀY Ở CUỐI NHÓM ROUTES LIÊN QUAN
router.use('/system-settings', systemSettingRoutes);
router.use('/', orderRoutes);  
router.use('/', authRouters); 
router.use('/tags', tagsRoute)
router.use('/', bannerRoutes); 
router.use('/notifications', notificationRoutes);
router.use('/notification-users', notificationUserRoutes);
router.use('/permissions', permissionRoutes);
router.use('/quan-ly-vai-tro', roleRoutes);
router.use('/', productRoutes); 
router.use('/', userRoutes); 
router.use('/sku', skuRoutes); 
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
router.use('/brands', brandRoutes);
router.use('/payment-methods', paymentMethodRoutes);
router.use('/shipping-providers', shippingProviderRoutes);
router.use('/reviews', reviewRoutes); 
router.use('/product-questions', productQuestionRoutes);
router.use('/dashboard', dashboardRoutes); 
router.use('/spin-rewards', spinRewardRoutes); 
router.use('/spin-history', spinHistoryRoutes); 

module.exports = router;
