const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

  const StockLog = sequelize.define('StockLog', {
    skuId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    type: {
      type: DataTypes.ENUM('import', 'export', 'adjust'),
      allowNull: false
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    stockBefore: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    stockAfter: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    description: {
      type: DataTypes.STRING
    },
    reference: {
      type: DataTypes.STRING
    },
    userId: {
  type: DataTypes.INTEGER,
  allowNull: true
}
  }, {
    tableName: 'stockLogs'
  });


module.exports = StockLog;
