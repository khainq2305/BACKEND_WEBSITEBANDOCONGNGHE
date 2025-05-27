// src/models/index.js
const Sequelize = require("sequelize");
const connection = require("../config/database");
const Category = require('./categoryModel');
const User = require("./userModel");
const Role = require("./roleModel");
const UserToken = require("./userTokenModel");
const UserAddress = require('./UserAddress'); // ✅ thêm dòng này
// 
const HighlightedCategoryItem = require('./HighlightedCategoryItem'); // ✅ THÊM
const FlashSale = require('./flashsale.model');
const FlashSaleItem = require('./flashsaleitem.model');
const FlashSaleCategory = require('./flashsalecategory.model');

// 
const HomeSection = require('./homeSection');
const HomeSectionBanner = require('./homeSectionBanner');
const ProductHomeSection = require('./productHomeSection');
const HomeSectionFilter = require('./homeSectionFilter');
// 
const Banner = require('./Banner');
const Placement = require('./Placement');
const BannerPlacementAssignment = require('./BannerPlacementAssignment');

// 

const Order = require('./order');
const OrderItem = require('./orderItem');
const PaymentMethod = require('./paymentMethod');
const PaymentTransaction = require('./paymentTransaction');
// 
const SearchHistory = require('./searchHistory');


const Coupon = require('./coupon'); // ✅ thêm dòng này
const CouponUser = require('./couponuser');
const CouponCategory = require('./couponcategory');
const CouponItem = require('./couponitems');

// 
const Cart = require('./cart');
const CartItem = require('./cartitem');

const ProductVariant = require('./productvariant'); // ✅ Thêm dòng này

const Brand = require('./brandModel');
const Sku = require('./skuModel');
const ProductMedia = require('./productMediaModel');
const Product = require('./product');
// 
// 
const Variant = require('./variant');
const VariantValue = require('./variantvalue');
// 
// 
const SkuVariantValue = require('./skuvariantvalueModel');

// Liên kết bảng trung gian Sku <-> VariantValue
Sku.hasMany(SkuVariantValue, { foreignKey: 'skuId', as: 'variantValues' });
SkuVariantValue.belongsTo(Sku, { foreignKey: 'skuId' });

VariantValue.hasMany(SkuVariantValue, { foreignKey: 'variantValueId', as: 'skuValues' });
SkuVariantValue.belongsTo(VariantValue, { foreignKey: 'variantValueId', as: 'variantValue' });

// 
// Liên kết với Category
HighlightedCategoryItem.belongsTo(Category, { foreignKey: 'categoryId', as: 'category' });
Category.hasMany(HighlightedCategoryItem, { foreignKey: 'categoryId', as: 'highlightedItems' });

// 
const Post = require("./post"); // ✅ THÊM DÒNG NÀY
const PostCategory = require("./categoryPostModel")
Product.hasMany(Sku, { foreignKey: 'productId', as: 'skus' }); // ✅ PHẢI có alias trùng
Sku.belongsTo(Product, { foreignKey: 'productId', as: 'product' });

Sku.hasMany(ProductMedia, { foreignKey: 'skuId' });
Sku.hasMany(ProductMedia, { foreignKey: 'skuId', as: 'media' }); // ✅ thêm alias 'media'
ProductMedia.belongsTo(Sku, { foreignKey: 'skuId' });
// 
HomeSection.hasMany(HomeSectionBanner, { foreignKey: 'homeSectionId', as: 'banners' });
HomeSectionBanner.belongsTo(HomeSection, { foreignKey: 'homeSectionId' });

HomeSection.hasMany(ProductHomeSection, { foreignKey: 'homeSectionId', as: 'products' });
ProductHomeSection.belongsTo(HomeSection, { foreignKey: 'homeSectionId' });

HomeSection.hasMany(HomeSectionFilter, { foreignKey: 'homeSectionId', as: 'filters' });
HomeSectionFilter.belongsTo(HomeSection, { foreignKey: 'homeSectionId' });
// 
Banner.belongsToMany(Placement, {
  through: BannerPlacementAssignment,
  foreignKey: 'bannerId',
  otherKey: 'placementId',
  as: 'placements'
});

Placement.belongsToMany(Banner, {
  through: BannerPlacementAssignment,
  foreignKey: 'placementId',
  otherKey: 'bannerId',
  as: 'banners'
});

// 
Sku.hasMany(ProductHomeSection, { foreignKey: 'skuId', as: 'homeSections' });
ProductHomeSection.belongsTo(Sku, { foreignKey: 'skuId', as: 'sku' });
// 
// FLASH SALE Associations
FlashSale.hasMany(FlashSaleItem, { foreignKey: 'flashSaleId', as: 'flashSaleItems' });
FlashSaleItem.belongsTo(FlashSale, { foreignKey: 'flashSaleId', as: 'flashSale' });

FlashSale.hasMany(FlashSaleCategory, { foreignKey: 'flashSaleId', as: 'flashSaleCategories' });
FlashSaleCategory.belongsTo(FlashSale, { foreignKey: 'flashSaleId', as: 'flashSale' });

Sku.hasMany(FlashSaleItem, { foreignKey: 'skuId', as: 'flashSaleSkus' });
FlashSaleItem.belongsTo(Sku, { foreignKey: 'skuId', as: 'flashSaleSku' }); // ⛔ Tránh alias 'sku'

Category.hasMany(FlashSaleCategory, { foreignKey: 'categoryId', as: 'flashSaleLinkedCategories' });
FlashSaleCategory.belongsTo(Category, { foreignKey: 'categoryId', as: 'flashSaleCategory' }); // ⛔ Tránh alias 'category'

// Quan hệ
Variant.hasMany(VariantValue, { foreignKey: 'variantId' }); // có thể giữ lại
Variant.hasMany(VariantValue, { foreignKey: 'variantId', as: 'values' }); // ✅ alias

VariantValue.belongsTo(Variant, { foreignKey: 'variantId', as: 'variant' }); // ✅ alias đúng

// 
Coupon.hasMany(CouponUser, { foreignKey: 'couponId', as: 'users' });
CouponUser.belongsTo(Coupon, { foreignKey: 'couponId' });

Coupon.hasMany(CouponCategory, { foreignKey: 'couponId', as: 'categories' });
CouponCategory.belongsTo(Coupon, { foreignKey: 'couponId' });

Coupon.hasMany(CouponItem, { foreignKey: 'couponId', as: 'products' });
CouponItem.belongsTo(Coupon, { foreignKey: 'couponId', as: 'coupon' }); // ✅ THÊM alias

// 
// — gán mỗi block (placement) cho 1 category (nullable; để trống = trang chủ)
Placement.belongsTo(Category, {
  foreignKey: 'categoryId',
  as: 'category',
  constraints: false   // nếu không cần ép foreignKey luôn luôn phải có
});
Category.hasMany(Placement, {
  foreignKey: 'categoryId',
  as: 'placements'
});

// 


const Province = require('./province');
const District = require('./district');
const Ward = require('./ward');
// 
// Danh mục bài viết
Category.hasMany(Post, { foreignKey: 'categoryId' });
Post.belongsTo(Category, { foreignKey: 'categoryId' });
Product.belongsTo(Brand, { foreignKey: 'brandId', as: 'brand' });
Brand.hasMany(Product, { foreignKey: 'brandId', as: 'products' }); // Nếu cần

// Tác giả bài viết
User.hasMany(Post, { foreignKey: 'authorId' });
Post.belongsTo(User, { foreignKey: 'authorId' });

// 
// Người dùng có một giỏ hàng
User.hasOne(Cart, { foreignKey: 'userId', onDelete: 'CASCADE' });
Cart.belongsTo(User, { foreignKey: 'userId' });

// Giỏ hàng có nhiều sản phẩm
Cart.hasMany(CartItem, { foreignKey: 'cartId', onDelete: 'CASCADE' });
CartItem.belongsTo(Cart, { foreignKey: 'cartId' });

// Mỗi CartItem tương ứng với 1 SKU
Sku.hasMany(CartItem, { foreignKey: 'skuId', onDelete: 'CASCADE' });
CartItem.belongsTo(Sku, { foreignKey: 'skuId' });
// 
// Associations
User.hasMany(Order, { foreignKey: 'userId' });
Order.belongsTo(User, { foreignKey: 'userId' });

Order.hasMany(OrderItem, { foreignKey: 'orderId', as: 'items' });
OrderItem.belongsTo(Order, { foreignKey: 'orderId' });

OrderItem.belongsTo(Sku, { foreignKey: 'skuId' });
Sku.hasMany(OrderItem, { foreignKey: 'skuId' });

Order.belongsTo(UserAddress, { foreignKey: 'userAddressId', as: 'shippingAddress' });

Order.belongsTo(PaymentMethod, { foreignKey: 'paymentMethodId', as: 'paymentMethod' });
PaymentMethod.hasMany(Order, { foreignKey: 'paymentMethodId' });

Order.hasOne(PaymentTransaction, { foreignKey: 'orderId', as: 'transaction' });
PaymentTransaction.belongsTo(Order, { foreignKey: 'orderId' });

PaymentTransaction.belongsTo(PaymentMethod, { foreignKey: 'paymentMethodId', as: 'method' });
// 
Role.hasMany(User, { foreignKey: "roleId" });
User.belongsTo(Role, { foreignKey: "roleId" });

Product.belongsTo(Category, { foreignKey: 'categoryId', as: 'category' });

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
Province.hasMany(District, { foreignKey: 'provinceId' });
District.belongsTo(Province, { foreignKey: 'provinceId' });
Category.hasMany(Category, {
  foreignKey: 'parentId',
  as: 'children'
});
Category.belongsTo(Category, {
  foreignKey: 'parentId',
  as: 'parent'
});
BannerPlacementAssignment.belongsTo(Banner, {
  foreignKey: 'bannerId',
  as: 'banner'
});

District.hasMany(Ward, { foreignKey: 'districtId' });
Ward.belongsTo(District, { foreignKey: 'districtId' });
// 
User.hasMany(UserAddress, { foreignKey: 'userId', onDelete: 'CASCADE' });
UserAddress.belongsTo(User, { foreignKey: 'userId' });

// ✅ THÊM VÀO dưới dòng UserAddress.belongsTo(User, ...)
UserAddress.belongsTo(Province, { foreignKey: 'provinceId', as: 'province' });
UserAddress.belongsTo(District, { foreignKey: 'districtId', as: 'district' });
UserAddress.belongsTo(Ward, { foreignKey: 'wardCode', targetKey: 'code', as: 'ward' });

module.exports = {
  User,
  Role,
    Province,
      Sku,

  Banner,
  Placement,
  BannerPlacementAssignment,

        Cart,           // ✅ thêm dòng này
  CartItem,       // ✅ thêm dòng này
  ProductMedia,
  HighlightedCategoryItem, // ✅ THÊM VÀO ĐÂY
  District,
  CouponUser,
CouponCategory,
SearchHistory,

CouponItem,
FlashSale,
  FlashSaleItem,
  FlashSaleCategory,
    UserAddress, // ✅ thêm dòng này
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
  Post, // ✅ THÊM DÒNG NÀY
 PostCategory,
 ProductVariant,
  Order,
  OrderItem,
  PaymentMethod,
  PaymentTransaction,
 Coupon, // ✅ thêm dòng này
  Product,
  UserToken,
  sequelize: connection,
};
