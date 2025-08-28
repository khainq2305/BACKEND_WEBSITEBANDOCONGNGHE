const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const OrderCoupon = sequelize.define(
  "OrderCoupon",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    orderId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    couponId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    tableName: "ordercoupons",
    timestamps: true,
  }
);

module.exports = OrderCoupon;
