const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
  const Subject =  sequelize.define('Subject', {
    key: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    label: {
      type: DataTypes.STRING
    },
    description: {
      type: DataTypes.TEXT
    }
  }, {
    tableName: 'subjects',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false
  });
module.exports = Subject