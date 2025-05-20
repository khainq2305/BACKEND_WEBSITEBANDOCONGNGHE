// src/models/index.js
const Sequelize = require("sequelize");
const connection = require("../config/database");

const User = require("./userModel");
const Role = require("./roleModel");
const UserToken = require("./userTokenModel");


Role.hasMany(User, { foreignKey: "roleId" });
User.belongsTo(Role, { foreignKey: "roleId" });


User.hasMany(UserToken, {
  foreignKey: "userId",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});
UserToken.belongsTo(User, {
  foreignKey: "userId",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});

module.exports = {
  User,
  Role,
  UserToken,
  sequelize: connection,
};
