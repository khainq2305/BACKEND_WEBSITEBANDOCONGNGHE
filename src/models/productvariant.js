const { DataTypes } = require('sequelize');
const connection = require('../config/database');

const ProductVariant = connection.define('ProductVariant', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
   productId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'products', // TÊN BẢNG Products thực tế trong DB (bạn đã xác nhận là 'products')
      key: 'id'          // TÊN CỘT khóa chính thực tế của bảng Products (bạn đã xác nhận là 'id')
    }
  },
  variantId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'variants', // !! QUAN TRỌNG: TÊN BẢNG Variants thực tế trong DB là gì? (Ví dụ: 'variants', 'Variants')
      key: 'id'          // TÊN CỘT khóa chính thực tế của bảng Variants (thường là 'id')
    }
  },
  sortOrder: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'productvariants',
  timestamps: true,
  paranoid: true // để hỗ trợ cột deletedAt
});

module.exports = ProductVariant;
