// src/models/index.js
const Sequelize = require("sequelize");
const connection = require("../config/database");
const Category = require("./categoryModel");
const User = require("./userModel");
const Role = require("./roleModel");
const UserToken = require("./userTokenModel");
const UserAddress = require("./UserAddress");
//
const HighlightedCategoryItem = require("./HighlightedCategoryItem");
const FlashSale = require("./flashsale.model");
const FlashSaleItem = require("./flashsaleitem.model");
const FlashSaleCategory = require("./flashsalecategory.model");
//
const ReturnRequest = require("./returnRequest");
const StockLog = require("./StockLog")
const ProductHomeSection = require("./productHomeSection");
const ProductInfo = require("./productinfo.model");
const ProductSpec = require("./productspec.model");
const ProductView = require("./productView.model");
const ProductQuestion = require("./productQuestionModel");
const ProductAnswer = require("./productanswer.model");
const UserRole = require("./userRole");
const HomeSectionCategory = require("./homeSectionCategory.model");

//
const HomeSection = require("./homeSection");
const HomeSectionBanner = require("./homeSectionBanner");
const Post = require("./post");
const categoryPostModel = require("./categoryPostModel");
const Tags = require("./TagModel");
const PostTag = require("./PostTag");

//
const Banner = require("./Banner");
const WishlistItem = require("./wishlistitemModel");
const Wishlist = require("./wishlistModel");

//
// Shipping
const ShippingProvider = require("./shippingProvider");
const ShippingService = require("./shippingService");
const ProviderProvince = require("./providerProvince");
const ProviderDistrict = require("./providerDistrict");
const ProviderWard = require("./providerWard");

//
const SystemSetting = require("./systemsetting");

const Review = require("./reviewModel");
const ReviewMedia = require("./reviewmediamodel");
const Notification = require("./notification.model");
const NotificationUser = require("./notificationUser.model");
const Order = require("./order");
const OrderItem = require("./orderItem");
const PaymentMethod = require("./paymentMethod");
const PaymentTransaction = require("./paymentTransaction");
//
const SearchHistory = require("./searchHistory");

const Coupon = require("./coupon");
const CouponUser = require("./couponuser");
const CouponCategory = require("./couponcategory");
const CouponItem = require("./couponitems");

//
const Cart = require("./cart");
const CartItem = require("./cartitem");

const ProductVariant = require("./productvariant");

const Brand = require("./brandModel");
const Sku = require("./skuModel");
const ProductMedia = require("./productMediaModel");
const Product = require("./product");
const RolePermission = require("./RolePermission");
const Action = require("./actionModel");
const Subject = require("./Subject");
// phan quyen
// User - Role
User.belongsToMany(Role, {
  through: UserRole, 
  foreignKey: "userId",
  otherKey: "roleId",
});

Role.belongsToMany(User, {
  through: UserRole, // 👈 sửa đây
  foreignKey: "roleId",
  otherKey: "userId",
});

Role.hasMany(RolePermission, {
  foreignKey: "roleId",
  as: "rolePermissions",
});
RolePermission.belongsTo(Role, {
  foreignKey: "roleId",
  as: "role",
});
Action.hasMany(RolePermission, {
  foreignKey: "actionId",
  as: "rolePermissions",
});
RolePermission.belongsTo(Action, {
  foreignKey: "actionId",
  as: "action",
});
Subject.hasMany(RolePermission, {
  foreignKey: "subjectId",
  as: "rolePermissions",
});
RolePermission.belongsTo(Subject, {
  foreignKey: "subjectId",
  as: "subject",
});

//
NotificationUser.belongsTo(Notification, { foreignKey: "notificationId" });
NotificationUser.belongsTo(User, { foreignKey: "userId" });

Notification.hasMany(NotificationUser, {
  foreignKey: "notificationId",
  as: "notificationUsers",
});
User.hasMany(NotificationUser, { foreignKey: "userId" });
//
const Variant = require("./variant");
const VariantValue = require("./variantvalue");
//
//
const SkuVariantValue = require("./skuvariantvalueModel");

// Liên kết bảng trung gian Sku <-> VariantValue
Sku.hasMany(SkuVariantValue, { foreignKey: "skuId", as: "variantValues" });
SkuVariantValue.belongsTo(Sku, { foreignKey: "skuId" });

VariantValue.hasMany(SkuVariantValue, {
  foreignKey: "variantValueId",
  as: "skuValues",
});
SkuVariantValue.belongsTo(VariantValue, {
  foreignKey: "variantValueId",
  as: "variantValue",
});

categoryPostModel.hasMany(Post, { foreignKey: "categoryId", as: "posts" });
Post.belongsTo(categoryPostModel, { foreignKey: "categoryId", as: "category" });
Post.belongsToMany(Tags, {
  through: PostTag,
  foreignKey: "postId",
  otherKey: "tagId",
  as: "tags",
});
Order.belongsTo(ShippingProvider, {
  foreignKey: "shippingProviderId",
  as: "shippingProvider", 
});
Tags.belongsToMany(Post, {
  through: PostTag,
  foreignKey: "tagId",
  otherKey: "postId",
  as: "posts",
});

// Tác giả bài viết
User.hasMany(Post, { foreignKey: "authorId", as: "posts" });
Post.belongsTo(User, { foreignKey: "authorId", as: "author" });
//
User.hasMany(Review, { foreignKey: "userId", as: "reviews" });
Review.belongsTo(User, { foreignKey: "userId", as: "user" });

Sku.hasMany(Review, { foreignKey: "skuId", as: "reviews" });
Review.belongsTo(Sku, { foreignKey: "skuId", as: "sku" });

OrderItem.hasOne(Review, { foreignKey: "orderItemId", as: "review" });
Review.belongsTo(OrderItem, { foreignKey: "orderItemId", as: "orderItem" });

Review.hasMany(ReviewMedia, { foreignKey: "reviewId", as: "media" });
ReviewMedia.belongsTo(Review, { foreignKey: "reviewId", as: "review" });
OrderItem.belongsTo(Order, {
  foreignKey: "orderId",
  as: "order",
});
// Liên kết với Category
HighlightedCategoryItem.belongsTo(Category, {
  foreignKey: "categoryId",
  as: "category",
});
Category.hasMany(HighlightedCategoryItem, {
  foreignKey: "categoryId",
  as: "highlightedItems",
});
//
//

Product.hasMany(Sku, { foreignKey: "productId", as: "skus" });
Sku.belongsTo(Product, { foreignKey: "productId", as: "product" });

// THÊM DÒNG NÀY
Sku.hasMany(ProductMedia, { foreignKey: "skuId", as: "ProductMedia" }); // Đặt bí danh là "ProductMedia"
ProductMedia.belongsTo(Sku, { foreignKey: "skuId" });
Product.hasOne(ProductInfo, {
  foreignKey: "productId",
  as: "productInfo",
});
ProductInfo.belongsTo(Product, {
  foreignKey: "productId",
  as: "product",
});
Product.hasMany(ProductSpec, { foreignKey: "productId", as: "specs" });
ProductSpec.belongsTo(Product, { foreignKey: "productId", as: "product" });
Category.hasMany(Product, { foreignKey: "categoryId", as: "products" });

Product.hasMany(ProductVariant, {
  foreignKey: "productId",
  as: "productVariants",
});
ProductVariant.belongsTo(Product, {
  foreignKey: "productId",
  as: "product",
});

ProductVariant.belongsTo(Variant, {
  foreignKey: "variantId",
  as: "variant",
});

Variant.hasMany(ProductVariant, {
  foreignKey: "variantId",
  as: "productVariants",
});
//
User.belongsToMany(Role, {
  through: UserRole,
  foreignKey: "userId",
  otherKey: "roleId",
  as: "roles",
});

Role.belongsToMany(User, {
  through: UserRole,
  foreignKey: "roleId",
  otherKey: "userId",
  as: "users",
});
//
HomeSection.hasMany(HomeSectionBanner, {
  foreignKey: "homeSectionId",
  as: "banners",
});
HomeSectionBanner.belongsTo(HomeSection, { foreignKey: "homeSectionId" });

//

HomeSection.belongsToMany(Product, {
  through: ProductHomeSection,
  foreignKey: "homeSectionId",
  otherKey: "productId",
  as: "products",
});

Product.belongsToMany(HomeSection, {
  through: ProductHomeSection,
  foreignKey: "productId",
  otherKey: "homeSectionId",
  as: "homeSections",
});
Product.belongsToMany(HomeSection, {
  through: ProductHomeSection,
  foreignKey: "productId",
  otherKey: "homeSectionId",
  as: "sections",
});

//
// FLASH SALE Associations
FlashSale.hasMany(FlashSaleItem, {
  foreignKey: "flashSaleId",
  as: "flashSaleItems",
});
FlashSaleItem.belongsTo(FlashSale, {
  foreignKey: "flashSaleId",
  as: "flashSale",
});

FlashSale.hasMany(FlashSaleCategory, {
  foreignKey: "flashSaleId",
  as: "flashSaleCategories",
});
FlashSaleCategory.belongsTo(FlashSale, {
  foreignKey: "flashSaleId",
  as: "flashSale",
});

Sku.hasMany(FlashSaleItem, { foreignKey: "skuId", as: "flashSaleSkus" });
FlashSaleItem.belongsTo(Sku, { foreignKey: "skuId", as: "flashSaleSku" });

Category.hasMany(FlashSaleCategory, {
  foreignKey: "categoryId",
  as: "flashSaleLinkedCategories",
});
FlashSaleCategory.belongsTo(Category, {
  foreignKey: "categoryId",
  as: "flashSaleCategory",
});

// Quan hệ

Variant.hasMany(VariantValue, { foreignKey: "variantId", as: "values" });

VariantValue.belongsTo(Variant, { foreignKey: "variantId", as: "variant" });
Product.belongsToMany(Variant, {
  through: ProductVariant,
  foreignKey: "productId",
  otherKey: "variantId",
  as: "variants", // alias này chỉ cần nếu bạn muốn dùng product.variants sau này
});

Variant.belongsToMany(Product, {
  through: ProductVariant,
  foreignKey: "variantId",
  otherKey: "productId",
  as: "products",
});

//
Coupon.hasMany(CouponUser, { foreignKey: "couponId", as: "users" });
CouponUser.belongsTo(Coupon, { foreignKey: "couponId" });

Coupon.hasMany(CouponCategory, { foreignKey: "couponId", as: "categories" });
CouponCategory.belongsTo(Coupon, { foreignKey: "couponId" });

Coupon.hasMany(CouponItem, { foreignKey: "couponId", as: "products" });
CouponItem.belongsTo(Coupon, { foreignKey: "couponId", as: "coupon" });
//

//

const Province = require("./province");
const District = require("./district");
const Ward = require("./ward");
//
// Danh mục bài viết
Category.hasMany(Post, { foreignKey: "categoryId" });
Post.belongsTo(Category, { foreignKey: "categoryId" });
Product.belongsTo(Brand, { foreignKey: "brandId", as: "brand" });
Brand.hasMany(Product, { foreignKey: "brandId", as: "products" });

// Tác giả bài viết
User.hasMany(Post, { foreignKey: "authorId" });
Post.belongsTo(User, { foreignKey: "authorId" });

//
// Người dùng có một giỏ hàng
User.hasOne(Cart, { foreignKey: "userId", onDelete: "CASCADE" });
Cart.belongsTo(User, { foreignKey: "userId" });

// Giỏ hàng có nhiều sản phẩm
Cart.hasMany(CartItem, { foreignKey: "cartId", onDelete: "CASCADE" });
CartItem.belongsTo(Cart, { foreignKey: "cartId" });

// Mỗi CartItem tương ứng với 1 SKU
Sku.hasMany(CartItem, { foreignKey: "skuId", onDelete: "CASCADE" });
CartItem.belongsTo(Sku, { foreignKey: "skuId" });
//
// Associations
User.hasMany(Order, { foreignKey: "userId" });
Order.belongsTo(User, { foreignKey: "userId" });

Order.hasMany(OrderItem, { foreignKey: "orderId", as: "items" });
OrderItem.belongsTo(Order, {
  foreignKey: "orderId",
  as: "orderData",
});

OrderItem.belongsTo(Sku, { foreignKey: "skuId" });
Sku.hasMany(OrderItem, { foreignKey: "skuId" });

Order.belongsTo(UserAddress, {
  foreignKey: "userAddressId",
  as: "shippingAddress",
});

Order.belongsTo(PaymentMethod, {
  foreignKey: "paymentMethodId",
  as: "paymentMethod",
});
PaymentMethod.hasMany(Order, { foreignKey: "paymentMethodId" });

Order.hasOne(PaymentTransaction, { foreignKey: "orderId", as: "transaction" });
PaymentTransaction.belongsTo(Order, { foreignKey: "orderId" });

PaymentTransaction.belongsTo(PaymentMethod, {
  foreignKey: "paymentMethodId",
  as: "method",
});

//
Banner.belongsTo(Category, {
  foreignKey: "categoryId",
  as: "category",
});
Category.hasMany(Banner, {
  foreignKey: "categoryId",
  as: "banners",
});
User.hasMany(ProductView, { foreignKey: "userId", as: "productViews" });
ProductView.belongsTo(User, { foreignKey: "userId", as: "user" });

Product.hasMany(ProductView, { foreignKey: "productId", as: "views" });
ProductView.belongsTo(Product, { foreignKey: "productId", as: "product" });

Banner.belongsTo(Product, {
  foreignKey: "productId",
  as: "product",
});
Product.hasMany(Banner, {
  foreignKey: "productId",
  as: "banners",
});

//
HomeSection.belongsToMany(Category, {
  through: HomeSectionCategory,
  foreignKey: "homeSectionId",
  otherKey: "categoryId",
  as: "linkedCategories",
});

Category.belongsToMany(HomeSection, {
  through: HomeSectionCategory,
  foreignKey: "categoryId",
  otherKey: "homeSectionId",
  as: "homeSections",
});

Product.belongsTo(Category, { foreignKey: "categoryId", as: "category" });

User.hasMany(UserToken, {
  foreignKey: "userId",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});
UserToken.belongsTo(User, {
  foreignKey: "userId",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});
//
Province.hasMany(District, { foreignKey: "provinceId" });
District.belongsTo(Province, { foreignKey: "provinceId" });
Category.hasMany(Category, {
  foreignKey: "parentId",
  as: "children",
});
Category.belongsTo(Category, {
  foreignKey: "parentId",
  as: "parent",
});
User.hasMany(Wishlist, { foreignKey: "userId" });
Wishlist.belongsTo(User, { foreignKey: "userId" });

Wishlist.hasMany(WishlistItem, { foreignKey: "wishlistId", as: "items" });
WishlistItem.belongsTo(Wishlist, { foreignKey: "wishlistId" });

WishlistItem.belongsTo(Product, {
  foreignKey: "productId",
  as: "product",
});
Product.hasMany(WishlistItem, {
  foreignKey: "productId",
  as: "wishlistItems",
});
OrderItem.belongsTo(FlashSaleItem, {
  foreignKey: "flashSaleId",
  as: "flashSaleItem",
});
FlashSaleItem.hasMany(OrderItem, {
  foreignKey: "flashSaleId",
  as: "orderItems",
});

WishlistItem.belongsTo(Sku, { foreignKey: "skuId", as: "sku" });
Sku.hasMany(WishlistItem, { foreignKey: "skuId", as: "wishlistItems" });

District.hasMany(Ward, { foreignKey: "districtId" });
Ward.belongsTo(District, { foreignKey: "districtId" });
//
User.hasMany(UserAddress, { foreignKey: "userId", onDelete: "CASCADE" });
UserAddress.belongsTo(User, { foreignKey: "userId" });

UserAddress.belongsTo(Province, { foreignKey: "provinceId", as: "province" });
UserAddress.belongsTo(District, { foreignKey: "districtId", as: "district" });
UserAddress.belongsTo(Ward, {
  foreignKey: "wardId", // THAY wardCode thành wardId ở đây!
  targetKey: "id",
  as: "ward",
});

Product.hasMany(ProductQuestion, { foreignKey: "productId", as: "questions" });
ProductQuestion.belongsTo(Product, { foreignKey: "productId", as: "product" });

User.hasMany(ProductQuestion, { foreignKey: "userId", as: "productQuestions" });
ProductQuestion.belongsTo(User, { foreignKey: "userId", as: "user" });

ProductQuestion.hasMany(ProductAnswer, {
  foreignKey: "questionId",
  as: "answers",
});
ProductAnswer.belongsTo(ProductQuestion, {
  foreignKey: "questionId",
  as: "question",
});

User.hasMany(ProductAnswer, { foreignKey: "userId", as: "productAnswers" });
ProductAnswer.belongsTo(User, { foreignKey: "userId", as: "user" });

ProductAnswer.belongsTo(ProductAnswer, {
  foreignKey: "parentId",
  as: "parent",
});
ProductAnswer.hasMany(ProductAnswer, { foreignKey: "parentId", as: "replies" });
Order.hasOne(ReturnRequest, { foreignKey: "orderId", as: "returnRequest" });
ReturnRequest.belongsTo(Order, { foreignKey: "orderId", as: "order" });
const RefundRequest = require("./refundRequest"); // THÊM Ở ĐÂY

// THÊM QUAN HỆ
Order.hasMany(RefundRequest, { foreignKey: "orderId", as: "refunds" });
RefundRequest.belongsTo(Order, { foreignKey: "orderId", as: "order" });

User.hasMany(RefundRequest, { foreignKey: "userId", as: "refundRequests" });
RefundRequest.belongsTo(User, { foreignKey: "userId", as: "user" });

RefundRequest.belongsTo(ReturnRequest, {
  foreignKey: "returnRequestId",
  as: "returnRequest",
});
ReturnRequest.hasOne(RefundRequest, {
  foreignKey: "returnRequestId",
  as: "refundRequest",
});

/* ======================================================
   SHIPPING – LIÊN KẾT HÃNG  ↔  SERVICE  ↔  MAPPING VÙNG
   ====================================================== */

// Provider ↔ Service
ShippingProvider.hasMany(ShippingService, {
  foreignKey: "providerId",
  as: "services",
});
ShippingService.belongsTo(ShippingProvider, {
  foreignKey: "providerId",
  as: "provider",
});
Category.belongsTo(Category, { as: 'parentCategory', foreignKey: 'parentId' }); 
// Provider ↔ Province/District/Ward mapping
ShippingProvider.hasMany(ProviderProvince, { foreignKey: "providerId" });
ProviderProvince.belongsTo(ShippingProvider, { foreignKey: "providerId" });

ShippingProvider.hasMany(ProviderDistrict, { foreignKey: "providerId" });
ProviderDistrict.belongsTo(ShippingProvider, { foreignKey: "providerId" });

ShippingProvider.hasMany(ProviderWard, { foreignKey: "providerId" });
ProviderWard.belongsTo(ShippingProvider, { foreignKey: "providerId" });

// Province/District/Ward ↔ mapping bảng gốc
Province.hasMany(ProviderProvince, { foreignKey: "provinceId" });
ProviderProvince.belongsTo(Province, { foreignKey: "provinceId" });

District.hasMany(ProviderDistrict, { foreignKey: "districtId" });
ProviderDistrict.belongsTo(District, { foreignKey: "districtId" });

Ward.hasMany(ProviderWard, { foreignKey: "wardId" });
ProviderWard.belongsTo(Ward, { foreignKey: "wardId" });
StockLog.belongsTo(Sku, {
  foreignKey: 'skuId',
  as: 'sku'
});

Sku.hasMany(StockLog, {
  foreignKey: 'skuId',
  as: 'logs'
});
StockLog.belongsTo(User, { foreignKey: 'userId', as: 'user' });
module.exports = {
  User,
  Role,
  Province,
  Sku,
  ReturnRequest,
  RefundRequest,

  ProductQuestion,
  ProductAnswer,
StockLog,
  Banner,
  ProductView,
  SystemSetting,
  WishlistItem,
  Wishlist,
  categoryPostModel,
  Cart,
  CartItem,
  ProductMedia,
  HighlightedCategoryItem,
  District,
  CouponUser,
  CouponCategory,
  SearchHistory,
  Notification,
  NotificationUser,
  CouponItem,
  FlashSale,
  FlashSaleItem,
  FlashSaleCategory,
  UserAddress,
  Ward,
  SkuVariantValue,
  Variant,
  VariantValue,
  Brand,
  HomeSection,
  HomeSectionBanner,
  HomeSectionCategory,
  UserRole,
  Category,
  ProductHomeSection,
  ProductInfo,
  ProductSpec,
  Post,
  ProductVariant,
  Order,
  Tags,
  PostTag,
  OrderItem,
  Review,
  ReviewMedia,
  PaymentMethod,
  PaymentTransaction,
  Coupon,
  Product,
  UserToken,
  RolePermission,
  Action,
  Subject,
  ShippingProvider,
  ShippingService,
  ProviderProvince,
  ProviderDistrict,
  ProviderWard,

  sequelize: connection,
};
