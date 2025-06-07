const { NotificationUser, User } = require("../../models");

const NotificationUserController = {
  // [POST] /admin/notification-users
  async createMany(req, res) {
    try {
      const { notificationId, userIds } = req.body;

      if (!notificationId || !Array.isArray(userIds) || userIds.length === 0) {
        return res
          .status(400)
          .json({ message: "Thiếu notificationId hoặc danh sách userIds" });
      }

      const records = userIds.map((userId) => ({
        notificationId,
        userId,
        isRead: false,
      }));

      await NotificationUser.bulkCreate(records);

      return res
        .status(201)
        .json({ message: "Gửi thông báo đến người dùng thành công" });
    } catch (err) {
      console.error("Lỗi tạo NotificationUser:", err);
      return res.status(500).json({ message: "Lỗi máy chủ" });
    }
  },

  // [GET] /admin/notification-users/:notificationId
  async getUsersByNotification(req, res) {
    try {
      const { notificationId } = req.params;

      // ✅ Nếu không có req.user thì từ chối
      if (!req.user) {
        return res.status(401).json({ message: "Bạn chưa đăng nhập!" });
      }

      // // ✅ Không kiểm tra roleId nữa!
      // if (req.user.roleId !== 1) {
      //   return res.status(403).json({ message: 'Bạn không có quyền truy cập' });
      // }

      const users = await NotificationUser.findAll({
        where: { notificationId },
        include: [
          {
            model: User,
            attributes: ["id", "fullName", "email", "status"],
          },
        ],
      });

      return res.json(users);
    } catch (err) {
      console.error("❌ Lỗi lấy danh sách user:", err.message, err.stack);
      return res.status(500).json({ message: "Lỗi máy chủ" });
    }
  },

  // [DELETE] /admin/notification-users/:notificationId
  async deleteByNotification(req, res) {
    try {
      const { notificationId } = req.params;

      const deleted = await NotificationUser.destroy({
        where: { notificationId },
      });

      return res.json({
        message: `Đã xoá ${deleted} bản ghi notification-user.`,
      });
    } catch (err) {
      console.error("Lỗi xoá notification-users:", err);
      return res.status(500).json({ message: "Lỗi máy chủ" });
    }
  },
};

module.exports = NotificationUserController;
