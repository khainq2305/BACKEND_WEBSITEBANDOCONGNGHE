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

const ProductInfo = require("./productinfo.model");
const ProductSpec = require("./productspec.model");

//
const HomeSection = require("./homeSection");
const HomeSectionBanner = require("./homeSectionBanner");
const ProductHomeSection = require("./productHomeSection");
const HomeSectionFilter = require("./homeSectionFilter");
//
const Banner = require("./Banner");
const Placement = require("./Placement");
const BannerPlacementAssignment = require("./BannerPlacementAssignment");
const WishlistItem = require('./wishlistitemModel');
const Wishlist = require('./wishlistModel');


//

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
//
//
const Variant = require("./variant");
const VariantValue = require("./variantvalue");
//
//
const SkuVariantValue = require("./skuvariantvalueModel");

//
const Post = require("./post");
const categoryPostModel = require("./categoryPostModel");


//
const Tags = require('./TagModel')
const PostTag = require('./PostTag')
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

HighlightedCategoryItem.belongsTo(Category, {
  foreignKey: "categoryId",
  as: "category",
});
Category.hasMany(HighlightedCategoryItem, {
  foreignKey: "categoryId",
  as: "highlightedItems",
});

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
Sku.hasMany(ProductSpec, { foreignKey: "skuId", as: "specs" });
ProductSpec.belongsTo(Sku, { foreignKey: "skuId", as: "sku" });
Product.hasMany(ProductVariant, {
  foreignKey: "productId",
  as: "productVariants",
});
ProductVariant.belongsTo(Product, {
  foreignKey: "productId",
  as: "product",
});
// ✅ Bổ sung quan hệ giữa ProductVariant và Variant
ProductVariant.belongsTo(Variant, {
  foreignKey: "variantId",
  as: "variant", // 👈 alias phải đúng như trong include
});

Variant.hasMany(ProductVariant, {
  foreignKey: "variantId",
  as: "productVariants",
});

//
HomeSection.hasMany(HomeSectionBanner, {
  foreignKey: "homeSectionId",
  as: "banners",
});
HomeSectionBanner.belongsTo(HomeSection, { foreignKey: "homeSectionId" });

HomeSection.hasMany(ProductHomeSection, {
  foreignKey: "homeSectionId",
  as: "productHomeSections", // ✅ dùng đúng alias
});
ProductHomeSection.belongsTo(HomeSection, { foreignKey: "homeSectionId" });

HomeSection.hasMany(HomeSectionFilter, {
  foreignKey: "homeSectionId",
  as: "filters",
});
HomeSectionFilter.belongsTo(HomeSection, { foreignKey: "homeSectionId" });
//
Banner.belongsToMany(Placement, {
  through: BannerPlacementAssignment,
  foreignKey: "bannerId",
  otherKey: "placementId",
  as: "placements",
});

Placement.belongsToMany(Banner, {
  through: BannerPlacementAssignment,
  foreignKey: "placementId",
  otherKey: "bannerId",
  as: "banners",
});

//
Sku.hasMany(ProductHomeSection, { foreignKey: "skuId", as: "homeSections" });
ProductHomeSection.belongsTo(Sku, { foreignKey: "skuId", as: "sku" });
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
  foreignKey: 'productId',
  otherKey: 'variantId',
  as: 'variants' // alias này chỉ cần nếu bạn muốn dùng product.variants sau này
});

Variant.belongsToMany(Product, {
  through: ProductVariant,
  foreignKey: 'variantId',
  otherKey: 'productId',
  as: 'products'
});

//
Coupon.hasMany(CouponUser, { foreignKey: "couponId", as: "users" });
CouponUser.belongsTo(Coupon, { foreignKey: "couponId" });

Coupon.hasMany(CouponCategory, { foreignKey: "couponId", as: "categories" });
CouponCategory.belongsTo(Coupon, { foreignKey: "couponId" });

Coupon.hasMany(CouponItem, { foreignKey: "couponId", as: "products" });
CouponItem.belongsTo(Coupon, { foreignKey: "couponId", as: "coupon" });
//

Placement.belongsTo(Category, {
  foreignKey: "categoryId",
  as: "category",
  constraints: false,
});
Category.hasMany(Placement, {
  foreignKey: "categoryId",
  as: "placements",
});

//

const Province = require("./province");
const District = require("./district");
const Ward = require("./ward");
const { request } = require("express");
//
// Danh mục bài viết
categoryPostModel.hasMany(Post, { foreignKey: 'categoryId', as: 'posts' });
Post.belongsTo(categoryPostModel, { foreignKey: 'categoryId', as: 'category' });

Post.belongsToMany(Tags, {
  through: PostTag,
  foreignKey: 'postId',
  otherKey: 'tagId',
  as: 'tags',
});

Tags.belongsToMany(Post, {
  through: PostTag,
  foreignKey: 'tagId',
  otherKey: 'postId',
  as: 'posts',
});

// Tác giả bài viết
User.hasMany(Post, { foreignKey: "authorId", as: 'posts' });
Post.belongsTo(User, { foreignKey: "authorId", as: 'author' });

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
OrderItem.belongsTo(Order, { foreignKey: "orderId" });

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
Role.hasMany(User, { foreignKey: "roleId" });
User.belongsTo(Role, { foreignKey: "roleId" });

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
BannerPlacementAssignment.belongsTo(Banner, {
  foreignKey: "bannerId",
  as: "banner",
});

District.hasMany(Ward, { foreignKey: "districtId" });
Ward.belongsTo(District, { foreignKey: "districtId" });
//
User.hasMany(UserAddress, { foreignKey: "userId", onDelete: "CASCADE" });
UserAddress.belongsTo(User, { foreignKey: "userId" });

UserAddress.belongsTo(Province, { foreignKey: "provinceId", as: "province" });
UserAddress.belongsTo(District, { foreignKey: "districtId", as: "district" });
UserAddress.belongsTo(Ward, {
  foreignKey: "wardCode",
  targetKey: "code",
  as: "ward",
});
User.hasMany(Wishlist, { foreignKey: 'userId' });
Wishlist.belongsTo(User, { foreignKey: 'userId' });

Wishlist.hasMany(WishlistItem, { foreignKey: 'wishlistId', as: 'items' });
WishlistItem.belongsTo(Wishlist, { foreignKey: 'wishlistId' });

WishlistItem.belongsTo(Product, {
  foreignKey: 'productId',
  as: 'product', // ✅ Đặt alias để join chính xác
});
Product.hasMany(WishlistItem, {
  foreignKey: 'productId',
  as: 'wishlistItems',
});




module.exports = {
  User,
  Role,
  Province,
  Sku,

  Banner,
  Placement,
  BannerPlacementAssignment,

  Cart,
  CartItem,
  ProductMedia,
  HighlightedCategoryItem,
  District,
  CouponUser,
  CouponCategory,
  SearchHistory,

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
  ProductHomeSection,
  HomeSectionFilter,
  Category,

  ProductInfo,
  ProductSpec,
  Post,
  categoryPostModel,
  ProductVariant,
  Order,
  OrderItem,
  PaymentMethod,
  PaymentTransaction,
  Coupon,
  Product,
  UserToken,
  WishlistItem,
  Wishlist,
  Tags,
  PostTag,
  sequelize: connection,
};
