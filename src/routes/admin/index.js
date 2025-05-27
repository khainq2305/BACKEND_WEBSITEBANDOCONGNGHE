const express = require('express');
const router = express.Router();

const productRoutes = require('./productRoutes');
const variantRoutes = require('./variantRoutes');
const variantValueRoutes = require('./variantValue.routes'); // ⬅ thêm dòng này
const brandRoutes = require('./brand.route'); 
const categoryRoutes = require('./category.route'); // ✅ hoặc 'categoryProduct.routes' nếu đúng tên

const userRoutes = require('./user.route'); 
const couponRoutes = require('./coupon.routes'); // ⬅ thêm dòng này
const highlightedCategoryItemRoutes = require('./highlightedCategoryItem.routes'); // ⬅ thêm dòng này
const sectionRoutes = require('./section.routes'); // ✅ thêm dòng này
const flashSaleRoutes = require('./flashSale.routes'); // ✅ thêm dòng này
const notificationRoutes = require('./notification.route'); // notification
const postRoutes = require('./post.routes');
const postCategoryRoutes = require('./categoryPost.routes')
const bannerRoutes = require('./banner.routes'); // ✅ thêm dòng này
router.use('/', bannerRoutes); // ✅ mount router banner
router.use('/notifications', notificationRoutes);
router.use('/', productRoutes); 
router.use('/', userRoutes); 
router.use('/quan-ly-bai-viet', postRoutes);
router.use('/quan-ly-danh-muc', postCategoryRoutes);
router.use('/', variantRoutes);
router.use('/', variantValueRoutes); // ⬅ mount router
router.use('/', couponRoutes); // ⬅ mount như các route còn lại
router.use('/', highlightedCategoryItemRoutes); // ⬅ mount vào router
router.use('/', sectionRoutes); // ✅ mount các API: /sections, /sections/:id/banners,...
router.use('/', flashSaleRoutes); // ✅ mount router Flash Sale
router.use('/categories', categoryRoutes); // ✅ chuẩn URL: /admin/categories

router.use('/quan-ly-bai-viet', postRoutes);
router.use('/brands', brandRoutes);

module.exports = router;
