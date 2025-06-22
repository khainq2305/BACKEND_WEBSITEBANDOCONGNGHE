const { Op } = require("sequelize");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

// const User = require("../../models/userModel");
const Role = require("../../models/roleModel");
const sendEmail = require("../../utils/sendEmail");
const {
  sendAccountStatusEmail,
} = require("../../services/common/emailService");
const { getUserDetail } = require("../../services/admin/user.service");

const { User, UserRoles } = require("../../models");
class UserController {
  static async getAllUsers(req, res) {
    try {
      const { page = 1, limit = 10, search = "", status } = req.query;

      const whereClause = { deletedAt: null };
      if (search) whereClause.fullName = { [Op.like]: `%${search}%` };
      if (status === "1") whereClause.status = 1;
      else if (status === "0") whereClause.status = 0;

      const offset = (page - 1) * limit;
      const { rows: users, count } = await User.findAndCountAll({
        where: whereClause,
        attributes: { exclude: ["password"] },
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [["id", "ASC"]],
      });

      res.json({
        data: users,
        total: count,
        currentPage: parseInt(page),
        totalPages: Math.ceil(count / limit),
      });
    } catch (error) {
      res
        .status(500)
        .json({ message: "Không thể lấy danh sách người dùng", error });
    }
  }

  static async createUser(req, res) {
    try {
      const { fullName, email, password, phone, roleId, status } = req.body;

      const existingUser = await User.findOne({ where: { email } });
      if (existingUser) {
        return res.status(400).json({
          errors: [{ field: "email", message: "Email đã được sử dụng!" }],
        });
      }

      const newUser = await User.create({
        fullName,
        email,
        password,
        roleId,
        status,
        ...(phone ? { phone } : {}),
      });

      res
        .status(201)
        .json({ message: "Tạo tài khoản thành công", user: newUser });
    } catch (error) {
      console.error("❌ Lỗi tạo tài khoản:", error);
      res.status(500).json({ message: "Không thể tạo tài khoản", error });
    }
  }

  static async getAllRoles(req, res) {
    try {
      const roles = await Role.findAll({ attributes: ["id", "name"] });
      res.json(roles);
    } catch (error) {
      res
        .status(500)
        .json({ message: "Không thể lấy danh sách vai trò", error });
    }
  }

  static async updateUserStatus(req, res) {
    try {
      const { id } = req.params;
      const status = parseInt(req.body.status, 10);
      const reason = req.body.reason || "";

      if (![0, 1].includes(status)) {
        return res.status(400).json({ message: "Trạng thái không hợp lệ" });
      }

      const user = await User.findByPk(id);
      if (!user)
        return res.status(404).json({ message: "Người dùng không tồn tại" });

      if (user.id === req.user.id && status === 0) {
        return res
          .status(400)
          .json({ message: "Không thể tự ngưng tài khoản chính mình" });
      }

      await user.update({ status });
      await sendAccountStatusEmail(user.email, user.fullName, status, reason);

      res.json({
        message:
          status === 1
            ? `Đã chuyển ${user.fullName} sang HOẠT ĐỘNG`
            : `Đã chuyển ${user.fullName} sang NGỪNG HOẠT ĐỘNG`,
      });
    } catch (error) {
      console.error("❌ Lỗi cập nhật trạng thái:", error);
      res
        .status(500)
        .json({ message: "Không thể cập nhật trạng thái tài khoản", error });
    }
  }

  static async resetUserPassword(req, res) {
    try {
      const { id } = req.params;
      const user = await User.findByPk(id);
      if (!user)
        return res.status(404).json({ message: "Người dùng không tồn tại" });

      const newPassword = crypto.randomBytes(4).toString("hex");
      const hashed = await bcrypt.hash(newPassword, 10);
      await user.update({ password: hashed });

      const html = `...`; // Nội dung email HTML
      await sendEmail(user.email, "Cấp lại mật khẩu truy cập hệ thống", html);

      res.json({
        message: "Mật khẩu mới đã được gửi về email của người dùng.",
      });
    } catch (error) {
      console.error("❌ Lỗi reset mật khẩu:", error);
      if (error.code === "EAUTH") {
        return res
          .status(500)
          .json({ message: "Gửi email thất bại. Kiểm tra cấu hình." });
      }
      res.status(500).json({ message: "Không thể cấp lại mật khẩu", error });
    }
  }

  static async deleteInactiveUsers(req, res) {
    try {
      const threshold = new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000);
      const count = await User.destroy({
        where: { lastLoginAt: { [Op.lt]: threshold } },
      });
      res.json({
        message: `Đã xoá ${count} tài khoản không hoạt động trên 3 năm.`,
      });
    } catch (error) {
      res.status(500).json({ message: "Lỗi khi xoá người dùng", error });
    }
  }

  static async getDeletedUsers(req, res) {
    try {
      const { page = 1, limit = 10, search = "" } = req.query;
      const offset = (page - 1) * limit;

      const whereClause = {
        [Op.or]: [
          { fullName: { [Op.like]: `%${search}%` } },
          { email: { [Op.like]: `%${search}%` } },
        ],
        deletedAt: { [Op.ne]: null },
      };

      const { rows, count } = await User.findAndCountAll({
        where: whereClause,
        paranoid: false,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [["id", "ASC"]],
      });

      res.json({
        data: rows,
        total: count,
        currentPage: parseInt(page),
        totalPages: Math.ceil(count / limit),
      });
    } catch (err) {
      res.status(500).json({ message: "Lỗi lấy danh sách đã xoá", error: err });
    }
  }

  static async getUserById(req, res) {
    try {
      const user = await getUserDetail(req.params.id);

      if (!user) return res.status(404).json({ message: "Không tìm thấy" });
      res.json({ data: user });
    } catch (err) {
      res.status(500).json({ message: "Lỗi server", error: err });
    }
  }

  static async forceDeleteManyUsers(req, res) {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "Danh sách ID không hợp lệ" });
      }

      const deleted = await User.destroy({
        where: { id: { [Op.in]: ids } },
        force: true,
      });

      res.json({ message: `Đã xoá ${deleted} tài khoản vĩnh viễn.` });
    } catch (err) {
      res.status(500).json({ message: "Lỗi xoá vĩnh viễn", error: err });
    }
  }

  static async updateUserRoles(req, res) {
    const { userId } = req.params;
    const { roleIds } = req.body; // mảng ID: [1, 2, 3]

    if (!Array.isArray(roleIds)) {
      return res
        .status(400)
        .json({ message: "Danh sách vai trò không hợp lệ." });
    }

    try {
      const user = await User.findByPk(userId);
      if (!user) {
        return res.status(404).json({ message: "Không tìm thấy người dùng." });
      }

      // Xóa hết role cũ rồi gán mới
      await user.setRoles(roleIds); // Sequelize magic method

      return res.status(200).json({ message: "Cập nhật vai trò thành công." });
    } catch (error) {
      console.error("[UpdateUserRoles]", error);
      return res
        .status(500)
        .json({ message: "Lỗi server khi cập nhật vai trò." });
    }
  }

  static async getUsersByRole(req, res, next) {
    try {
      const { roleId } = req.params;

      const users = await User.findAll({
        include: [
          {
            model: Role,
            where: { id: roleId },
            through: { attributes: [] }, // ẩn bảng trung gian
            attributes: [], // không cần data Role
          },
        ],

        attributes: ["id", "fullName", "email", "phone", "status"],
        order: [["id", "ASC"]],
      });

      return res.status(200).json({
        success: true,
        message: `Tìm thấy ${users.length} user thuộc roleId ${roleId}.`,
        data: users,
        totalUsers: users.length,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = UserController;
