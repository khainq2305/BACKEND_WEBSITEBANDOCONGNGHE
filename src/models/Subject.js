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
    },
    createdAt: {type: DataTypes.DATE},
  }, {
    tableName: 'subjects',
    timestamps: true,
    updatedAt: false
  });
module.exports = Subject