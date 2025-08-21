const cron = require("node-cron");
const { sequelize, Order, Notification } = require("../models");
const { Op } = require("sequelize");

cron.schedule("* * * * *", async () => {
  const t = await sequelize.transaction();
  try {
    const now = new Date();
    const threshold = new Date(now.getTime() - 60 * 1000); // 60s trước

    // 1) Log schema bắt buộc của Notification (1 lần/cron)
    const notifAttrs = Notification.getAttributes?.() || Notification.rawAttributes;
    const mustFields = Object.entries(notifAttrs).reduce((acc, [k, v]) => {
      acc[k] = { allowNull: v.allowNull, defaultValue: v.defaultValue, type: String(v.type) };
      return acc;
    }, {});
    console.log("[CRON] Notification fields:", mustFields);

    
    const orders = await Order.findAll({
      where: { status: "delivered", updatedAt: { [Op.lte]: threshold } },
      attributes: ["id", "userId", "status", "updatedAt"],
      transaction: t,
      lock: t.LOCK.UPDATE, 
    });

    console.log("[CRON] candidates:", orders.map(o => ({
      id: o.id, userId: o.userId, status: o.status, updatedAt: o.updatedAt
    })));

    for (const order of orders) {
      
      await order.update({ status: "completed" }, { transaction: t });
      console.log(`[CRON] Order #${order.id} -> completed`);

    
      const payload = {
        title: "Đơn hàng đã hoàn tất",
        message: `Đơn hàng #${order.id} của bạn đã được hoàn tất.`,
        type: "order",          
        targetRole: "client",     
        targetId: order.id,
        userId: order.userId,     
        link: `/orders/${order.id}`, 
        isGlobal: false,
        createdBy: "system",
        slug: `order-completed-${order.id}`,
      };

      // 5) Tránh trùng slug (nếu UNIQUE)
      const [notif, created] = await Notification.findOrCreate({
        where: { slug: payload.slug },
        defaults: payload,
        transaction: t,
      });

      console.log(`[CRON] Notification ${created ? "created" : "exists"}:`, notif.id);

      // Nếu bạn không dùng findOrCreate, dùng try/catch để thấy lỗi đầy đủ:
      //
      // try {
      //   const notif = await Notification.create(payload, { transaction: t });
      //   console.log("[CRON] Notification created:", notif.id);
      // } catch (e) {
      //   console.error("[CRON] ❌ Notification.create error name:", e.name);
      //   if (e.errors) console.error("[CRON] details:", e.errors.map(er => ({ msg: er.message, path: er.path, type: er.type })));
      //   if (e.parent) console.error("[CRON] sql:", e.parent?.sql, "params:", e.parent?.parameters, "code:", e.parent?.code);
      //   throw e; // bắt buộc throw để rollback và thấy stack
      // }
    }

    await t.commit();
    console.log("[CRON] ✔ committed");

  } catch (err) {
    if (!err.__rolledBack) {
      try { await sequelize.transaction(t => t.rollback()); } catch {}
    }
    console.error("[NODE-CRON][ERROR]", err);
  }
});
