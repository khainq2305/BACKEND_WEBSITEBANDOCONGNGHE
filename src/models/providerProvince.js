const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ProviderProvince = sequelize.define(
  'ProviderProvince',
  {
    providerId: {
      type: DataTypes.INTEGER,
      primaryKey: true
    },
    provinceId: {
      type: DataTypes.INTEGER,
      primaryKey: true
    },
    providerProvinceCode: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    providerProvinceName: {
      type: DataTypes.STRING(255)
    }
  },
  {
    tableName: 'providerprovinces',
    timestamps: false
  }
);

module.exports = ProviderProvince;
