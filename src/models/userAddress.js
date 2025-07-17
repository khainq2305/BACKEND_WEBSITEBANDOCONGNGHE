const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const UserAddress = sequelize.define('UserAddress', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  userId: { type: DataTypes.INTEGER, allowNull: false },
  fullName: { type: DataTypes.STRING, allowNull: false },
  phone: { type: DataTypes.STRING, allowNull: false },
streetAddress: {
  type: DataTypes.STRING,
  allowNull: false,
  field: 'streetAddress' 
},
 wardId: { // Tên thuộc tính khớp với tên cột mới trong DB
    type: DataTypes.INTEGER, // Đảm bảo kiểu dữ liệu là INTEGER
    allowNull: false, // Thay đổi tùy theo logic của bạn: true nếu có thể null, false nếu bắt buộc
    // BỎ DÒNG field: 'wardCode' vì tên đã khớp với DB
  },
  provinceId: { type: DataTypes.INTEGER, allowNull: false },
  districtId: { type: DataTypes.INTEGER, allowNull: false },
  // wardCode: { type: DataTypes.STRING, allowNull: false },
  isDefault: { type: DataTypes.BOOLEAN, defaultValue: false },
  label: {
  type: DataTypes.STRING,
  allowNull: true, // ✅ Cho phép null nếu người dùng không nhập
},
}, {
  tableName: 'useraddresses',
  timestamps: true,
});

module.exports = UserAddress;
