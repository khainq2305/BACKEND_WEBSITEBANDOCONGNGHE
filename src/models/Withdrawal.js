const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Withdrawal = sequelize.define(
  "Withdrawal",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    walletId: { type: DataTypes.INTEGER, allowNull: false },
    amount: { type: DataTypes.BIGINT, allowNull: false },
    fee: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
    netAmount: { type: DataTypes.BIGINT, allowNull: false },
    method: { type: DataTypes.STRING(30), allowNull: false },
    accountName: { type: DataTypes.STRING(120), allowNull: false },
    accountNumber: { type: DataTypes.STRING(64), allowNull: false },
    bankCode: { type: DataTypes.STRING(32), allowNull: true },
    status: {
      type: DataTypes.ENUM("pending", "approved", "rejected", "canceled"),
      allowNull: false,
      defaultValue: "pending",
    },
    requestedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    processedAt: { type: DataTypes.DATE, allowNull: true },
    reason: { type: DataTypes.STRING(255), allowNull: true },
    meta: { type: DataTypes.JSON, allowNull: true },
  },
  {
    tableName: "withdrawals",
    timestamps: true,
  }
);

module.exports = Withdrawal;
