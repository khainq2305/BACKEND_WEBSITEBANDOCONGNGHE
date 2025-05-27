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
       deletedAt: null,
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
    const status = parseInt(req.body.status, 10); 
    const reason = req.body.reason || '';

    if (![0, 1].includes(status)) {
      return res.status(400).json({ message: "Trạng thái không hợp lệ" });
    }

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ message: "Người dùng không tồn tại" });
    }

    if (user.id === req.user.id && status === 0) {
      return res.status(400).json({ message: "Bạn không thể ngưng hoạt động chính tài khoản của mình." });
    }

    await user.update({ status });

    await sendAccountStatusEmail(user.email, user.fullName, status, reason);

    return res.json({
      message:
        status === 1
          ? `Đã chuyển tài khoản ${user.fullName} sang trạng thái HOẠT ĐỘNG`
          : `Đã chuyển tài khoản ${user.fullName} sang trạng thái NGỪNG HOẠT ĐỘNG`,
    });
  } catch (error) {
    console.error("❌ Lỗi cập nhật trạng thái:", error);
    return res.status(500).json({
      message: "Không thể cập nhật trạng thái tài khoản",
      error,
    });
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
      return res.status(500).json({
        message: "Gửi email thất bại. Vui lòng kiểm tra cấu hình email.",
      });
    }
    return res
      .status(500)
      .json({ message: "Không thể cấp lại mật khẩu", error });
  }
};



const deleteInactiveUsers = async (req, res) => {
  try {
    const threshold = new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000); // 3 năm

    const usersToDelete = await User.findAll({
      where: {
        lastLoginAt: { [Op.lt]: threshold }
      }
    });

    const count = await User.destroy({
      where: {
        lastLoginAt: { [Op.lt]: threshold }
      }
    });

    return res.json({ message: `Đã xóa ${count} tài khoản không hoạt động trên 3 năm.` });
  } catch (error) {
    return res.status(500).json({ message: "Lỗi khi xóa người dùng", error });
  }
};
// userController.js
const getDeletedUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "" } = req.query;

    const offset = (page - 1) * limit;
const whereClause = {
  [Op.or]: [
    { fullName: { [Op.like]: `%${search}%` } },
    { email: { [Op.like]: `%${search}%` } }
  ],
  deletedAt: { [Op.ne]: null }
};


    const { rows, count } = await User.findAndCountAll({
      where: whereClause,
      paranoid: false,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [["id", "ASC"]]
    });

    return res.json({
      data: rows,
      total: count,
      currentPage: parseInt(page),
      totalPages: Math.ceil(count / limit)
    });
  } catch (err) {
    return res.status(500).json({ message: "Lỗi khi lấy danh sách tài khoản đã xoá", error: err });
  }
};

const getUserById = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id, {
      attributes: { exclude: ['password'] }
    });
    if (!user) return res.status(404).json({ message: 'Không tìm thấy' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err });
  }
};

const forceDeleteManyUsers = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'Danh sách ID không hợp lệ' });
    }

    const deleted = await User.destroy({
      where: {
        id: { [Op.in]: ids }
      },
      force: true
    });

    return res.json({ message: `Đã xoá ${deleted} tài khoản vĩnh viễn.` });
  } catch (err) {
    return res.status(500).json({ message: 'Lỗi xoá vĩnh viễn', error: err });
  }
};


module.exports = {
  getAllUsers,
  createUser,
  getAllRoles,
  updateUserStatus,
  resetUserPassword,
  deleteInactiveUsers,
  getDeletedUsers,
  getUserById,
  forceDeleteManyUsers
};
