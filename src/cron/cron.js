const cron = require('node-cron');
const { Op, Sequelize } = require('sequelize');
const {
  Order,
  OrderItem,
  Sku,
  Notification,
  NotificationUser,
  PaymentMethod,
  User,
  Coupon,
  CouponUser,
  FlashSaleItem,
  UserPoint
} = require('../models');

const mjml2html = require('mjml');
const { generateOrderCancellationHtml } = require('../utils/emailTemplates/orderCancellationTemplate');
const { sendEmail } = require('../utils/sendEmail');
const sequelize = require('../config/database'); // Đảm bảo import đúng transaction

cron.schedule('*/1 * * * *', async () => {
  try {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

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
        { model: PaymentMethod, as: 'paymentMethod', attributes: ['code'] },
          { model: User, as: "User", attributes: ["email", "fullName"] } 
      ]
    });

    const cancellableOrders = expiredOrders.filter((order) => {
      const methodCode = order.paymentMethod?.code?.toLowerCase();
      return methodCode !== 'cod' && methodCode !== 'atm';
    });

    if (!cancellableOrders.length) {
      console.log(`[Cron] Không có đơn hàng quá hạn cần huỷ (${new Date().toLocaleString()})`);
      return;
    }

    for (const order of cancellableOrders) {
      const transaction = await sequelize.transaction();

      try {
        const orderItems = order.items;

        for (const item of orderItems) {
          // ✅ Trả lại tồn kho
          await Sku.increment('stock', {
            by: item.quantity,
            where: { id: item.skuId },
            transaction
          });

          // ✅ Trả lại FlashSaleItem nếu có
          if (item.flashSaleId) {
            await FlashSaleItem.update({
              quantity: Sequelize.literal(`quantity + ${item.quantity}`),
              soldCount: Sequelize.literal(`soldCount - ${item.quantity}`)
            }, {
              where: { id: item.flashSaleId },
              transaction
            });
          }
        }


        await UserPoint.destroy({
          where: { orderId: order.id, userId: order.userId, type: "earn" },
          transaction
        });

       
        if (order.couponId != null) {
          await CouponUser.decrement('used', {
            by: 1,
            where: { userId: order.userId, couponId: order.couponId },
            transaction
          });

          await Coupon.decrement('usedCount', {
            by: 1,
            where: { id: order.couponId },
            transaction
          });
        }

     
        order.status = 'cancelled';
        order.paymentStatus = 'unpaid';
        order.cancelReason = 'Thanh toán không hoàn tất trong 15 phút';
        await order.save({ transaction });

      
        const slug = `order-${order.orderCode}`;
        const existingNotif = await Notification.findOne({ where: { slug } });
        if (!existingNotif) {
          const notif = await Notification.create({
            title: 'Đơn hàng tự huỷ',
            message: `Đơn ${order.orderCode} đã bị huỷ do quá hạn thanh toán.`,
            slug,
            type: 'order',
            referenceId: order.id,
            link: `/user-profile/orders/${order.orderCode}`
          }, { transaction });

          await NotificationUser.create({
            notificationId: notif.id,
            userId: order.userId
          }, { transaction });
        }

       
        const emailMjmlContent = generateOrderCancellationHtml({
          orderCode: order.orderCode,
          cancelReason: order.cancelReason,
          userName: order.user?.fullName || order.user?.email || 'Khách hàng',
          orderDetailUrl: `https://your-frontend-domain.com/user-profile/orders/${order.orderCode}`,
          companyName: "Cyberzone",
          companyLogoUrl: "https://res.cloudinary.com/dzrp2hsvh/image/upload/v1753761547/uploads/ohs6h11zyavrv2haky9f.png",
          companyAddress: "Trương Vĩnh Nguyên, phường Cái Răng, Cần Thơ",
          companyPhone: "0878999894",
          companySupportEmail: "contact@cyberzone.com",
        });

        const { html: emailHtml } = mjml2html(emailMjmlContent);

        if (order.user?.email) {
          try {
            await sendEmail(order.user.email, `Đơn hàng ${order.orderCode} đã bị hủy`, emailHtml);
          } catch (emailErr) {
            console.error(`[Cron] Lỗi gửi email hủy đơn ${order.orderCode}:`, emailErr);
          }
        }

        await transaction.commit();
        console.log(`[Cron] Đã huỷ và xử lý đơn ${order.orderCode}`);

      } catch (innerErr) {
        await transaction.rollback();
        console.error(`[Cron] Lỗi xử lý huỷ đơn ${order.orderCode}:`, innerErr);
      }
    }

    console.log(`[Cron] Hoàn tất quá trình huỷ đơn quá hạn (${new Date().toLocaleString()})`);
  } catch (err) {
    console.error('[Cron] Lỗi tổng quát khi chạy cron huỷ đơn quá hạn:', err);
  }
});
