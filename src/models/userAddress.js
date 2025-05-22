const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const UserAddress = sequelize.define('UserAddress', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  userId: { type: DataTypes.INTEGER, allowNull: false },
  fullName: { type: DataTypes.STRING, allowNull: false },
  phone: { type: DataTypes.STRING, allowNull: false },
  street: { type: DataTypes.STRING, allowNull: false },
  provinceId: { type: DataTypes.INTEGER, allowNull: false },
  districtId: { type: DataTypes.INTEGER, allowNull: false },
  wardCode: { type: DataTypes.STRING, allowNull: false },
  isDefault: { type: DataTypes.BOOLEAN, defaultValue: false },
  addressType: { type: DataTypes.STRING, defaultValue: 'Nhà Riêng' }
}, {
  tableName: 'useraddresses',
  timestamps: true,
});

module.exports = UserAddress;
