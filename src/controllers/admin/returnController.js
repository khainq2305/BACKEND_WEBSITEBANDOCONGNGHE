const {
  ReturnRequest,
  RefundRequest,
  Order,
  OrderItem,
  Sku,
  Notification,
  User,
  NotificationUser,
  UserPoint,
  Wallet,
  WalletTransaction,
  FlashSaleItem,
  Product,
  ReturnRequestItem,
  ShippingProvider,
  PaymentMethod,
  sequelize,
} = require("../../models");
const sendEmail = require("../../utils/sendEmail");
const {
  generateReturnStatusEmailHtml,
} = require("../../utils/emailTemplates/generateReturnStatusEmailHtml");

const refundGateway = require("../../utils/refundGateway");
const calculateRefundAmount = require("../../utils/calculateRefundAmount");
const { Op } = require("sequelize");
const formatCurrencyVND = (amount) => {
  const num = Number(amount);
  if (isNaN(num)) return "0 ₫";
  return num.toLocaleString("vi-VN", { style: "currency", currency: "VND" });
};

const returnStock = async (orderItems, t) => {
  for (const it of orderItems) {
    await Sku.increment("stock", {
      by: it.quantity,
      where: { id: it.skuId },
      transaction: t,
    });

    const fsItem = it.Sku?.flashSaleSkus?.[0];
    if (fsItem) {
      await FlashSaleItem.increment("quantity", {
        by: it.quantity,
        where: { id: fsItem.id },
        transaction: t,
      });
    }
  }
};

class ReturnController {
  // File: src/controllers/admin/orderController.js

  static async getReturnByOrder(req, res) {
    try {
      const { orderId } = req.params;
      const {
        page = 1,
        limit = 10,
        search = "",
        status,
        startDate,
        endDate,
      } = req.query;

      const offset = (page - 1) * limit;
      const whereClause = {};
      const includeClause = [
        {
          model: Order,
          as: "order",
          required: false,
          attributes: ["orderCode"],
        },
      ];

      // Lấy thống kê trạng thái riêng biệt (cho frontend)
      const statusStats = await ReturnRequest.findAll({
        attributes: [
          "status",
          [sequelize.fn("COUNT", sequelize.col("status")), "count"],
        ],
        group: ["status"],
        raw: true,
      });

      if (orderId && Number(orderId) !== 0) {
        whereClause.orderId = orderId;
      }

      if (status) {
        whereClause.status = status;
      }

      if (startDate || endDate) {
        whereClause.createdAt = {};
        if (startDate) whereClause.createdAt[Op.gte] = new Date(startDate);
        if (endDate)
          whereClause.createdAt[Op.lte] = new Date(endDate + " 23:59:59");
      }

      if (search) {
        whereClause[Op.or] = [
          { returnCode: { [Op.like]: `%${search}%` } },
          { "$order.orderCode$": { [Op.like]: `%${search}%` } },
        ];
        includeClause[0].required = true;
      }

      const { count: totalItems, rows: data } =
        await ReturnRequest.findAndCountAll({
          where: whereClause,
          include: includeClause,
          order: [["createdAt", "DESC"]],
          offset,
          limit: parseInt(limit),
          subQuery: false,
        });

      const totalPages = Math.ceil(totalItems / limit);

      return res.json({
        data,
        totalItems,
        totalPages,
        currentPage: parseInt(page),
        statusStats, // 🔥 Trả về thống kê trạng thái
      });
    } catch (error) {
      console.error("Lỗi khi lấy yêu cầu trả hàng:", error);
      return res.status(500).json({ message: "Lỗi server" });
    }
  }

  static async updateReturnStatus(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;
      const { status, responseNote } = req.body;

      const request = await ReturnRequest.findByPk(id, {
        include: {
          model: Order,
          as: "order",
          include: [
            {
              model: OrderItem,
              as: "items",
              include: [
                { model: Sku, as: "Sku" },
                { model: FlashSaleItem, as: "flashSaleItem", required: false },
              ],
            },
            { model: PaymentMethod, as: "paymentMethod", attributes: ["code"] },
            { model: User, attributes: ["id", "email", "fullName"] },
          ],
        },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!request) {
        await t.rollback();
        return res.status(404).json({ message: "Không tìm thấy yêu cầu" });
      }

      const flow = {
        pending: ["approved", "rejected", "cancelled"],
        approved: ["awaiting_pickup", "pickup_booked", "cancelled"],
        awaiting_pickup: ["received"],
        pickup_booked: ["received"],
        awaiting_dropoff: ["received"],
        received: ["refunded"],
      };

      const next = flow[request.status] || [];
      if (!next.includes(status)) {
        await t.rollback();
        return res.status(400).json({
          message: `Không thể chuyển trạng thái từ "${request.status}" → "${status}"`,
        });
      }

      if (request.status === "pending" && status === "approved") {
        const deadline = new Date();
        deadline.setDate(deadline.getDate() + 1);
        request.deadlineChooseReturnMethod = deadline;
      }

      // === Khi đơn hàng trả được nhận ===
      if (status === "received") {
        // 1. Trả lại kho
        for (const item of request.order.items) {
          const sku = await Sku.findByPk(item.skuId, {
            transaction: t,
            lock: t.LOCK.UPDATE,
          });
          if (sku) {
            await sku.increment("stock", { by: item.quantity, transaction: t });
          }

          if (item.flashSaleItem) {
            const fsItemLocked = await FlashSaleItem.findByPk(
              item.flashSaleItem.id,
              { transaction: t, lock: t.LOCK.UPDATE }
            );
            if (fsItemLocked) {
              const newQuantity = (fsItemLocked.quantity || 0) + item.quantity;
              const newSoldCount = Math.max(
                0,
                (fsItemLocked.soldCount || 0) - item.quantity
              );
              await fsItemLocked.update(
                { quantity: newQuantity, soldCount: newSoldCount },
                { transaction: t }
              );
            }
          }
        }

      const payCode = request.order.paymentMethod?.code?.toLowerCase();
    const amount = request.refundAmount; // SỬA LỖI: Sử dụng refundAmount thay vì finalPrice
    const payload = { orderCode: request.order.orderCode, amount };
        if (
          ["cod", "atm", "payos", "internalwallet", "zalopay"].includes(payCode)
        ) {
          const wallet = await Wallet.findOne({
            where: { userId: request.order.userId },
            transaction: t,
            lock: t.LOCK.UPDATE,
          });
          if (!wallet) {
            await t.rollback();
            return res
              .status(400)
              .json({ message: "Không tìm thấy ví nội bộ của người dùng" });
          }
          wallet.balance = Number(wallet.balance) + Number(amount);
          await wallet.save({ transaction: t });
          await WalletTransaction.create(
            {
              walletId: wallet.id,
              userId: request.order.userId,
              type: "refund",
              amount,
              description: `Hoàn tiền trả hàng đơn #${request.order.orderCode}`,
              orderId: request.order.id,
            },
            { transaction: t }
          );
          request.order.paymentStatus = "refunded";
          // === Thu hồi điểm thưởng nếu có ===
          const earnedPoints = await UserPoint.findOne({
            where: {
              orderId: request.order.id,
              userId: request.order.userId,
              type: "earn",
            },
            transaction: t,
          });

          if (earnedPoints) {
            await UserPoint.create(
              {
                userId: request.order.userId,
                orderId: request.order.id,
                points: -earnedPoints.points,
                type: "refund",
                sourceType: "order",
                description: `Thu hồi ${earnedPoints.points} điểm do trả hàng đơn ${request.order.orderCode}`,
              },
              { transaction: t }
            );
          }
          // === Hoàn lại điểm đã sử dụng nếu có ===
          const spentPoints = await UserPoint.findOne({
            where: {
              orderId: request.order.id,
              userId: request.order.userId,
              type: "spend",
            },
            transaction: t,
          });

          if (spentPoints) {
            await UserPoint.create(
              {
                userId: request.order.userId,
                orderId: request.order.id,
                points: spentPoints.points, // trả lại đúng số điểm đã trừ
                type: "refund",
                sourceType: "order",
                description: `Hoàn lại ${spentPoints.points} điểm do trả hàng đơn ${request.order.orderCode}`,
              },
              { transaction: t }
            );
          }
        } else {
          if (payCode === "momo") {
            if (!request.order.momoTransId) {
              await t.rollback();
              return res.status(400).json({ message: "Thiếu momoTransId" });
            }
            payload.momoTransId = request.order.momoTransId;
          }
          if (payCode === "vnpay") {
            if (!request.order.vnpTransactionId || !request.order.paymentTime) {
              await t.rollback();
              return res.status(400).json({ message: "Thiếu thông tin VNPay" });
            }
            payload.vnpTransactionId = request.order.vnpTransactionId;
            payload.originalAmount = amount;
            payload.transDate = request.order.paymentTime;
          }
          if (payCode === "stripe") {
            if (!request.order.stripePaymentIntentId) {
              await t.rollback();
              return res
                .status(400)
                .json({ message: "Thiếu stripePaymentIntentId" });
            }
            payload.stripePaymentIntentId = request.order.stripePaymentIntentId;
          }

          const { ok, transId } = await refundGateway(payCode, payload);
          if (!ok) {
            await t.rollback();
            return res.status(400).json({ message: "Hoàn tiền thất bại" });
          }
          request.order.paymentStatus = "refunded";
          request.order.gatewayTransId = transId || null;
          // === Thu hồi điểm thưởng nếu có ===
          const earnedPoints = await UserPoint.findOne({
            where: {
              orderId: request.order.id,
              userId: request.order.userId,
              type: "earn",
            },
            transaction: t,
          });

          if (earnedPoints) {
            await UserPoint.create(
              {
                userId: request.order.userId,
                orderId: request.order.id,
                points: -earnedPoints.points,
                type: "refund",
                sourceType: "order",
                description: `Thu hồi ${earnedPoints.points} điểm do trả hàng đơn ${request.order.orderCode}`,
              },
              { transaction: t }
            );
          }
          // === Hoàn lại điểm đã sử dụng nếu có ===
          const spentPoints = await UserPoint.findOne({
            where: {
              orderId: request.order.id,
              userId: request.order.userId,
              type: "spend",
            },
            transaction: t,
          });

          if (spentPoints) {
            await UserPoint.create(
              {
                userId: request.order.userId,
                orderId: request.order.id,
                points: spentPoints.points, // trả lại đúng số điểm đã trừ
                type: "refund",
                sourceType: "order",
                description: `Hoàn lại ${spentPoints.points} điểm do trả hàng đơn ${request.order.orderCode}`,
              },
              { transaction: t }
            );
          }
        }

        // 3. Cập nhật trạng thái
        request.status = "refunded";
        await request.order.save({ transaction: t });
      }

      request.status = status;
      request.responseNote = responseNote;
      await request.save({ transaction: t });

      // === Notification cho khách hàng ===
      let clientNotifTitle = "";
      let clientNotifMessage = "";
      let sendNotif = true;

      if (status === "approved") {
        clientNotifTitle = "Yêu cầu trả hàng đã được duyệt";
        clientNotifMessage = `Yêu cầu trả hàng #${request.returnCode} của bạn đã được duyệt. Vui lòng chọn phương thức trả hàng trong vòng 24h để hoàn tất.`;
      } else if (status === "rejected") {
        clientNotifTitle = "Yêu cầu trả hàng không được duyệt";
        clientNotifMessage = `Yêu cầu trả hàng #${
          request.returnCode
        } của bạn đã bị từ chối. Lý do: ${
          responseNote || "Không có lý do cụ thể."
        }`;
      } else if (status === "cancelled") {
        clientNotifTitle = "Yêu cầu trả hàng đã bị hủy";
        clientNotifMessage = `Yêu cầu trả hàng #${request.returnCode} của bạn đã bị hủy.`;
      } else if (status === "refunded") {
        clientNotifTitle = "Hoàn tiền thành công";
        clientNotifMessage = `Yêu cầu trả hàng #${
          request.returnCode
        } đã được xử lý. Số tiền ${formatCurrencyVND(
          request.refundAmount
        )} đã được hoàn trả.`;
      } else {
        sendNotif = false;
      }

      if (sendNotif) {
        const clientNotification = await Notification.create(
          {
            title: clientNotifTitle,
            message: clientNotifMessage,
            slug: `return-request-${request.id}-${status}`,
            type: "order",
            targetRole: "client",
            targetId: request.order.userId,
            link: `/user-profile/return-order/${request.id}`,
            isGlobal: false,
          },
          { transaction: t }
        );

        await NotificationUser.create(
          {
            notificationId: clientNotification.id,
            userId: request.order.userId,
            isRead: false,
          },
          { transaction: t }
        );

        req.app.locals.io
          .to(`user-${request.order.userId}`)
          .emit("new-client-notification", clientNotification);
      }

      await t.commit();

      // === Gửi email cho khách hàng ===
      try {
        if (sendNotif) {
          const emailHtml = generateReturnStatusEmailHtml({
            status,
            returnCode: request.returnCode,
            orderCode: request.order.orderCode,
            userName: request.order.User.fullName || request.order.User.email,
            message: clientNotifMessage,
          refundAmount: request.refundAmount, // SỬA LỖI: Sử dụng refundAmount
            requestDetailUrl: `${process.env.BASE_URL}/user-profile/return-order/${request.id}`,
          });

          await sendEmail(
            request.order.User.email,
            clientNotifTitle,
            emailHtml
          );
        }
      } catch (mailErr) {
        console.error(
          "❌ Không gửi được email update trạng thái trả hàng:",
          mailErr
        );
      }

      return res.json({
        message: "Cập nhật trạng thái trả hàng thành công",
        data: request,
      });
    } catch (err) {
      await t.rollback();
      console.error("[updateReturnStatus][ERROR]", err);
      return res
        .status(500)
        .json({ message: "Lỗi server khi cập nhật trạng thái trả hàng" });
    }
  }

  static async getReturnDetail(req, res) {
    try {
      const { id } = req.params;

      const request = await ReturnRequest.findByPk(id, {
        include: [
          {
            model: Order,
            as: "order",
            include: [
              {
                model: OrderItem,
                as: "items",
                include: [
                  {
                    model: Sku,
                    include: [
                      {
                        model: FlashSaleItem,
                        as: "flashSaleSkus",
                        required: false,
                      },
                      {
                        model: Product,
                        as: "product",
                      },
                    ],
                  },
                ],
              },
              {
                model: PaymentMethod,
                as: "paymentMethod",
                attributes: ["code"],
              },
              {
                model: User,

                attributes: ["id", "email", "fullName"],
              },
              {
                model: ShippingProvider,
                as: "shippingProvider",
                attributes: ["name"],
              },
            ],
          },
          {
            model: ReturnRequestItem,
            as: "items",
            include: [
              {
                model: Sku,
                as: "sku",
                attributes: ["id", "skuCode"],
                include: [
                  {
                    model: Product,
                    as: "product",
                    attributes: ["name"],
                  },
                ],
              },
            ],
          },
          {
            model: RefundRequest,
            as: "refundRequest",
            required: false,
          },
        ],
      });

      if (!request) {
        return res
          .status(404)
          .json({ message: "Không tìm thấy yêu cầu trả hàng" });
      }

      const refundAmount = calculateRefundAmount(request);

      // Tạo mảng proofs từ evidenceImages và evidenceVideos
      const imageUrls =
        request.evidenceImages?.split(",").filter(Boolean) || [];
      const videoUrls =
        request.evidenceVideos?.split(",").filter(Boolean) || [];

      const proofs = [
        ...imageUrls.map((url) => ({ url, type: "image" })),
        ...videoUrls.map((url) => ({ url, type: "video" })),
      ];

      return res.json({
        data: {
          ...request.toJSON(),
          refundAmount,
          proofs,
          returnMethod: request.returnMethod,
        },
      });
    } catch (error) {
      console.error("[getReturnDetail]", error);
      return res
        .status(500)
        .json({ message: "Lỗi server khi lấy chi tiết trả hàng" });
    }
  }

  static async getRefundByOrder(req, res) {
    try {
      const { orderId } = req.params;
      const refunds = await RefundRequest.findAll({
        where: { orderId },
        order: [["createdAt", "DESC"]],
      });
      return res.json({ data: refunds });
    } catch (error) {
      console.error("Lỗi khi lấy yêu cầu hoàn tiền:", error);
      return res.status(500).json({ message: "Lỗi server" });
    }
  }

  static async updateRefundStatus(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;
      const { status, responseNote } = req.body;

      const refund = await RefundRequest.findByPk(id, {
        include: [
          {
            model: Order,
            as: "order",
            include: [
              {
                model: PaymentMethod,
                as: "paymentMethod",
                attributes: ["code"],
              },
              { model: ReturnRequest, as: "returnRequest", required: false },
            ],
          },
        ],
        lock: t.LOCK.UPDATE,
        transaction: t,
      });

      if (!refund || refund.status === "refunded") {
        await t.rollback();
        return res
          .status(400)
          .json({ message: "Yêu cầu hoàn tiền không hợp lệ" });
      }

      if (status === "refunded") {
        const payCode = refund.order.paymentMethod?.code?.toLowerCase();
        const payload = {
          orderCode: refund.order.orderCode,
          amount: refund.amount,
        };

        if (
          ["cod", "atm", "zalopay", "payos", "internalwallet"].includes(payCode)
        ) {
          const wallet = await Wallet.findOne({
            where: { userId: refund.order.userId },
            transaction: t,
            lock: t.LOCK.UPDATE,
          });
          if (!wallet) {
            await t.rollback();
            return res
              .status(400)
              .json({ message: "Không tìm thấy ví nội bộ của người dùng" });
          }
          wallet.balance = Number(wallet.balance) + Number(refund.amount);
          await wallet.save({ transaction: t });
          await WalletTransaction.create(
            {
              walletId: wallet.id,
              type: "refund",
              amount: refund.amount,
              description: `Hoàn tiền đơn hàng #${refund.order.orderCode}`,
              relatedOrderId: refund.order.id,
            },
            { transaction: t }
          );
          refund.gatewayTransId = null;
          refund.refundedAt = new Date();
          refund.order.paymentStatus = "refunded";
          await refund.order.save({ transaction: t });
          if (refund.order.returnRequest) {
            refund.order.returnRequest.status = "refunded";
            await refund.order.returnRequest.save({ transaction: t });
          }
        } else {
          if (payCode === "momo") {
            if (!refund.order.momoTransId) {
              await t.rollback();
              return res.status(400).json({ message: "Thiếu momoTransId" });
            }
            payload.momoTransId = refund.order.momoTransId;
          }
          if (payCode === "vnpay") {
            if (!refund.order.vnpTransactionId || !refund.order.paymentTime) {
              await t.rollback();
              return res.status(400).json({ message: "Thiếu thông tin VNPay" });
            }
            const formatDateToVnp = (date) => {
              const pad = (n) => n.toString().padStart(2, "0");
              const yyyy = date.getFullYear();
              const MM = pad(date.getMonth() + 1);
              const dd = pad(date.getDate());
              const HH = pad(date.getHours());
              const mm = pad(date.getMinutes());
              const ss = pad(date.getSeconds());
              return `${yyyy}${MM}${dd}${HH}${mm}${ss}`;
            };
            payload.vnpTransactionId = refund.order.vnpTransactionId;
            payload.transDate = formatDateToVnp(
              new Date(refund.order.paymentTime)
            );
          }
          if (payCode === "stripe") {
            if (!refund.order.stripePaymentIntentId) {
              await t.rollback();
              return res
                .status(400)
                .json({ message: "Thiếu stripePaymentIntentId" });
            }
            payload.stripePaymentIntentId = refund.order.stripePaymentIntentId;
          }
          const { ok, transId, rawResp } = await refundGateway(
            payCode,
            payload
          );
          if (!ok) {
            await t.rollback();
            return res
              .status(400)
              .json({ message: "Hoàn tiền thất bại", error: rawResp });
          }
          refund.gatewayTransId = transId || null;
          refund.refundedAt = new Date();
          refund.order.paymentStatus = "refunded";
          await refund.order.save({ transaction: t });
          if (refund.order.returnRequest) {
            refund.order.returnRequest.status = "refunded";
            await refund.order.returnRequest.save({ transaction: t });
          }
        }

        const clientNotifTitle = "Yêu cầu hoàn tiền thành công";
        const clientNotifMessage = `Yêu cầu hoàn tiền #${
          refund.id
        } đã được xử lý thành công. Số tiền ${
          refund.amount
        } VNĐ đã được hoàn trả${
          ["cod", "atm", "zalopay", "payos", "internalwallet"].includes(payCode)
            ? " vào ví nội bộ"
            : ""
        }.`;
        const clientNotification = await Notification.create(
          {
            title: clientNotifTitle,
            message: clientNotifMessage,
            slug: `refund-${refund.id}-${status}`,
            type: "refund",
            targetRole: "client",
            targetId: refund.order.userId,
            link: `/user-profile/orders/${refund.order.orderCode}`,
            isGlobal: false,
          },
          { transaction: t }
        );
        await NotificationUser.create(
          {
            notificationId: clientNotification.id,
            userId: refund.order.userId,
            isRead: false,
          },
          { transaction: t }
        );
        req.app.locals.io
          .to(`user-${refund.order.userId}`)
          .emit("new-client-notification", clientNotification);
      }

      refund.status = status;
      refund.responseNote = responseNote || null;
      await refund.save({ transaction: t });

      await t.commit();
      return res.json({
        message: "Cập nhật trạng thái hoàn tiền thành công",
        data: refund,
      });
    } catch (err) {
      await t.rollback();
      console.error("[updateRefundStatus]", err);
      return res
        .status(500)
        .json({ message: "Lỗi server khi cập nhật hoàn tiền" });
    }
  }
}

module.exports = ReturnController;
