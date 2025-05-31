const Sequelize = require("sequelize");
const connection = require("../config/database");

const User = require("./userModel");
const Role = require("./roleModel");
const UserToken = require("./userTokenModel");
const UserAddress = require("./UserAddress");
const Sku = require("./skuModel");
const ProductMedia = require("./productMediaModel");
const Product = require("./product");
const Post = require("./post");
const Category = require("./categoryPostModel");
const Variant = require("./variant");
const VariantValue = require("./variantvalue");
const Province = require("./province");
const District = require("./district");
const Ward = require("./ward");
const Review = require("./review.model")(connection, Sequelize);
const ReviewMedia = require("./reviewmedia.model")(connection, Sequelize);


// Product Relations
Product.hasMany(Sku, { foreignKey: "productId" });
Sku.belongsTo(Product, { foreignKey: "productId", as: "product" });

Sku.hasMany(ProductMedia, { foreignKey: "skuId" });
ProductMedia.belongsTo(Sku, { foreignKey: "skuId" });

// Variant Relations
Variant.hasMany(VariantValue, { foreignKey: "variantId" });
VariantValue.belongsTo(Variant, { foreignKey: "variantId" });

// Blog Relations
Category.hasMany(Post, { foreignKey: "categoryId" });
Post.belongsTo(Category, { foreignKey: "categoryId" });

User.hasMany(Post, { foreignKey: "authorId" });
Post.belongsTo(User, { foreignKey: "authorId" });

// Role Relations
Role.hasMany(User, { foreignKey: "roleId" });
User.belongsTo(Role, { foreignKey: "roleId" });

// Token Relations
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

// Address Relations
Province.hasMany(District, { foreignKey: "provinceId" });
District.belongsTo(Province, { foreignKey: "provinceId" });

District.hasMany(Ward, { foreignKey: "districtId" });
Ward.belongsTo(District, { foreignKey: "districtId" });

User.hasMany(UserAddress, { foreignKey: "userId", onDelete: "CASCADE" });
UserAddress.belongsTo(User, { foreignKey: "userId" });
UserAddress.belongsTo(Province, { foreignKey: "provinceId", as: "province" });
UserAddress.belongsTo(District, { foreignKey: "districtId", as: "district" });
UserAddress.belongsTo(Ward, { foreignKey: "wardCode", targetKey: "code", as: "ward" });

// Review Relations (linked to SKU)
Review.belongsTo(User, { foreignKey: "userId", as: "user" });
Review.belongsTo(User, { foreignKey: "responderId", as: "responder" });
Review.belongsTo(Sku, { foreignKey: "skuId", as: "sku" });
User.hasMany(Review, { foreignKey: "userId" });
Sku.hasMany(Review, { foreignKey: "skuId" });
Review.hasMany(ReviewMedia, { foreignKey: "reviewId", as: "medias" });
ReviewMedia.belongsTo(Review, { foreignKey: "reviewId", as: "review" });


module.exports = {
  User,
  Role,
  Province,
  Sku,
  ProductMedia,
  District,
  UserAddress,
  Ward,
  Variant,
  VariantValue,
  Post,
  Category,
  Product,
  UserToken,
  Review,
  ReviewMedia,
  sequelize: connection,
};
