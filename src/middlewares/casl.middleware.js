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

    console.log("roels", user.roles);
    console.log("permision", user.permissions)
    console.log(`[CASL] ✅ Check quyền: ${action} ${subject} =>`, ability.can(action, subject));

    if (ability.can(action, subject)) {
      return next();
    }
    return res.status(403).json({
      message: `Cấm: Không có quyền ${action} trên ${subject} 🚨 Danh sách quyền hiện tại: ${JSON.stringify(user.permissions)}`

    });
  };
};

module.exports = { checkPermission };
