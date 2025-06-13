// services/user.service.js
const { User, Role, Permission } = require("../../models");

exports.getUserDetail = async (userId) => {
  const user = await User.findByPk(userId, {
    attributes: [
      "id", "fullName", "email", "roleId",
      "phone", "gender", "dateOfBirth", "avatarUrl"
    ],
    include: [
      {
        model: Role,
        attributes: ["name", "description"],
        include: [
          {
            model: Permission,
            as: "permissions",
            attributes: ["action", "subject"], // ⚠️ đổi từ 'name' sang 'action', 'subject'
            through: { attributes: [] },
          },
        ],
      },
    ],
  });

  if (!user) return null;

  const u = user.toJSON();

  // Format ngày sinh
  const [year, month, day] = (u.dateOfBirth || "").split("-") || [];
  u.birthDate = { day: day || "", month: month || "", year: year || "" };
  delete u.dateOfBirth;

  u.role = u.Role?.name || null;

  // ✅ CHỈNH Ở ĐÂY
  u.permissions = u.Role?.permissions?.map(p => ({
    action: p.action,
    subject: p.subject
  })) || [];

  delete u.Role;

  return u;
};
