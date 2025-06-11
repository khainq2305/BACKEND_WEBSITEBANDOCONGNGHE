const { User, Role, Permission } = require('../models/index')
async function hasPermission(userId, permissionName) {
  const user = await User.findByPk(userId, {
    include: {
      model: Role,
      as: 'role',
      include: {
        model: Permission,
        as: 'permissions',
        where: { name: permissionName },
        required: true,
      },
    },
  });

  return !!user; // nếu tìm được thì có quyền
}

module.exports = { hasPermission };