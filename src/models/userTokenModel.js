// src/models/userTokenModel.js
const { DataTypes } = require("sequelize");
const connection = require("../config/database");

const UserToken = connection.define("UserToken", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: "Users",
      key: "id",
    },
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  token: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
 type: {
  type: DataTypes.ENUM("passwordReset", "emailVerification", "changePasswordAttempt"),
  allowNull: false,
},

  lockedUntil: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  usedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  sendCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  lastSentAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  ipAddress: {
    type: DataTypes.STRING,
    allowNull: false,
  },
}, {
  tableName: "userTokens",
  timestamps: false,
});

module.exports = UserToken;
