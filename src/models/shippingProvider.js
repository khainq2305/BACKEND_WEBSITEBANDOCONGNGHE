const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ShippingProvider = sequelize.define(
  'ShippingProvider',
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    code: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true          // 'ghn', 'ghtk'…
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  },
  {
    tableName: 'shippingProviders',
    timestamps: true,          // createdAt, updatedAt
    underscored: false         // camelCase giữ nguyên
  }
);

module.exports = ShippingProvider;
