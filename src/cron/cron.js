const cron = require("node-cron");
const { Op, Sequelize } = require("sequelize");
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
  UserPoint,
} = require("../models");
const mjml2html = require("mjml");
const {
  generateOrderCancellationHtml,
} = require("../utils/emailTemplates/orderCancellationTemplate");
const { sendEmail } = require("../utils/sendEmail");
const sequelize = require("../config/database");

cron.schedule("*/1 * * * *", async () => {
  try {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

    const expiredOrders = await Order.findAll({
      where: {
        status: "processing",
        paymentStatus: { [Op.in]: ["waiting", "unpaid"] },
        createdAt: { [Op.lt]: fifteenMinutesAgo },
      },
      include: [
        { model: OrderItem, as: "items" },
        { model: PaymentMethod, as: "paymentMethod", attributes: ["code"] },
        { model: User, as: "User", attributes: ["email", "fullName"] },
      ],
    });

    const cancellableOrders = expiredOrders.filter((order) => {
      const methodCode = order.paymentMethod?.code?.toLowerCase();
      return methodCode !== "cod" && methodCode !== "atm";
    });

    if (!cancellableOrders.length) {
      console.log(`[Cron] Không có đơn hàng quá hạn cần huỷ (${new Date().toLocaleString()})`);
      return;
    }

    for (const order of cancellableOrders) {
      // Gom side-effects để chạy SAU COMMIT
      let sideEffects = {};

      try {
        // DÙNG MANAGED TRANSACTION: Sequelize tự commit/rollback
        await sequelize.transaction(async (t) => {
          // Hoàn kho/flash sale
          for (const item of order.items) {
            await Sku.increment("stock", {
              by: item.quantity,
              where: { id: item.skuId },
              transaction: t,
            });

            if (item.flashSaleId) {
              await FlashSaleItem.update(
                {
                  quantity: Sequelize.literal(`quantity + ${item.quantity}`),
                  soldCount: Sequelize.literal(`soldCount - ${item.quantity}`),
                },
                { where: { id: item.flashSaleId }, transaction: t }
              );
            }
          }

          // Huỷ điểm thưởng kiếm được (nếu có)
          await UserPoint.destroy({
            where: { orderId: order.id, userId: order.userId, type: "earn" },
            transaction: t,
          });

          // Hoàn coupon đã dùng (nếu có)
          if (order.couponId != null) {
            await CouponUser.decrement("used", {
              by: 1,
              where: { userId: order.userId, couponId: order.couponId },
              transaction: t,
            });

            await Coupon.decrement("usedCount", {
              by: 1,
              where: { id: order.couponId },
              transaction: t,
            });
          }

          // Cập nhật đơn
          order.status = "cancelled";
          order.paymentStatus = "unpaid";
          order.cancelReason = "Thanh toán không hoàn tất trong 15 phút";
          await order.save({ transaction: t });

          // Notification + NotificationUser (dùng findOrCreate để gọn và tránh trùng)
          const slug = `order-${order.orderCode}`;
          const [notif] = await Notification.findOrCreate({
            where: { slug },
            defaults: {
              title: "Đơn hàng tự huỷ",
              message: `Đơn ${order.orderCode} đã bị huỷ do quá hạn thanh toán.`,
              slug,
              type: "order",
              referenceId: order.id,
              link: `/user-profile/orders/${order.orderCode}`,
              startAt: new Date(),
              isActive: true,
            },
            transaction: t,
          });

          // Nếu đã tồn tại thì cập nhật nội dung
          if (notif) {
            notif.title = "Đơn hàng tự huỷ";
            notif.message = `Đơn ${order.orderCode} đã bị huỷ do quá hạn thanh toán.`;
            notif.startAt = new Date();
            notif.isActive = true;
            await notif.save({ transaction: t });
          }

          await NotificationUser.findOrCreate({
            where: { notificationId: notif.id, userId: order.userId },
            defaults: { notificationId: notif.id, userId: order.userId },
            transaction: t,
          });

          // Chuẩn bị dữ liệu cho side-effects (email/socket) SAU COMMIT
          sideEffects = {
            notifPayload: {
              id: notif.id,
              title: notif.title,
              message: notif.message,
              link: notif.link,
              createdAt: notif.startAt,
              isRead: false,
              type: notif.type,
              userRoom: `user-${order.userId}`,
            },
            email: {
              to: order.User?.email,
              name: order.User?.fullName || order.User?.email || "Khách hàng",
              orderCode: order.orderCode,
              cancelReason: order.cancelReason,
            },
          };
        });

        // ====== SAU COMMIT: chạy side-effects, không ảnh hưởng dữ liệu ======
        // Gửi email (không để trong transaction)
        if (sideEffects.email?.to) {
          try {
            const emailMjmlContent = generateOrderCancellationHtml({
              orderCode: sideEffects.email.orderCode,
              cancelReason: sideEffects.email.cancelReason,
              userName: sideEffects.email.name,
              orderDetailUrl: `https://your-frontend-domain.com/user-profile/orders/${sideEffects.email.orderCode}`,
              companyName: "Cyberzone",
              companyLogoUrl:
                "https://res.cloudinary.com/dzrp2hsvh/image/upload/v1753761547/uploads/ohs6h11zyavrv2haky9f.png",
              companyAddress: "Trương Vĩnh Nguyên, phường Cái Răng, Cần Thơ",
              companyPhone: "0878999894",
              companySupportEmail: "contact@cyberzone.com",
            });
            const { html: emailHtml } = mjml2html(emailMjmlContent);
            await sendEmail(
              sideEffects.email.to,
              `Đơn hàng ${sideEffects.email.orderCode} đã bị hủy`,
              emailHtml
            );
          } catch (emailErr) {
            console.error(`[Cron] Lỗi gửi email hủy đơn ${sideEffects.email.orderCode}:`, emailErr);
          }
        }

        // Emit socket
        try {
          const io = require("../socket");
          io.to(sideEffects.notifPayload.userRoom).emit(
            "new-client-notification",
            sideEffects.notifPayload
          );
        } catch (sockErr) {
          console.error("[Cron] Lỗi emit socket:", sockErr);
        }

        console.log(`[Cron] Đã huỷ và xử lý đơn ${order.orderCode}`);
      } catch (innerErr) {
        // Với managed transaction, lỗi trong callback đã tự rollback.
        // Lỗi ở đây chủ yếu là lỗi ngoài transaction (không cần rollback).
        console.error(`[Cron] Lỗi xử lý huỷ đơn ${order.orderCode}:`, innerErr);
      }
    }

    console.log(`[Cron] Hoàn tất quá trình huỷ đơn quá hạn (${new Date().toLocaleString()})`);
  } catch (err) {
    console.error("[Cron] Lỗi tổng quát khi chạy cron huỷ đơn quá hạn:", err);
  }
});
