const { User, Role, RolePermission, Action, Subject } = require('../../models');

const AuthService = {
  async getUserInfo(userId) {
    const user = await User.findByPk(userId, {
      attributes: ['id', 'email', 'fullName', 'phone', 'gender', 'avatarUrl'],
      include: [
        {
          model: Role,
          attributes: ['id', 'name', 'description','canAccess'],
          through: { attributes: [] },
          include: [
            {
              model: RolePermission,
              as: 'rolePermissions',
              attributes: ['id', 'roleId', 'actionId', 'subjectId'],
              include: [
                { model: Action, as: 'action', attributes: ['key'] },
                { model: Subject, as: 'subject', attributes: ['key'] }
              ]
            }
          ]
        }
      ]
    });

    if (!user) return null;

    // ✅ BỔ SUNG LOGIC SUPER ADMIN TẠI ĐÂY
    const isAdmin = user.Roles.some(role => role.id === 1);

    const userInfo = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      gender: user.gender,
      avatarUrl: user.avatarUrl,
      roles: user.Roles.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        canAccess: r.canAccess
      })),
    };

    if (isAdmin) {
      // Nếu là admin, không cần đọc permissions chi tiết.
      // Gửi về một quyền đại diện cho toàn quyền.
      return {
        ...userInfo,
        permissions: [{ action: 'manage', subject: 'all' }] // <-- GỬI QUYỀN LỰC TỐI CAO
      };
    }

    // Nếu không phải admin, chạy logic cũ để lấy permissions chi tiết
    const permissions = [];
    (user.Roles || []).forEach((role) => {
      (role.rolePermissions || []).forEach((rp) => {
        if (rp.action && rp.subject) {
          permissions.push({
            action: rp.action.key,
            subject: rp.subject.key
          });
        }
      });
    });

    return {
      ...userInfo,
      permissions // Gửi đi danh sách quyền chi tiết
    };
  }
};

module.exports = AuthService;