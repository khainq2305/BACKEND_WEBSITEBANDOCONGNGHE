const cron = require("node-cron");
const { sequelize, Order, Notification } = require("../models");
const { Op } = require("sequelize");

cron.schedule("* * * * *", async () => {
  const t = await sequelize.transaction();
  try {
    const now = new Date();
    const threshold = new Date(now.getTime() - 60 * 1000);

    const orders = await Order.findAll({
      where: { status: "delivered", updatedAt: { [Op.lte]: threshold } },
      attributes: ["id", "userId", "status", "updatedAt"],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    for (const order of orders) {
      await order.update({ status: "completed" }, { transaction: t });

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

      await Notification.create(payload, { transaction: t })
        .catch(err => {
          if (err.name === "SequelizeUniqueConstraintError") {
            console.log(`[CRON] Notification already exists for order ${order.id}`);
          } else throw err;
        });
    }

    await t.commit();
    console.log("[CRON] autoCompleteOrders committed:", orders.length);
  } catch (err) {
    await t.rollback();
    console.error("[CRON] autoCompleteOrders failed:", err);
  }
});
