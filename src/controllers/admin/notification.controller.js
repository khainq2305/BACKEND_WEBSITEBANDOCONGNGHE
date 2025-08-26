const { Notification } = require("../../models");
const { NotificationUser } = require("../../models");
const { User } = require("../../models");
const { getIO } = require("../../socket"); // Đường dẫn đúng theo vị trí controller

const { Op } = require("sequelize");

const NotificationController = {
  async create(req, res) {
    try {
      const {
        title,
        message,
        link,
        targetType,
        targetId,
        isGlobal = true,
        type,
        isActive = true,
        startAt,
        userIds,
        slug,
      } = req.body;

      const imageUrl = req.file?.path || "";
   

      // 🚫 Kiểm tra trùng tiêu đề
      const existing = await Notification.findOne({ where: { title } });
      if (existing) {
        return res
          .status(400)
          .json({ message: "Tên thông báo này đã tồn tại" });
      }

      // ✅ Tạo thông báo chính
      const notification = await Notification.create({
        title,
        slug,
        message,
        imageUrl,
        link,
        targetType,
        targetId: targetId ? Number(targetId) : null,
        isGlobal: isGlobal === "true" || isGlobal === true,
        type,

        isActive: isActive === "true" || isActive === true,
        startAt: startAt ? new Date(startAt) : null,
        createdBy: req.user?.fullName || `Admin #${req.user?.id}`, // ghi rõ ai tạo
      });
     
      // relltime
      getIO().emit("new-admin-notification", notification);
      getIO().emit("new-client-notification", notification);

      // ✅ Nếu là thông báo cho một số user cụ thể
      if (isGlobal === "false" || isGlobal === false || isGlobal === "0") {
        let parsedUserIds = [];

        if (typeof userIds === "string") {
          try {
            parsedUserIds = JSON.parse(userIds);
          } catch (err) {
            return res.status(400).json({ message: "userIds không hợp lệ" });
          }
        } else if (Array.isArray(userIds)) {
          parsedUserIds = userIds;
        }

        if (parsedUserIds.length > 0) {
          const inserts = parsedUserIds.map((userId) => ({
            notificationId: notification.id,
            userId,
            isRead: false,
          }));

          await NotificationUser.bulkCreate(inserts);
        }
      }

      // ====================== //
      // ✅ Gửi thông báo hệ thống cho tất cả admin
      // ====================== //
      if (req.user?.roleId === 1) {
     
        const adminId = req.user.id;
        const adminName = req.user.fullName || `Admin #${adminId}`;

        const systemNotification = await Notification.create({
          title: `${adminName} đã tạo một thông báo: "${title}"`,
          message: message || "",
          type: "system",
          slug: `admin-created-${Date.now()}`,
          isGlobal: false,
          isActive: true,
          targetType: "notification",
          targetId: notification.id,
          startAt: new Date(),
        });
       

        const allAdmins = await User.findAll({ where: { roleId: 1 } });
        const adminNotiUsers = allAdmins.map((a) => ({
          notificationId: systemNotification.id,
          userId: a.id,
          isRead: false,
        }));

        await NotificationUser.bulkCreate(adminNotiUsers);
      }

      return res
        .status(201)
        .json({ message: "Tạo thông báo thành công", data: notification });
    } catch (err) {
      console.error("❌ Lỗi tạo thông báo:", err);
      return res
        .status(500)
        .json({ message: "Lỗi máy chủ", error: err.message });
    }
  },

  async update(req, res) {
    try {
      const { id } = req.params;
      const {
        title,
        message,
        link,
        targetType,
        targetId,
        type,
        isActive,
        isGlobal,
        startAt,
        userIds,
        slug,
      } = req.body;

      const notification = await Notification.findByPk(id);
      const existing = await Notification.findOne({
        where: {
          title,
          id: { [Op.ne]: id },
        },
      });
      if (existing) {
        return res
          .status(400)
          .json({ message: "Tên thông báo này đã tồn tại" });
      }

      if (!notification)
        return res.status(404).json({ message: "Không tìm thấy thông báo" });

      const imageUrl = req.file?.path || notification.imageUrl;

      await notification.update({
        title,
        slug,
        message,
        imageUrl,
        link,
        targetType,
        targetId: targetId ? Number(targetId) : null,
        type,
        isActive: isActive === "true" || isActive === true,
        isGlobal: isGlobal === "true" || isGlobal === true,
        startAt: startAt ? new Date(startAt) : null,
      });

      // Cập nhật danh sách user nhận thông báo nếu isGlobal = false
      if (isGlobal === "false" || isGlobal === false || isGlobal === "0") {
        await NotificationUser.destroy({ where: { notificationId: id } });

        let parsed = [];

        if (typeof userIds === "string") {
          try {
            parsed = JSON.parse(userIds);
          } catch (err) {
            return res.status(400).json({ message: "userIds không hợp lệ" });
          }
        } else if (Array.isArray(userIds)) {
          parsed = userIds;
        }

        if (parsed.length > 0) {
          const inserts = parsed.map((userId) => ({
            notificationId: id,
            userId,
            isRead: false,
          }));
          await NotificationUser.bulkCreate(inserts);
        }
      }

      return res.json({ message: "Cập nhật thành công", data: notification });
    } catch (err) {
      console.error("Lỗi cập nhật:", err);
      return res
        .status(500)
        .json({ message: "Lỗi máy chủ", error: err.message });
    }
  },

  async getAll(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const offset = (page - 1) * limit;

      const { search = "", isActive, type } = req.query;

      const where = {};

      if (search) {
        where[Op.or] = [
          { title: { [Op.like]: `%${search}%` } },
          { message: { [Op.like]: `%${search}%` } },
        ];
      }

      if (isActive !== undefined) {
        where.isActive = isActive === "true";
      }

      if (type) {
        where.type = type;
      }

      const { rows, count } = await Notification.findAndCountAll({
        where,
        offset,
        limit,
        order: [["createdAt", "DESC"]],
      });

      const allCount = await Notification.count();
      const activeCount = await Notification.count({
        where: { isActive: true },
      });
      const hiddenCount = await Notification.count({
        where: { isActive: false },
      });

      return res.status(200).json({
        data: rows,
        total: count,
        counts: {
          all: allCount,
          active: activeCount,
          hidden: hiddenCount,
        },
      });
    } catch (err) {
      console.error("Lỗi getAll notification:", err);
      return res.status(500).json({ message: "Lỗi máy chủ" });
    }
  },

  async delete(req, res) {
    try {
      const { id } = req.params;
      const notification = await Notification.findByPk(id);

      if (!notification) {
        return res.status(404).json({ message: "Không tìm thấy thông báo" });
      }

      await notification.destroy();

      return res.json({ message: "Đã xoá thông báo thành công" });
    } catch (err) {
      console.error("Lỗi xoá thông báo:", err);
      return res.status(500).json({ message: "Lỗi máy chủ" });
    }
  },

  async getById(req, res) {
    const { id } = req.params;
    const notification = await Notification.findByPk(id);
    if (!notification)
      return res.status(404).json({ message: "Không tìm thấy thông báo" });

    return res.json(notification);
  },

  async deleteMany(req, res) {
    try {
      const { ids } = req.body;

      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "Danh sách ID không hợp lệ" });
      }

      await Notification.destroy({
        where: { id: ids },
        force: true,
      });

      return res.json({ message: "Đã xoá thành công" });
    } catch (error) {
      console.error("Lỗi xoá nhiều:", error);
      return res.status(500).json({ message: "Lỗi máy chủ" });
    }
  },

  async getBySlug(req, res) {
    try {
      const { slug } = req.params;
      const notification = await Notification.findOne({ where: { slug } });

      if (!notification) {
        return res.status(404).json({ message: "Không tìm thấy thông báo" });
      }

      return res.json(notification);
    } catch (err) {
      console.error("Lỗi getBySlug:", err);
      return res.status(500).json({ message: "Lỗi máy chủ" });
    }
  },


  async getByRole(req, res) {
    try {
      const userId = req.user.id;
      const roleId = req.user.roleId || req.user.roles?.[0]?.id;

      if (!roleId) {
        return res.status(403).json({ message: "Thiếu roleId" });
      }

      if (![1, 3, 5].includes(roleId)) {
        return res.json([]);
      }

      const typeByRole = {
        5: "order",
        3: "system",
        1: null
      };

      const notificationTypeFilter = {
        targetRole: "admin", // chỉ lấy thông báo cho admin
        ...(typeByRole[roleId] ? { type: typeByRole[roleId] } : {})
      };

      const notiUsers = await NotificationUser.findAll({
        where: { userId },
        include: [
          {
            model: Notification,
            where: { isActive: true, ...notificationTypeFilter },
            required: true,
          },
        ],
      });

      const notiFromUsers = notiUsers.map(n => ({
        ...n.Notification.toJSON(),
        isRead: n.isRead,
        source: "user",
      }));

      const globalWhere = {
        isGlobal: true,
        isActive: true,
        targetRole: "admin",
        ...(typeByRole[roleId] ? { type: typeByRole[roleId] } : {})
      };

      const globalNotifications = await Notification.findAll({ where: globalWhere });

      const notiFromGlobal = await Promise.all(
        globalNotifications.map(async n => {
          const record = await NotificationUser.findOne({
            where: { notificationId: n.id, userId },
          });
          return {
            ...n.toJSON(),
            isRead: record ? record.isRead : false,
            source: "global",
          };
        })
      );

      const combined = [...notiFromUsers, ...notiFromGlobal];
      const uniqueMap = new Map();
      for (const n of combined) {
        if (!uniqueMap.has(n.id)) {
          uniqueMap.set(n.id, n);
        }
      }

      const result = Array.from(uniqueMap.values()).sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      );

      return res.json(result);
    } catch (err) {
      console.error("❌ Lỗi getByRole:", err);
      return res.status(500).json({ message: "Lỗi máy chủ" });
    }
  },

  async markAsRead(req, res) {
  try {
    const { id } = req.params; // notificationId
    const userId = req.user?.id;

    if (!id || !userId) {
      return res.status(400).json({ message: "Thiếu thông tin" });
    }

    // 👉 Chỉ tìm notification thuộc role admin
    const notification = await Notification.findOne({
      where: {
        id,
        targetRole: "admin",   // ✅ chỉ lọc admin
        isActive: true,
      },
    });

    if (!notification) {
      return res.status(404).json({ message: "Không tìm thấy thông báo admin" });
    }

    // Tìm hoặc tạo bản ghi notificationUser
    const [record, created] = await NotificationUser.findOrCreate({
      where: { notificationId: id, userId },
      defaults: { isRead: true, readAt: new Date() },
    });

    // Nếu bản ghi đã tồn tại nhưng chưa đọc thì update
    if (!created && !record.isRead) {
      record.isRead = true;
      record.readAt = new Date();
      await record.save();
    }

    return res.json({ message: "Đã đánh dấu thông báo admin là đã đọc" });
  } catch (error) {
    console.error("Lỗi markAsRead:", error);
    return res.status(500).json({ message: "Lỗi máy chủ" });
  }
},

  async markAllAsRead(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Thiếu thông tin người dùng" });
    }

    // 👉 Chỉ lấy thông báo global, active và dành cho admin
    const globalNotifications = await Notification.findAll({
      where: {
        isGlobal: true,
        isActive: true,
        targetRole: "admin",   // ✅ chỉ admin
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

    const toUpdateIds = [];
    const toInsertData = [];

    globalNotifications.forEach((notification) => {
      const record = notification.notificationUsers?.[0];
      if (record) {
        if (!record.isRead) {
          toUpdateIds.push(record.id);
        }
      } else {
        toInsertData.push({
          notificationId: notification.id,
          userId,
          isRead: true,
          readAt: new Date(),
        });
      }
    });

    if (toInsertData.length > 0) {
      await NotificationUser.bulkCreate(toInsertData);
    }

    if (toUpdateIds.length > 0) {
      await NotificationUser.update(
        { isRead: true, readAt: new Date() },
        { where: { id: toUpdateIds } }
      );
    }

    return res.status(200).json({ message: "Đã đánh dấu tất cả thông báo admin là đã đọc" });
  } catch (err) {
    console.error("❌ markAllAsRead error:", err);
    return res.status(500).json({ message: "Lỗi máy chủ khi đánh dấu đã đọc" });
  }
}




};
module.exports = NotificationController;
