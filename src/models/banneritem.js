const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const BannerItem = sequelize.define("BannerItem", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  bannerId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  productId: {
    type: DataTypes.INTEGER,
    allowNull: false
  }
}, {
  tableName: "banneritem", 
  timestamps: false // tắt createdAt, updatedAt
});

module.exports = BannerItem;
