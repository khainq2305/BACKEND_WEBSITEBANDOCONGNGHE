const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const District = sequelize.define('District', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  ghnCode: {
  type: DataTypes.INTEGER,
  allowNull: true,
}
,
  provinceId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
}, {
 tableName: 'districts', // ✅ sửa lại chữ thường
  timestamps: false,
});

module.exports = District;
