// src/controllers/client/notificationClient.controller.js
const { Notification, NotificationUser } = require("../../models");
const { Op } = require("sequelize");

const NotificationClientController = {
async getForCurrentUser(req, res) {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: "Chưa đăng nhập" });
  }

  // 🔥 Lấy role từ user (đỡ hardcode)
  const role = req.user?.role || "client";

  try {
    const notifications = await Notification.findAll({
      where: {
        isActive: true,
        [Op.and]: [
          // chỉ lấy noti đã bắt đầu hoặc chưa có startAt
          { [Op.or]: [{ startAt: null }, { startAt: { [Op.lte]: new Date() } }] },
          {
            [Op.or]: [
              // case 1: global cho đúng role
              {
                [Op.and]: [
                  { isGlobal: true },
                  { targetRole: role },
                ],
              },
              // case 2: có bản ghi riêng cho user và đúng role
              {
                [Op.and]: [
                  { "$notificationUsers.userId$": userId },
                  { targetRole: role },
                ],
              }
            ],
          }
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

    // format lại data
    const formatted = notifications.map(n => {
      const obj = n.toJSON();
      obj.isRead = obj.notificationUsers?.[0]?.isRead === true;
      delete obj.notificationUsers;
      return obj;
    });

    const unreadCount = formatted.filter(n => !n.isRead).length;
return res.json(formatted); 

  } catch (err) {
    console.error("getForCurrentUser error:", err);
    return res.status(500).json({ message: "Lỗi máy chủ" });
  }
}



,

  async markAsRead(req, res) {
  const userId = req.user?.id;
  const notificationId = req.params.id;

  if (!userId) return res.status(401).json({ message: "Chưa đăng nhập" });

  try {
    // 👉 Chỉ tìm notification dành cho client (hoặc chung nếu bạn muốn)
    const notification = await Notification.findOne({
      where: {
        id: notificationId,
        isActive: true,
        [Op.or]: [
          { targetRole: "client" },
          { targetRole: null }, // nếu muốn client nhận cả thông báo chung
        ],
      },
    });

    if (!notification) {
      return res.status(404).json({ message: "Không tìm thấy thông báo dành cho client" });
    }

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
    console.error("Lỗi đánh dấu đã đọc (client):", err);
    return res.status(500).json({ message: "Lỗi máy chủ" });
  }
},

async markAllAsRead(req, res) {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: "Chưa đăng nhập" });

  const role = req.user?.role === "admin" ? "admin" : "client";

  try {
    const notifications = await Notification.findAll({
      where: {
        isActive: true,
        [Op.and]: [
          { [Op.or]: [{ startAt: null }, { startAt: { [Op.lte]: new Date() } }] },
          {
            [Op.or]: [
              {
                [Op.and]: [
                  { isGlobal: true },
                  { targetRole: role },   // ✅ chỉ lấy đúng role, bỏ null đi
                ],
              },
              { "$notificationUsers.userId$": userId },
            ],
          },
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
    });

    const toUpdate = [];
    const toInsert = [];

    for (const notif of notifications) {
      const link = notif.notificationUsers?.[0];
      if (link) {
        if (!link.isRead) {
          toUpdate.push(link.id);
        }
      } else {
        toInsert.push({
          notificationId: notif.id,
          userId,
          isRead: true,
          readAt: new Date(),
        });
      }
    }

    if (toInsert.length > 0) {
      await NotificationUser.bulkCreate(toInsert);
    }

    if (toUpdate.length > 0) {
      await NotificationUser.update(
        { isRead: true, readAt: new Date() },
        { where: { id: toUpdate } }
      );
    }

    return res.json({ message: "Đã đánh dấu tất cả thông báo của bạn là đã đọc" });
  } catch (err) {
    console.error("❌ Lỗi markAllAsRead:", err);
    return res.status(500).json({ message: "Lỗi server" });
  }
}


};

module.exports = NotificationClientController;
