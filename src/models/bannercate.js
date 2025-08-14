const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const BannerCate = sequelize.define("BannerCate", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  bannerId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  categoryId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  sortOrder: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  tableName: "bannercate", 
  timestamps: true
});

module.exports = BannerCate;
