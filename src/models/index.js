const User = require('./userModel');
const Role = require('./roleModel');

// Quan hệ: 1 Role → N Users
Role.hasMany(User, { foreignKey: 'roleId' });
User.belongsTo(Role, { foreignKey: 'roleId' });

module.exports = {
  User,
  Role
};
