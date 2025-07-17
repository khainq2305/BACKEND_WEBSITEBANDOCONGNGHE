const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ShippingService = sequelize.define(
  'ShippingService',
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    providerId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'shippingProviders', key: 'id' }
    },
    serviceCode: {
      type: DataTypes.STRING(50),
      allowNull: false          // 'ECO', 'EXPRESS'
    },
    serviceName: {
      type: DataTypes.STRING(100),
      allowNull: false          // 'GHN – Nhanh'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  },
  {
    tableName: 'shippingServices',
    timestamps: true,
    underscored: false,
    indexes: [
      { unique: true, fields: ['providerId', 'serviceCode'] }
    ]
  }
);

module.exports = ShippingService;
