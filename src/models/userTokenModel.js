// src/models/userTokenModel.js
const { DataTypes } = require("sequelize");
const connection = require("../config/database");
const User = require("./userModel");

const UserToken = connection.define("UserToken", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: true, // ✅ Cho phép null, vì không phải lúc nào cũng có userId
    references: {
      model: User,
      key: "id",
    },
    onDelete: "CASCADE", // Nếu user bị xóa, token cũng bị xóa
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true, // ✅ Cho phép null, dùng khi xác thực email
  },
  token: {
    type: DataTypes.TEXT, // ✅ Đổi thành TEXT để lưu JWT dài
    allowNull: false,
  },
  sendCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0, // ✅ Đặt mặc định là 0
  },
  type: {
    type: DataTypes.ENUM("passwordReset", "emailVerification"),
    allowNull: false,
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  lockUntil: {
    type: DataTypes.DATE,
    allowNull: true, // ✅ Thời gian khóa nếu gửi quá nhiều
  },
  resendCooldown: {
    type: DataTypes.DATE,
    allowNull: true, // ✅ Thời gian cooldown gửi lại
  },
}, {
  tableName: 'userTokens',
  timestamps: false, // Không cần updatedAt
});

// ✅ Đảm bảo khóa ngoại userId kết nối với bảng users
UserToken.belongsTo(User, { foreignKey: "userId", onDelete: "CASCADE" });
User.hasMany(UserToken, { foreignKey: "userId", onDelete: "CASCADE" });

module.exports = UserToken;
