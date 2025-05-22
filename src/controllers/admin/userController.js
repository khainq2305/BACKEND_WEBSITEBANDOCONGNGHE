const User = require("../../models/userModel");
const Role = require("../../models/roleModel");
const sendEmail = require("../../utils/sendEmail");
const {
  sendAccountStatusEmail,
} = require("../../services/common/emailService");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { Op } = require("sequelize");

const getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "", status } = req.query;

    const whereClause = {
      fullName: { [Op.like]: `%${search}%` },
    };

    switch (status) {
      case "1": // Hoạt động
        whereClause.status = 1;
        whereClause.scheduledBlockAt = null;
        break;
      case "2": // Đã lên lịch khóa
        whereClause.status = 1;
        whereClause.scheduledBlockAt = { [Op.ne]: null };
        break;
      case "0": // Đang bị khóa
        whereClause.status = 0;
        whereClause.scheduledBlockAt = null;
        break;
      case "-1": // Khóa vĩnh viễn
        whereClause.status = -1;
        break;
    }

    const offset = (page - 1) * limit;

    const { rows: users, count } = await User.findAndCountAll({
      where: whereClause,
      attributes: { exclude: ["password"] },
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [["id", "ASC"]],
    });

    return res.json({
      data: users,
      total: count,
      currentPage: parseInt(page),
      totalPages: Math.ceil(count / limit),
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Không thể lấy danh sách người dùng", error });
  }
};

const createUser = async (req, res) => {
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

    return res
      .status(201)
      .json({ message: "Tạo tài khoản thành công", user: newUser });
  } catch (error) {
    console.error("❌ Lỗi tạo tài khoản:", error);
    return res.status(500).json({ message: "Không thể tạo tài khoản", error });
  }
};

const getAllRoles = async (req, res) => {
  try {
    const roles = await Role.findAll({ attributes: ["id", "name"] });
    return res.json(roles);
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Không thể lấy danh sách vai trò", error });
  }
};

const updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ message: "Người dùng không tồn tại" });
    }

    if (status === 0) {
      const blockTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await user.update({ scheduledBlockAt: blockTime });
      await sendAccountStatusEmail(user.email, user.fullName, 0, reason);
      return res.json({
        message: `Đã lên lịch khóa tài khoản ${user.fullName} sau 24 giờ.`,
      });
    }

    if (status === -1) {
      await user.update({ status: -1, scheduledBlockAt: null });
      return res.json({
        message: `Đã khóa vĩnh viễn tài khoản ${user.fullName}`,
      });
    }

    await user.update({ status: 1, scheduledBlockAt: null });
    await sendAccountStatusEmail(user.email, user.fullName, 1);
    return res.json({ message: `Đã mở khóa tài khoản ${user.fullName}` });
  } catch (error) {
    console.error("❌ Lỗi cập nhật trạng thái:", error);
    return res
      .status(500)
      .json({ message: "Không thể cập nhật trạng thái tài khoản", error });
  }
};

const resetUserPassword = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ message: "Người dùng không tồn tại" });
    }

    const newPassword = crypto.randomBytes(4).toString("hex");
    const hashed = await bcrypt.hash(newPassword, 10);

    await user.update({ password: hashed });

    const html = `...`; // giữ nguyên phần gửi email HTML
    await sendEmail(user.email, "Cấp lại mật khẩu truy cập hệ thống", html);

    return res.json({
      message: "Mật khẩu mới đã được gửi về email của người dùng.",
    });
  } catch (error) {
    console.error("❌ Lỗi reset mật khẩu:", error);
    if (error.code === "EAUTH") {
      return res
        .status(500)
        .json({
          message: "Gửi email thất bại. Vui lòng kiểm tra cấu hình email.",
        });
    }
    return res
      .status(500)
      .json({ message: "Không thể cấp lại mật khẩu", error });
  }
};

const cancelUserScheduledBlock = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findByPk(id);
    if (!user)
      return res.status(404).json({ message: "Người dùng không tồn tại" });
    if (!user.scheduledBlockAt)
      return res
        .status(400)
        .json({ message: "Tài khoản này không có lịch khóa" });
    await user.update({ scheduledBlockAt: null });
    return res.json({ message: `Đã huỷ lịch khóa tài khoản ${user.fullName}` });
  } catch (error) {
    console.error("❌ Lỗi huỷ lịch khóa:", error);
    return res.status(500).json({ message: "Không thể huỷ lịch khóa", error });
  }
};

module.exports = {
  getAllUsers,
  createUser,
  getAllRoles,
  updateUserStatus,
  resetUserPassword,
  cancelUserScheduledBlock,
};
