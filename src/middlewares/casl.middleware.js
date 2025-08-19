const { defineAbilitiesFor } = require('../utils/ability');

const checkPermission = (action, subject) => {
  return (req, res, next) => {
    const user = req.user;

    if (!user || !user.roles || !user.permissions) {
      return res.status(403).json({
        message: 'Cấm: Người dùng không có vai trò hoặc quyền hợp lệ.'
      });
    }
    const ability = defineAbilitiesFor(user.permissions, user.roles);

    if (ability.can(action, subject)) {
      return next();
    }
    return res.status(403).json({
      message: 'Không có quyền xóa'

    });
  };
};

module.exports = { checkPermission };
