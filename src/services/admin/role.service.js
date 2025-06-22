// services/role.service.js
const { Role, RolePermission, User, sequelize } = require("../../models");

const generateKeyFromName = (name) => {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
};

class RoleService {
  async findAll() {
    return await Role.findAll({
      attributes: {
        include: [
          "name",
          "description",
          [
            sequelize.literal(
              `(SELECT COUNT(*) FROM userroles WHERE userroles.roleId = Role.id)`
            ),
            "userCount",
          ],
        ],
      },
      order: [["createdAt", "ASC"]],
    });
  }

  async create({ name, description }) {
    const key = generateKeyFromName(name);
    const exists = await Role.findOne({ where: { key } });
    if (exists) {
      throw new Error("ROLE_EXISTS");
    }
    return await Role.create({ key, name, description });
  }

  async getById(id) {
    return await Role.findByPk(id);
  }

  async update(id, { name, description }) {
    const role = await Role.findByPk(id);
    if (!role) return null;
    role.name = name || role.name;
    role.description = description || role.description;
    await role.save();
    return role;
  }

  async remove(id, force = false) {
    const DEFAULT_ROLE_ID = 2;
    const role = await Role.findByPk(id);
    if (!role) return { notFound: true };

    if (role.name === 'Admin') return { isAdmin: true };

    if (force) {
      await RolePermission.destroy({ where: { roleId: id } });
      await User.update({ roleId: DEFAULT_ROLE_ID }, { where: { roleId: id } });
    }

    await role.destroy();
    return { success: true };
  }
}

module.exports = new RoleService();
