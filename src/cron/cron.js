// services/common/cron.js
const cron = require('node-cron');
const { Op } = require('sequelize');
const {
  Order,
  OrderItem,
  Sku,
  Notification,
  NotificationUser,
  PaymentMethod
} = require('../models');

/**
 * Hủy tự động các đơn “processing + waiting/unpaid”
 * đã quá 15 phút nhưng chưa thanh toán, trừ COD & ATM.
 *
 * Job chạy mỗi phút.
 */
cron.schedule('*/1 * * * *', async () => {
  try {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

    // Lấy các đơn đủ điều kiện huỷ
    const expiredOrders = await Order.findAll({
      where: {
        status: 'processing',
        paymentStatus: {
          [Op.in]: ['waiting', 'unpaid']
        },
        createdAt: {
          [Op.lt]: fifteenMinutesAgo
        }
      },
      include: [
        { model: OrderItem, as: 'items' },
        { model: PaymentMethod, as: 'paymentMethod', attributes: ['code'] }
      ]
    });

    // Lọc bỏ đơn COD & ATM
    const cancellableOrders = expiredOrders.filter((order) => {
      const methodCode = order.paymentMethod?.code?.toLowerCase();
      return methodCode !== 'cod' && methodCode !== 'atm';
    });

    if (!cancellableOrders.length) return;

    for (const order of cancellableOrders) {
      /* --- 1. Trả lại tồn kho SKU --- */
      for (const item of order.items) {
        await Sku.increment('stock', {
          by: item.quantity,
          where: { id: item.skuId }
        });
      }

      /* --- 2. Cập nhật trạng thái đơn --- */
      order.status = 'cancelled';
      order.paymentStatus = 'unpaid';
      order.cancelReason = 'Thanh toán không hoàn tất trong 15 phút';
      await order.save();

      /* --- 3. Gửi thông báo cho người dùng --- */
      const slug = `order-${order.orderCode}`;

      const existingNotif = await Notification.findOne({ where: { slug } });
      if (!existingNotif) {
        const notif = await Notification.create({
          title: 'Đơn hàng tự huỷ',
          message: `Đơn ${order.orderCode} đã bị huỷ do quá hạn thanh toán.`,
          slug,
          type: 'order',
          referenceId: order.id
        });

        await NotificationUser.create({
          notificationId: notif.id,
          userId: order.userId
        });
      }
    }

    console.log(
      `[Cron] Đã huỷ ${cancellableOrders.length} đơn quá hạn thanh toán (${new Date().toLocaleString()})`
    );
  } catch (err) {
    console.error('[Cron] Lỗi khi huỷ đơn quá hạn:', err);
  }
});
