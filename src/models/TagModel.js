const { DataTypes } = require("sequelize");
const sequelize = require('../config/database');
const Tag = sequelize.define(
  "Tag",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    slug: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
  },
  {
    tableName: "tags",
    timestamps: true, // Sequelize sẽ tự tạo 2 cột createdAt và updatedAt
  }
);
module.exports = Tag;
