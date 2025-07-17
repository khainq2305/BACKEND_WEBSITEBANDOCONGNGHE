// services/common/cron.js
const cron = require('node-cron');
const { Op }  = require('sequelize');
const {
  Order,
  OrderItem,
  Sku,
  Notification,
  NotificationUser
} = require('../models');

/**
 * Hủy tự động các đơn “processing + waiting”
 * đã quá 15 phút kể từ khi tạo nhưng vẫn chưa thanh toán.
 *
 * Job chạy mỗi phút.
 */
cron.schedule('*/1 * * * *', async () => {
  try {
    // thời điểm cách đây 15 phút
    const fifteenMinutesAgo = Date.now() - 15 * 60 * 1000;

    const expiredOrders = await Order.findAll({
  where: {
  status: 'processing',
  paymentStatus: {
    [Op.in]: ['waiting', 'unpaid']
  },
  createdAt: {
    [Op.lt]: fifteenMinutesAgo
  },
  paymentMethodId: {
    [Op.ne]: 2 // ATM không bao giờ bị hủy
  }
}
,
  include: [{ model: OrderItem, as: 'items' }]
});


    if (!expiredOrders.length) return; // không có đơn nào hết hạn

    for (const order of expiredOrders) {
      /* ---------- 1. Hoàn lại tồn kho SKU ---------- */
      for (const item of order.items) {
        await Sku.increment('stock', {
          by   : item.quantity,
          where: { id: item.skuId }
        });
      }

      /* ---------- 2. Cập nhật trạng thái đơn ---------- */
      order.status        = 'cancelled';
      order.paymentStatus = 'unpaid';
      order.cancelReason  = 'Thanh toán không hoàn tất trong 15 phút';
      await order.save();

      /* ---------- 3. Tạo thông báo cho người dùng ---------- */
    const existingNotif = await Notification.findOne({
  where: { slug: `order-${order.orderCode}` }
});

if (!existingNotif) {
  const notif = await Notification.create({
    title      : 'Đơn hàng tự huỷ',
    message    : `Đơn ${order.orderCode} đã bị huỷ do quá hạn thanh toán.`,
    slug       : `order-${order.orderCode}`,
    type       : 'order',
    referenceId: order.id
  });

  await NotificationUser.create({
    notificationId: notif.id,
    userId        : order.userId
  });
}

    }

    console.log(
      `[Cron] Đã huỷ ${expiredOrders.length} đơn quá hạn thanh toán (${new Date().toLocaleString()})`
    );
  } catch (err) {
    console.error('[Cron] Lỗi khi huỷ đơn quá hạn:', err);
  }
});
