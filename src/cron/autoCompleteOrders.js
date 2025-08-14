const cron = require("node-cron");
const { Order } = require("../models");
const { Op } = require("sequelize");

cron.schedule("* * * * *", async () => {
  const now = new Date();
  const threshold = new Date(now.getTime() - 60 * 1000); 

  const orders = await Order.findAll({
    where: {
      status: "delivered",
      updatedAt: { [Op.lte]: threshold },
    },
  });

  for (const order of orders) {
    order.status = "completed";
    await order.save();
    console.log(`[CRON] Order #${order.id} auto marked as completed`);
  }
});
