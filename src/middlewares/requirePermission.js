const { User, Role, Permission } = require('../models/index')
const { checkJWT } = require('./checkJWT')

function requirePermission(permissionName) {
  return async (req, res, next) => {
    checkJWT(req, res, async () => {
      try {
        const userId = req.user.id;

        const user = await User.findOne({
          where: { id: userId },
          include: {
            model: Role,
            as: 'role',
            include: {
              model: Permission,
              as: 'permissions',
              where: { name: permissionName },
              required: false,
              attributes: ['name'],
              through: { attributes: [] },
            }
          }
        });

        if (!user || !user.role) {
          return res.status(403).json({ message: 'Bạn không có quyền truy cập!' });
        }

        const hasPermission = user.role.permissions.length > 0;

        if (!hasPermission) {
          return res.status(403).json({ message: 'Bạn không có quyền truy cập!' });
        }

        // Log ra console
        console.log('User data:', user.toJSON());

        // Trả về JSON data (chỉ test, không gọi next())
        // return res.json({
        //   message: 'Bạn có quyền truy cập',
        //   user,
        // });

        // Nếu muốn middleware bình thường, bỏ đoạn return trên, thay bằng:
        next();

      } catch (error) {
        console.error('Lỗi kiểm tra quyền:', error);
        res.status(500).json({ message: 'Lỗi server khi kiểm tra quyền!' });
      }
    });
  };
}



module.exports = { requirePermission };
