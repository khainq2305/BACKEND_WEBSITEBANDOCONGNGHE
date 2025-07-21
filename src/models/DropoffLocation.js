// models/DropoffLocation.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const DropoffLocation = sequelize.define('DropoffLocation', {
  providerId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'shippingProviders', key: 'id' },
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Tên bưu cục',
  },
  address: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Địa chỉ đầy đủ của bưu cục',
  },
  provinceCode: {
    type: DataTypes.STRING(20),
    allowNull: true,
  },
  districtCode: {
    type: DataTypes.STRING(20),
    allowNull: true,
  },
  wardCode: {
    type: DataTypes.STRING(20),
    allowNull: true,
  },
  lat: {
    type: DataTypes.DECIMAL(10, 6),
    allowNull: true,
  },
  lng: {
    type: DataTypes.DECIMAL(10, 6),
    allowNull: true,
  },
}, {
  tableName: 'dropofflocations',
  timestamps: true,
});

module.exports = DropoffLocation;
