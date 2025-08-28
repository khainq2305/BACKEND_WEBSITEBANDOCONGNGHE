const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Coupon = sequelize.define(
  "Coupon",
  {
    code: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
    },
    title: DataTypes.STRING(255),
    description: DataTypes.TEXT,
    bannerUrl: DataTypes.STRING(255),
    discountType: {
      type: DataTypes.ENUM("percent", "amount"),
      allowNull: true,
    },
    discountValue: DataTypes.DECIMAL(12, 2),
    minOrderValue: DataTypes.DECIMAL(12, 2),
    maxDiscountValue: DataTypes.DECIMAL(12, 2),
    maxUsagePerUser: DataTypes.INTEGER,
    totalQuantity: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    usedCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    startTime: DataTypes.DATE,
    endTime: DataTypes.DATE,
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    type: {
      type: DataTypes.ENUM("discount", "shipping"),
      allowNull: false,
      defaultValue: "discount",
    },
    applyScope: {
      type: DataTypes.ENUM("all", "product"),
      allowNull: false,
      defaultValue: "all",
    },
    visibility: {
      type: DataTypes.ENUM("public", "private", "auto"),
      allowNull: false,
      defaultValue: "public",
    },
  },
  {
    tableName: "coupons",
    paranoid: true,
    timestamps: true,
  }
);

module.exports = Coupon;
