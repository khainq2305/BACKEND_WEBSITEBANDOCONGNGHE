const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ProviderWard = sequelize.define(
  'ProviderWard',
  {
    providerId: {
      type: DataTypes.INTEGER,
      primaryKey: true
    },
    wardId: {
      type: DataTypes.INTEGER,
      primaryKey: true
    },
    providerWardCode: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    providerWardName: {
      type: DataTypes.STRING(255)
    }
  },
  {
    tableName: 'providerWards',
    timestamps: false
  }
);

module.exports = ProviderWard;
