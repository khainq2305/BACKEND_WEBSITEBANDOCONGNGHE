const express = require("express");
const router = express.Router();

const authRoutes = require("./auth.route");
const shippingRoutes = require("./shipping.routes");
const userAddressRoutes = require("./userAddress.route");
const productRoutes = require("./product.route");
const cartRoutes = require("./cart.route");
const highlightedCategoryRoutes = require("./highlightedCategory.route");
const orderRoutes = require("./order.routes");
const categoryRoutes = require("./category.route");
const searchRoutes = require("./search.routes");
const sectionClientRoutes = require("./sectionClient.route");
const brandRoutes = require("./brand.route");
const wishlistRoutes = require("./wishlist.routes");
const couponRoutes = require("./coupon.route");
const sliderRoutes = require("./banner.routes");
const reviewRoutes = require("./review.routes");
const flashSaleRoutes = require("./flashSale.routes");
const postRoutes = require("./post.route");
const productViewRoutes = require("./productView.routes");
const productQuestionRoutes = require("./productQuestion.route");
const systemSettingRoutes = require("./systemSetting.routes");
const recommendationRoutes = require("./recommendationRoutes");
const returnRefundRoutes = require("./returnRefundRoutes"); 
const userPointRoutes = require('./userPoint.Routes'); // 👈 Tên file router bạn sẽ tạo (ví dụ userPoint.routes.js)
const membershipRoutes = require("./membership.route.js"); // thêm dòng này ở trên
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
const reviewRoutes = require('./review.routes'); 
const flashSaleRoutes = require('./flashSale.routes');
const postRoutes = require('./post.route')
const productViewRoutes = require('./productView.routes');
const productQuestionRoutes = require('./productQuestion.route');
const spinRoutes = require('./spin.route'); 
const searchImageRoute = require("./searchImage.route");


const paymentRoutes = require("./payment.routes"); // Thêm dòng này
router.use("/productviews", productViewRoutes);
router.post(
  "/payment/momo-callback",
  require("../../controllers/client/paymentController").momoCallback
);
router.get(
  "/payment/momo-callback",
  require("../../controllers/client/paymentController").momoCallback
);
router.post(
  "/payment/zalopay-callback",
  require("../../controllers/client/paymentController").zaloCallback
);
router.get(
  "/payment/zalopay-callback",
  require("../../controllers/client/paymentController").zaloCallback
);
router.use("/return-refund", returnRefundRoutes); 
router.post(
  "/payment/vnpay-callback",
  require("../../controllers/client/paymentController").vnpayCallback
);
router.get(
  "/payment/vnpay-callback",
  require("../../controllers/client/paymentController").vnpayCallback
);
router.use("/membership", membershipRoutes);      // thêm dòng này ở dưới
router.use("/recommendations", recommendationRoutes);
const chatboxRoutes = require("./chatbox.routes");
router.use("/", sliderRoutes);
router.use("/tin-noi-bat", postRoutes);
router.use("/", flashSaleRoutes);
router.use("/", searchRoutes);
router.use('/points', userPointRoutes); // 👈 VÀ DÒNG NÀY
router.use("/payment", paymentRoutes); // Thêm dòng này để kết nối payment.routes.js
router.use("/api/client/categories", categoryRoutes);
router.use("/", highlightedCategoryRoutes);
router.use("/orders", orderRoutes);
router.use("/", sectionClientRoutes);
router.use("/wishlist", wishlistRoutes);
router.use("/api/client/brands", brandRoutes);
router.use("/", authRoutes);
router.use("/shipping", shippingRoutes);
router.use("/user-address", userAddressRoutes);
router.use("/", productRoutes);
router.use("/",searchImageRoute);
router.use("/chatbox", chatboxRoutes); // 👈 GẮN VÀO ĐÂY
router.use("/cart", cartRoutes);
router.use("/system-settings", systemSettingRoutes);
router.use("/review", reviewRoutes);
router.use("/", couponRoutes);
router.use("/notifications", require("./notificationClient.route"));
router.use("/product-questions", productQuestionRoutes);
router.use('/', sliderRoutes);             
router.use('/tin-noi-bat', postRoutes);
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
router.use('/review', reviewRoutes);
router.use('/', couponRoutes);
router.use('/notifications', require('./notificationClient.route'));
router.use('/product-questions', productQuestionRoutes);
router.use('/spin', spinRoutes);

module.exports = router;
