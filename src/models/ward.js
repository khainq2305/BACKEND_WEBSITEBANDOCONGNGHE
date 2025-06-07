const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Ward = sequelize.define('Ward', {
  code: {
    type: DataTypes.STRING,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
   ghnCode: {             // ✅ THÊM TRƯỜNG NÀY
    type: DataTypes.STRING,
    allowNull: false,
    field: 'code',        // ánh xạ với cột 'code' trong DB
  },
  districtId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
}, {
  tableName: 'Wards',
  timestamps: false,
});

module.exports = Ward;
