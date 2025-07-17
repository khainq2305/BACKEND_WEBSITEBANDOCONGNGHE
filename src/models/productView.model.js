// src/models/ProductView.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ProductView = sequelize.define('ProductView', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false, // UserID phải có để biết ai xem
    references: {
      model: 'users',
      key: 'id'
    },
    onDelete: 'CASCADE' // Nếu user bị xóa, các lượt xem cũng xóa
  },
  productId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'products',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  // THÊM CÁC TRƯỜNG BỊ THIẾU Ở ĐÂY để khớp với code trong RecommendationController.js
  viewCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0, // Bắt đầu từ 0
    allowNull: false
  },
  firstViewedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false
  },
  lastViewedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false
  },
  // KẾT THÚC THÊM CÁC TRƯỜNG
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false
  },
  deletedAt: {
    type: DataTypes.DATE,
    allowNull: true // Cho phép null
  }
}, {
  tableName: 'productviews',
  timestamps: true,
  paranoid: false // <-- Đặt là TRUE nếu bạn muốn soft delete và có cột deletedAt trong DB
                  //     Hoặc FALSE nếu bạn không muốn soft delete và sẽ không thêm cột deletedAt vào DB
});

// KHÔNG CÓ HÀM ProductView.associate = function(models) { ... } Ở ĐÂY
// Để tuân thủ yêu cầu "đéo mượn ghi quan hệ mô đó" trong file model này.

module.exports = ProductView;