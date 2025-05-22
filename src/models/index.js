// src/models/index.js
const Sequelize = require("sequelize");
const connection = require("../config/database");

const User = require("./userModel");
const Role = require("./roleModel");
const UserToken = require("./userTokenModel");
const UserAddress = require('./UserAddress'); // ✅ thêm dòng này
// 
const Sku = require('./skuModel');
const ProductMedia = require('./productMediaModel');
const Product = require('./product');
Product.hasMany(Sku, { foreignKey: 'productId' });
Sku.belongsTo(Product, { foreignKey: 'productId' });

Sku.hasMany(ProductMedia, { foreignKey: 'skuId' });
ProductMedia.belongsTo(Sku, { foreignKey: 'skuId' });

const Variant = require('./variant');
const VariantValue = require('./variantvalue');

// Quan hệ
Variant.hasMany(VariantValue, { foreignKey: 'variantId' });
VariantValue.belongsTo(Variant, { foreignKey: 'variantId' });
// 

const Province = require('./province');
const District = require('./district');
const Ward = require('./ward');
// 

Role.hasMany(User, { foreignKey: "roleId" });
User.belongsTo(Role, { foreignKey: "roleId" });


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
  ProductMedia,
  District,
    UserAddress, // ✅ thêm dòng này
  Ward,
    Variant,
  VariantValue,
  Product,
  UserToken,
  sequelize: connection,
};
