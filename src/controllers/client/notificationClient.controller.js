// src/controllers/client/notificationClient.controller.js
const { Notification, NotificationUser } = require("../../models");
const { Op } = require("sequelize");

const NotificationClientController = {
  async getForCurrentUser(req, res) {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Chưa đăng nhập" });

    try {
      const notifications = await Notification.findAll({
        where: {
          isActive: true,
          [Op.or]: [{ startAt: null }, { startAt: { [Op.lte]: new Date() } }],
          [Op.or]: [
            { isGlobal: true },
            { "$notificationUsers.userId$": userId },
          ],
        },

        include: [
          {
            model: NotificationUser,
            as: "notificationUsers",
            required: false,
            where: { userId },
            attributes: ["isRead", "readAt"],
          },
        ],
        order: [
          ["startAt", "DESC"],
          ["createdAt", "DESC"],
        ],
      });

      const formatted = notifications.map((n) => {
        const noti = n.toJSON();
        const userLink = noti.notificationUsers?.[0];
        noti.isRead = userLink?.isRead === true;
        delete noti.notificationUsers;
        return noti;
      });

      return res.json(formatted);
    } catch (err) {
      console.error("Lỗi lấy thông báo client:", err);
      return res.status(500).json({ message: "Lỗi máy chủ" });
    }
  },

  async markAsRead(req, res) {
    const userId = req.user?.id;
    const notificationId = req.params.id;

    if (!userId) return res.status(401).json({ message: "Chưa đăng nhập" });

    try {
      const [record, created] = await NotificationUser.findOrCreate({
        where: { notificationId, userId },
        defaults: { isRead: true, readAt: new Date() },
      });

      if (!created && !record.isRead) {
        record.isRead = true;
        record.readAt = new Date();
        await record.save();
      }

      return res.json({ success: true });
    } catch (err) {
      console.error("Lỗi đánh dấu đã đọc:", err);
      return res.status(500).json({ message: "Lỗi máy chủ" });
    }
  },

 async markAllAsRead(req, res) {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: "Chưa đăng nhập" });

  try {
    console.log("🔍 [DEBUG] Bắt đầu markAllAsRead cho userId:", userId);

    const notifications = await Notification.findAll({
      where: {
        isActive: true,
        startAt: { [Op.lte]: new Date() },
        [Op.or]: [
          { isGlobal: true },
          { "$notificationUsers.userId$": userId },
        ],
      },
      include: [
        {
          model: NotificationUser,
          as: "notificationUsers",
          required: false,
          where: { userId },
          attributes: ["id", "isRead", "readAt"],
        },
      ],
      order: [["startAt", "DESC"]],
    });

    console.log("🔍 [DEBUG] Tổng thông báo tìm thấy:", notifications.length);

    const toUpdate = [];
    const toInsert = [];

    for (const notif of notifications) {
      const link = notif.notificationUsers?.[0];

      if (link) {
        if (!link.isRead) {
          console.log("📌 [UPDATE] Thông báo cần update:", {
            id: link.id,
            notifId: notif.id,
            title: notif.title,
          });
          toUpdate.push(link.id);
        }
      } else {
        console.log("📌 [INSERT] Global notif chưa có bản ghi:", {
          notifId: notif.id,
          title: notif.title,
        });
        toInsert.push({
          notificationId: notif.id,
          userId,
          isRead: true,
          readAt: new Date(),
        });
      }
    }

    if (toInsert.length > 0) {
      console.log("🚀 [DEBUG] Đang tạo mới bản ghi NotificationUser:", toInsert.length);
      await NotificationUser.bulkCreate(toInsert);
    }

    if (toUpdate.length > 0) {
      console.log("🚀 [DEBUG] Đang update các bản ghi NotificationUser:", toUpdate.length);
      await NotificationUser.update(
        { isRead: true, readAt: new Date() },
        { where: { id: toUpdate } }
      );
    }

    console.log("✅ [DEBUG] Đã xử lý xong markAllAsRead");

    return res.json({ message: "Đã đánh dấu đã đọc tất cả" });
  } catch (err) {
    console.error("❌ [ERROR] markAllAsRead:", err);
    return res.status(500).json({ message: "Lỗi server" });
  }
}

};

module.exports = NotificationClientController;
