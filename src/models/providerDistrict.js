const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ProviderDistrict = sequelize.define(
  'ProviderDistrict',
  {
    providerId: {
      type: DataTypes.INTEGER,
      primaryKey: true
    },
    districtId: {
      type: DataTypes.INTEGER,
      primaryKey: true
    },
     provinceId: {                // <<< thêm cột này
      type: DataTypes.INTEGER,
      allowNull: true,           // có thể NULL tới lúc map xong
      comment: 'Liên kết bảng provinces'
    },
    providerDistrictCode: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    providerDistrictName: {
      type: DataTypes.STRING(255)
    }
  },
  {
    tableName: 'providerdistricts',
    timestamps: false
  }
);

module.exports = ProviderDistrict;
