// services/common/cron.js
const cron = require('node-cron');
const { Order, OrderItem, Sku, Notification, NotificationUser } = require('../../models');

cron.schedule('*/1 * * * *', async () => {    // mỗi phút
  const now = Date.now();
  const expiredOrders = await Order.findAll({
    where: {
      paymentStatus: 'waiting',
      status: 'processing',
      expiredAt: { [Op.lt]: now }
    },
    include: [{ model: OrderItem, as: 'items' }]
  });

  for (const o of expiredOrders) {
    // hoàn kho
    for (const it of o.items) await Sku.increment('stock', { by: it.quantity, where: { id: it.skuId } });

    o.status = 'cancelled';
    o.paymentStatus = 'unpaid';
    o.cancelReason = 'Thanh toán không hoàn tất trong 15 phút';
    await o.save();

    // gửi notification
    const notif = await Notification.create({
      title: 'Đơn hàng tự huỷ',
      message: `Đơn ${o.orderCode} đã huỷ do quá hạn thanh toán`,
      slug: `order-${o.orderCode}`, type: 'order', referenceId: o.id
    });
    await NotificationUser.create({ notificationId: notif.id, userId: o.userId });
  }

  if (expiredOrders.length)
    console.log(`[Cron] Đã huỷ ${expiredOrders.length} đơn quá hạn thanh toán`);
});
