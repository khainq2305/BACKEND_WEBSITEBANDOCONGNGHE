const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ProductQuestion = sequelize.define('ProductQuestion', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  productId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  isAnswered: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  isHidden: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'productquestions',
  timestamps: true
});

module.exports = ProductQuestion;
