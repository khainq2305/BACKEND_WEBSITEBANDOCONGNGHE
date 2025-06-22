// services/user.service.js
const { User, Role, RolePermission, Action, Subject } = require("../../models");

exports.getUserDetail = async (userId) => {
  const user = await User.findByPk(userId, {
    attributes: [
      "id", "fullName", "email",
      "phone", "gender", "dateOfBirth", "avatarUrl"
    ],
    include: [
      {
        model: Role,
        attributes: ["id", "name", "description"],
        through: { attributes: [] },
        include: [
          {
            model: RolePermission,
            as: 'rolePermissions',
            attributes: ['id'], // hoặc thêm created_at nếu muốn
            include: [
              {
                model: Action,
                as: 'action',
                attributes: ['key']
              },
              {
                model: Subject,
                as: 'subject',
                attributes: ['key']
              }
            ]
          }
        ]
      }
    ]
  });

  if (!user) return null;

  const u = user.toJSON();

  // 🎯 Format ngày sinh thành { day, month, year }
  const [year, month, day] = (u.dateOfBirth || "").split("-") || [];
  u.birthDate = { day: day || "", month: month || "", year: year || "" };
  delete u.dateOfBirth;

  // 🎯 Format roles
  u.roles = u.Roles?.map(r => ({
    id: r.id,
    name: r.name,
    description: r.description
  })) || [];

  // 🎯 Extract and format permissions (action + subject)
  const permissionKey = (p) => `${p.action}:${p.subject}`;

  const rawPermissions = u.Roles?.flatMap(r =>
    r.rolePermissions?.map(rp => ({
      action: rp.action?.key,
      subject: rp.subject?.key
    })) || []
  ) || [];

  // 🎯 Remove duplicates
  u.permissions = Array.from(
    new Map(rawPermissions.map(p => [permissionKey(p), p])).values()
  );

  // 🧹 Cleanup
  delete u.Roles;
  delete u.Role;

  return u;
};


