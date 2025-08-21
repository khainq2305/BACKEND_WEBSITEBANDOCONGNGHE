// src/controllers/admin/orderController.js

const {
  Order,
  User,
  UserAddress,
  Province,
  ReturnRequest,
  RefundRequest,
  FlashSaleItem,
  District,
  ShippingProvider,
  Ward,
  PaymentMethod,
  OrderItem,

  sequelize,
  Sku,
  Product
} = require('../../models');
const mjml2html = require('mjml');
const { sendEmail } = require('../../utils/sendEmail');

const { Notification, NotificationUser, UserPoint, Coupon, CouponUser } = require('../../models');

const { generateOrderCancellationHtml } = require('../../utils/emailTemplates/orderCancellationTemplate'); // ← đường dẫn tùy vị trí bạn đặt file template

const refundGateway = require('../../utils/refundGateway');
const { Sequelize, Op } = require('sequelize');
const returnStock = async (orderItems, t) => {
  for (const it of orderItems) {
    await Sku.increment('stock', {
      by: it.quantity,
      where: { id: it.skuId },
      transaction: t,
    });

    const fsItem = it.Sku?.flashSaleSkus?.[0];
    if (fsItem) {
      await FlashSaleItem.increment('quantity', {
        by: it.quantity,
        where: { id: fsItem.id },
        transaction: t,
      });
    }
  }
};

class OrderController {
  static async getAll(req, res) {
    try {
      const {
        page = 1,
        limit = 10,
        search = '',
        status = '',
        paymentStatus = '',
        startDate,
        endDate
      } = req.query;

      const offset = (page - 1) * limit;
      const whereClause = {};

      if (status) whereClause.status = status;
      if (paymentStatus) whereClause.paymentStatus = paymentStatus;

      if (search) {
        whereClause[Op.or] = [
          { orderCode: { [Op.like]: `%${search}%` } },
          Sequelize.literal(`User.fullName LIKE '%${search}%'`),
          Sequelize.literal(`User.phone LIKE '%${search}%'`),
          Sequelize.literal(`shippingAddress.phone LIKE '%${search}%'`)
        ];
      }


      if (startDate && endDate) {
        whereClause.createdAt = {
          [Op.between]: [
            new Date(startDate + 'T00:00:00'),
            new Date(endDate + 'T23:59:59')
          ]
        };
      } else if (startDate) {
        whereClause.createdAt = {
          [Op.gte]: new Date(startDate + 'T00:00:00')
        };
      } else if (endDate) {
        whereClause.createdAt = {
          [Op.lte]: new Date(endDate + 'T23:59:59')
        };
      }

      const includeClause = [
        {
          model: User,
          attributes: ['id', 'fullName', 'email', 'phone'],
          required: false
        },
        {
          model: UserAddress,
          as: 'shippingAddress',
          attributes: ['streetAddress', 'fullName', 'phone'],
          include: [
            { model: Province, as: 'province', attributes: ['name'] },
            { model: District, as: 'district', attributes: ['name'] },
            { model: Ward, as: 'ward', attributes: ['name'] }
          ]
        },
        {
          model: PaymentMethod,
          as: 'paymentMethod',
          attributes: ['name', 'code']
        },
        {
          model: OrderItem,
          as: 'items',
          include: [
            {
              model: Sku,
              include: [
                {
                  model: Product,
                  as: 'product',
                  attributes: ['name']
                }
              ]
            }
          ]
        },
        {
          model: ReturnRequest,
          as: 'returnRequest',
          attributes: ['id', 'status'],
          required: false,
          where: {
            status: {
              [Op.in]: [
                'pending',
                'approved',
                'awaiting_pickup',
                'pickup_booked',
                'received'
              ]
            }
          }
        }
      ];

     const orderClause = [['createdAt', 'DESC']];

      const { count, rows } = await Order.findAndCountAll({
        subQuery: false,
        where: whereClause,
        include: includeClause,
        order: orderClause,
        offset: parseInt(offset),
        limit: parseInt(limit),
        distinct: true
      });

      const formattedOrders = rows.map((o) => ({
        id: o.id,
        code: o.orderCode,
        customer: o.User?.fullName || '—',
        total: o.totalPrice || 0,
        phone: o.User?.phone || o.shippingAddress?.phone || '—',

        status: o.status,
        paymentStatus: o.paymentStatus,
        paymentMethodCode: o.paymentMethod?.code || null,
        createdAt: o.createdAt,
        hasPendingReturn: !!o.returnRequest
      }));

      // --- Đếm status đúng theo điều kiện lọc ---
      const statusWhereClause = {};

      if (search) {
        statusWhereClause[Op.or] = [
          { orderCode: { [Op.like]: `%${search}%` } }
        ];
      }

      if (startDate && endDate) {
        statusWhereClause.createdAt = {
          [Op.between]: [
            new Date(startDate + 'T00:00:00'),
            new Date(endDate + 'T23:59:59')
          ]
        };
      } else if (startDate) {
        statusWhereClause.createdAt = {
          [Op.gte]: new Date(startDate + 'T00:00:00')
        };
      } else if (endDate) {
        statusWhereClause.createdAt = {
          [Op.lte]: new Date(endDate + 'T23:59:59')
        };
      }

      const statusCountRaw = await Order.findAll({
        attributes: [
          'status',
          [Sequelize.fn('COUNT', Sequelize.col('Order.id')), 'count']
        ],
        include: [
          {
            model: User,
            attributes: [],
            required: false,
            where: search
              ? { fullName: { [Op.like]: `%${search}%` } }
              : undefined
          }
        ],
        where: statusWhereClause,
        group: ['status'],
        raw: true
      });

      const statusCountMap = statusCountRaw.reduce((acc, cur) => {
        acc[cur.status] = parseInt(cur.count);
        return acc;
      }, {});

      const totalAll = Object.values(statusCountMap).reduce((a, b) => a + b, 0);

      return res.json({
        totalItems: count,
        totalPages: Math.ceil(count / limit),
        data: formattedOrders,
        statusStats: [
          { status: '', label: 'Tất cả', count: totalAll },
          {
            status: 'processing',
            label: 'Đang xử lý',
            count: statusCountMap['processing'] || 0
          },
          {
            status: 'shipping',
            label: 'Vận chuyển',
            count: statusCountMap['shipping'] || 0
          },
          {
            status: 'delivered',
            label: 'Đã giao',
            count: statusCountMap['delivered'] || 0
          },
          {
            status: 'completed',
            label: 'Hoàn thành',
            count: statusCountMap['completed'] || 0
          },
          {
            status: 'cancelled',
            label: 'Đã hủy',
            count: statusCountMap['cancelled'] || 0
          }
        ]
      });
    } catch (error) {
      console.error('Lỗi lấy danh sách đơn hàng:', error);
      return res.status(500).json({
        message: 'Lỗi server khi lấy danh sách đơn hàng'
      });
    }
  }


  static async updateStatus(req, res) {
    // Lặp lại tối đa 3 lần nếu gặp lỗi lock
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const t = await sequelize.transaction();
      try {
        const { id } = req.params;
        const { status, cancelReason } = req.body;
        console.log(`[updateStatus] Attempt ${attempt}: BODY LÀ:`, req.body);
        console.log(`[updateStatus] Attempt ${attempt}: Đơn hàng ID:`, id);

        if (!status) {
          await t.rollback();
          return res.status(400).json({ message: 'Thiếu trạng thái cần cập nhật' });
        }

        const order = await Order.findOne({
          where: { id },
          include: [
            {
              model: OrderItem,
              as: 'items',
              include: [{
                model: Sku,
                required: true,
                include: {
                  model: FlashSaleItem,
                  as: 'flashSaleSkus',
                  required: false
                }
              }]
            },
            {
              model: PaymentMethod,
              as: 'paymentMethod',
              attributes: ['code']
            },
            {
              model: User,
              attributes: ['id']
            }
          ],
          transaction: t,
          lock: t.LOCK.UPDATE
        });


        if (!order) {
          await t.rollback();
          return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
        }

        if (order.status === status) {
          await t.rollback();
          return res.status(400).json({ message: 'Đơn hàng đã ở trạng thái này' });
        }

        if (['completed', 'cancelled'].includes(order.status)) {
          await t.rollback();
          return res.status(400).json({ message: 'Đơn hàng đã kết thúc, không thể cập nhật' });
        }

        // === ✅ TRƯỜNG HỢP HỦY ĐƠN ===
        if (status === 'cancelled') {
          if (!cancelReason?.trim()) {
            await t.rollback();
            return res.status(400).json({ message: 'Lý do huỷ đơn không được bỏ trống' });
          }
          if (order.status === 'shipping') {
            await t.rollback();
            return res.status(400).json({ message: 'Không thể huỷ đơn khi đã vận chuyển' });
          }
          const paid = order.paymentStatus === 'paid';
          const payCode = order.paymentMethod?.code?.toLowerCase();

          // Hoàn tiền nếu cần
          if (paid && ['momo', 'vnpay', 'zalopay', 'stripe', 'payos'].includes(payCode)) {

            const payload = {
              orderCode: order.orderCode,
              amount: Math.round(Number(order.finalPrice))
            };

            if (payCode === 'momo') {
              if (!order.momoTransId) {
                await t.rollback();
                return res.status(400).json({ message: 'Thiếu thông tin giao dịch MoMo' });
              }
              payload.momoTransId = order.momoTransId;
            }

            if (payCode === 'vnpay') {
              if (!order.vnpTransactionId || !order.paymentTime) {
                await t.rollback();
                return res.status(400).json({ message: 'Thiếu thông tin giao dịch VNPay' });
              }
              payload.vnpTransactionId = order.vnpTransactionId;
              payload.transDate = order.paymentTime;
            }

            if (payCode === 'zalopay') {
              if (!order.zaloTransId || !order.zaloAppTransId) {
                await t.rollback();
                return res.status(400).json({ message: 'Thiếu thông tin giao dịch ZaloPay' });
              }
              payload.zp_trans_id = order.zaloTransId;
              payload.app_trans_id = order.zaloAppTransId;
            }

            if (payCode === 'stripe') {
              if (!order.stripePaymentIntentId) {
                await t.rollback();
                return res.status(400).json({ message: 'Thiếu thông tin giao dịch Stripe' });
              }
              payload.stripePaymentIntentId = order.stripePaymentIntentId;
            }

            const { ok, transId } = await refundGateway(payCode, payload);
            if (!ok) {
              await t.rollback();
              return res.status(400).json({ message: 'Hoàn tiền qua cổng thanh toán thất bại' });
            }

            order.paymentStatus = 'refunded';
            order.gatewayTransId = transId || null;
          } else {
            order.paymentStatus = 'unpaid';
          }

          // Trả tồn kho / flash sale
          for (const it of order.items) {
            await Sku.increment('stock', {
              by: it.quantity,
              where: { id: it.skuId },
              transaction: t
            });

            const fsItem = it.Sku.flashSaleSkus?.[0];
            if (fsItem) {
              await FlashSaleItem.increment('quantity', {
                by: it.quantity,
                where: { id: fsItem.id },
                transaction: t
              });
            }
          }

          // Trả lại coupon
          if (order.couponId) {
            await Coupon.increment('totalQuantity', {
              by: 1,
              where: { id: order.couponId },
              transaction: t
            });
          }

          // Cập nhật đơn
          order.status = 'cancelled';
          order.cancelReason = cancelReason.trim();
          await order.save({ transaction: t });
          await UserPoint.destroy({
            where: { orderId: order.id, userId: order.userId, type: 'earn' },
            transaction: t,
          });
          await CouponUser.decrement('used', {
            by: 1,
            where: { userId: order.userId, couponId: order.couponId },
            transaction: t,
          });

          await Coupon.decrement('usedCount', {
            by: 1,
            where: { id: order.couponId },
            transaction: t,
          });
          
          const slug = `admin-cancel-order-${order.orderCode}`;
          // Gửi thông báo đến người dùng (Client)
          const clientNotif = await Notification.create({
            title: 'Đơn hàng của bạn đã bị hủy',
            message: `Đơn hàng ${order.orderCode} đã bị hủy bởi quản trị viên.`,
            slug: `client-cancelled-${order.orderCode}`,
            type: 'order',
            targetRole: 'client',
            targetId: order.id,
            link: `/user-profile/orders/${order.orderCode}`,
            isGlobal: false,
          }, { transaction: t });

          // Gán thông báo cho người dùng cụ thể
          await NotificationUser.create({
            notificationId: clientNotif.id,
            userId: order.userId,
            isRead: false,
          }, { transaction: t });

          req.app.locals.io
            .to(`user-${order.userId}`)
            .emit('new-client-notification', clientNotif);


          const adminNotif = await Notification.create({
            title: 'Có đơn hàng bị huỷ bởi quản trị viên',
            message: `Đơn ${order.orderCode} đã bị huỷ bởi một quản trị viên.`,
            slug: `admin-cancelled-${order.orderCode}`,
            type: 'order',
            targetRole: 'admin',
            targetId: order.id,
            link: `/admin/orders/${order.id}`,
            isGlobal: true,
          }, { transaction: t });

          req.app.locals.io
            .to('admin-room')
            .emit('new-admin-notification', adminNotif);
          if (order.user?.email) {
            const emailMjmlContent = generateOrderCancellationHtml({
              orderCode: order.orderCode,
              cancelReason: order.cancelReason,
              userName: order.user.fullName || order.user.email || "Khách hàng",
              orderDetailUrl: `https://your-frontend-domain.com/user-profile/orders/${order.orderCode}`,
              companyName: "Cyberzone",
              companyLogoUrl: "https://res.cloudinary.com/dzrp2hsvh/image/upload/v1753761547/uploads/ohs6h11zyavrv2haky9f.png",
              companyAddress: "Trương Vĩnh Nguyên, phường Cái Răng, Cần Thơ",
              companyPhone: "0878999894",
              companySupportEmail: "contact@cyberzone.com",
            });

            const { html: emailHtml } = mjml2html(emailMjmlContent);

            try {
              await sendEmail(order.user.email, `Đơn hàng ${order.orderCode} đã bị huỷ`, emailHtml);
            } catch (emailErr) {
              console.error(`[updateStatus] Lỗi gửi email huỷ đơn ${order.orderCode}:`, emailErr);
            }
          }

          await t.commit();
          console.log(`[updateStatus] Huỷ đơn hàng ${order.id} thành công.`);
          return res.json({ message: 'Huỷ đơn & hoàn tiền thành công', orderId: order.id });
        }

       
        const statusOrder = ['processing', 'shipping', 'delivered', 'completed'];
        const currentIndex = statusOrder.indexOf(order.status);
        const newIndex = statusOrder.indexOf(status);

        if (newIndex !== -1 && currentIndex !== -1 && newIndex < currentIndex) {
          await t.rollback();
          return res.status(400).json({
            message: `Không thể chuyển trạng thái lùi từ "${order.status}" về "${status}"`
          });
        }

        order.status = status;
        await order.save({ transaction: t });
        let clientNotifTitle = '';
let clientNotifMessage = '';
let sendNotification = false;

switch (status) {
    case 'shipping':
        clientNotifTitle = 'Đơn hàng đang trên đường đến bạn';
        clientNotifMessage = `Đơn hàng ${order.orderCode} đã được giao cho đơn vị vận chuyển. Bạn sẽ nhận được hàng trong vài ngày tới.`;
        sendNotification = true;
        break;
    case 'delivered':
        clientNotifTitle = 'Đơn hàng đã được giao thành công';
        clientNotifMessage = `Đơn hàng ${order.orderCode} đã được giao đến bạn. Cảm ơn bạn đã mua sắm tại Cyberzone! Vui lòng đánh giá sản phẩm để nhận thêm ưu đãi.`;
        sendNotification = true;
        break;
}

if (sendNotification && order.userId) {
    const clientNotification = await Notification.create({
        title: clientNotifTitle,
        message: clientNotifMessage,
        slug: `client-status-update-${order.orderCode}-${status}`,
        type: 'order',
        targetRole: 'client',
        targetId: order.id,
        link: `/user-profile/orders/${order.orderCode}`,
        isGlobal: false,
    }, { transaction: t });

    await NotificationUser.create({
        notificationId: clientNotification.id,
        userId: order.userId,
        isRead: false,
    }, { transaction: t });

    req.app.locals.io.to(`user-${order.userId}`).emit('new-client-notification', clientNotification);
}

// KẾT THÚC ĐOẠN CODE THÔNG BÁO MỚI CỦA BẠN

        await t.commit();

        req.app.locals.io.to(`order-${order.id}`).emit('order-status-updated', {
          orderId: order.id,
          newStatus: order.status
        });

        if (order.user?.id) {
          req.app.locals.io.to(`user-${order.user.id}`).emit('order-updated', {
            orderId: order.id,
            newStatus: order.status
          });
        }


        return res.json({ message: 'Cập nhật trạng thái thành công', status: order.status });

      } catch (err) {
        if (!t.finished) {
          await t.rollback();
        }


        // Kiểm tra xem lỗi có phải là do lock timeout không
        if (err.parent?.code === 'ER_LOCK_WAIT_TIMEOUT' && attempt < maxRetries) {
          console.warn(`[updateStatus] Lock wait timeout exceeded for order ${req.params.id}. Retrying... Attempt ${attempt + 1}/${maxRetries}`);
          // Chờ một khoảng thời gian ngắn trước khi thử lại
          await new Promise(resolve => setTimeout(resolve, 500 * attempt));
          continue; // Bắt đầu vòng lặp mới
        }

        console.error('[updateStatus] Lỗi server khi cập nhật trạng thái:', err);
        return res.status(500).json({ message: 'Lỗi server khi cập nhật trạng thái' });
      }
    }

    // Nếu đã thử lại hết số lần mà vẫn lỗi
    return res.status(500).json({ message: 'Cập nhật trạng thái thất bại do quá tải hệ thống.' });
  }

  static async getDetail(req, res) {
    try {
      const { id } = req.params;

      const order = await Order.findOne({
        where: { id },
        include: [
          {
            model: User,
            attributes: ['id', 'fullName', 'email', 'phone']
          },
          {
            model: UserAddress,
            as: 'shippingAddress',
            attributes: ['streetAddress', 'fullName', 'phone'],
            include: [
              { model: Province, as: 'province', attributes: ['name'] },
              { model: District, as: 'district', attributes: ['name'] },
              { model: Ward, as: 'ward', attributes: ['name'] }
            ]
          },
          {
            model: PaymentMethod,
            as: 'paymentMethod',
            attributes: ['id', 'name', 'code']
          },
          {
            model: ShippingProvider,
            as: 'shippingProvider',
            attributes: ['id', 'name', 'code']
          },

          {
            model: OrderItem,
            as: 'items',
            include: [
              {
                model: Sku,
                attributes: ['id', 'price', 'originalPrice'],
                include: [
                  {
                    model: Product,
                    as: 'product',
                    attributes: ['id', 'name', 'thumbnail']
                  }
                ]
              }
            ]
          }
        ]
      });

      if (!order) {
        return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
      }

      return res.json(order);
    } catch (error) {
      console.error('Lỗi khi lấy chi tiết đơn hàng:', error);
      return res.status(500).json({ message: 'Lỗi server khi lấy chi tiết đơn hàng' });
    }
  }
  // controllers/client/orderController.js
  // static async cancelOrder(req, res) {
  //   const t = await sequelize.transaction();
  //   try {
  //     const { id } = req.params;
  //     const { reason } = req.body || {};
  //     const reasonText = typeof reason === 'string' ? reason : reason?.reason;

  //     if (!reasonText?.trim()) {
  //       return res.status(400).json({ message: 'Lý do huỷ đơn không được bỏ trống' });
  //     }

  //     // 1. Tìm đơn hàng + item + sku + flash sale + phương thức thanh toán
  //     const order = await Order.findOne({
  //       where: { id },
  //       include: [
  //         {
  //           model: OrderItem,
  //           as: 'items',
  //           include: [{
  //             model: Sku,
  //             required: true,
  //             include: {
  //               model: FlashSaleItem,
  //               as: 'flashSaleSkus',
  //               required: false
  //             }
  //           }]
  //         },
  //         {
  //           model: PaymentMethod,
  //           as: 'paymentMethod',
  //           attributes: ['code']
  //         }
  //       ],
  //       transaction: t,
  //       lock: t.LOCK.UPDATE
  //     });

  //     if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
  //     if (order.status === 'cancelled')
  //       return res.status(400).json({ message: 'Đơn hàng đã huỷ' });
  //     if (['delivered', 'completed'].includes(order.status))
  //       return res.status(400).json({ message: 'Không thể huỷ đơn đã giao hoặc hoàn thành' });

  //     // 2. Hoàn tiền nếu đã thanh toán
  //     const paid = order.paymentStatus === 'paid';
  //     const payCode = order.paymentMethod?.code?.toLowerCase();

  //     if (paid && ['momo', 'vnpay', 'zalopay', 'stripe'].includes(payCode)) {
  //       const payload = {
  //         orderCode: order.orderCode,
  //         amount: Math.round(Number(order.finalPrice))
  //       };

  //       if (payCode === 'momo') {
  //         if (!order.momoTransId)
  //           return res.status(400).json({ message: 'Thiếu thông tin giao dịch MoMo' });
  //         payload.momoTransId = order.momoTransId;
  //       }

  //       if (payCode === 'vnpay') {
  //         if (!order.vnpTransactionId || !order.paymentTime)
  //           return res.status(400).json({ message: 'Thiếu thông tin giao dịch VNPay' });
  //         payload.vnpTransactionId = order.vnpTransactionId;
  //         payload.transDate = order.paymentTime;
  //       }

  //       if (payCode === 'zalopay') {
  //         if (!order.zaloTransId || !order.zaloAppTransId)
  //           return res.status(400).json({ message: 'Thiếu thông tin giao dịch ZaloPay' });
  //         payload.zp_trans_id = order.zaloTransId;
  //         payload.app_trans_id = order.zaloAppTransId;
  //       }

  //       if (payCode === 'stripe') {
  //         if (!order.stripePaymentIntentId)
  //           return res.status(400).json({ message: 'Thiếu thông tin giao dịch Stripe' });
  //         payload.stripePaymentIntentId = order.stripePaymentIntentId;
  //       }

  //       console.log('[REFUND] Payload gửi gateway:', payload);

  //       const { ok, transId } = await refundGateway(payCode, payload);

  //       if (!ok) {
  //         await t.rollback();
  //         return res.status(400).json({ message: 'Hoàn tiền qua cổng thanh toán thất bại' });
  //       }

  //       order.paymentStatus = 'refunded';
  //       order.gatewayTransId = transId || null;
  //     } else {
  //       order.paymentStatus = 'unpaid';
  //     }

  //     // 3. Trả tồn kho / flash sale
  //     for (const it of order.items) {
  //       await Sku.increment('stock', {
  //         by: it.quantity,
  //         where: { id: it.skuId },
  //         transaction: t
  //       });

  //       const fsItem = it.Sku.flashSaleSkus?.[0];
  //     if (fsItem) {
  //   await FlashSaleItem.increment('quantity', {
  //     by: it.quantity,
  //     where: { id: fsItem.id },
  //     transaction: t
  //   });

  //   console.log(`[cancelOrder] Đã hoàn lại ${it.quantity} suất FlashSaleItemId=${fsItem.id} từ skuId=${it.skuId}`);
  // }

  //     }

  //     // 4. Trả lại coupon nếu có
  //     if (order.couponId) {
  //       await Coupon.increment('totalQuantity', {
  //         by: 1,
  //         where: { id: order.couponId },
  //         transaction: t
  //       });
  //     }

  //     // 5. Cập nhật đơn
  //     order.status = 'cancelled';
  //     order.cancelReason = reasonText.trim();
  //     await order.save({ transaction: t });

  //     await t.commit();
  //     return res.json({
  //       message: 'Huỷ đơn & hoàn tiền thành công',
  //       orderId: order.id
  //     });

  //   } catch (err) {
  //     await t.rollback();
  //     console.error('[cancelOrder]', err);
  //     return res.status(500).json({ message: 'Lỗi server khi huỷ đơn' });
  //   }
  // }
  // static async updateStatus(req, res) {
  //   try {
  //     const { id } = req.params;
  //     const { status } = req.body;

  //     if (!status) {
  //       return res.status(400).json({ message: 'Thiếu trạng thái cần cập nhật' });
  //     }

  //     const order = await Order.findByPk(id);
  //     if (!order) {
  //       return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
  //     }

  //     // Không cập nhật nếu đã chốt
  //     if (['completed', 'cancelled'].includes(order.status)) {
  //       return res.status(400).json({ message: 'Đơn hàng đã kết thúc, không thể cập nhật' });
  //     }

  //     if (order.status === status) {
  //       return res.status(400).json({ message: 'Đơn hàng đã ở trạng thái này' });
  //     }

  //     // Định nghĩa thứ tự trạng thái
  //     const statusOrder = ['processing', 'shipping', 'delivered', 'completed'];

  //     const currentIndex = statusOrder.indexOf(order.status);
  //     const newIndex = statusOrder.indexOf(status);

  //     // Nếu trạng thái mới nằm trước trạng thái hiện tại ⇒ KHÔNG CHO PHÉP
  //     if (newIndex !== -1 && currentIndex !== -1 && newIndex < currentIndex) {
  //   return res.status(400).json({
  //     message: `Không thể chuyển trạng thái lùi từ "${order.status}" về "${status}"`
  //   });
  // }


  //     // Nếu là trạng thái khác không nằm trong flow (như "cancelled") thì vẫn cho phép
  //     order.status = status;
  //     await order.save();

  //     return res.json({
  //       message: 'Cập nhật trạng thái thành công',
  //       status: order.status
  //     });

  //   } catch (error) {
  //     console.error('Lỗi khi cập nhật trạng thái đơn hàng:', error);
  //     return res.status(500).json({ message: 'Lỗi server khi cập nhật trạng thái đơn hàng' });
  //   }
  // }

  static async updatePaymentStatus(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;
      const { paymentStatus } = req.body;

      if (!paymentStatus) {
        return res
          .status(400)
          .json({ message: 'Thiếu trạng thái thanh toán cần cập nhật' });
      }

      const order = await Order.findByPk(id, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!order) {
        await t.rollback();
        return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
      }

      // Chỉ cho phép chuyển từ 'waiting' hoặc 'unpaid' sang 'paid'
      // Đây là nơi bạn định nghĩa logic chuyển đổi trạng thái thanh toán thủ công.
      if (!['waiting', 'unpaid'].includes(order.paymentStatus)) {
        await t.rollback();
        return res.status(400).json({
          message: 'Không thể cập nhật trạng thái thanh toán cho đơn hàng này',
        });
      }

      if (paymentStatus === 'paid') {
        order.paymentStatus = 'paid';
        // Có thể thêm logic khác ở đây nếu cần, ví dụ:
        // Cập nhật trạng thái đơn hàng nếu nó đang ở 'processing' và bây giờ đã thanh toán
        if (order.status === 'processing') {
          // Bạn có thể chọn chuyển sang 'confirmed' hoặc giữ 'processing' tùy quy trình của bạn
          // order.status = 'confirmed';
        }

        await order.save({ transaction: t });
        await t.commit();
        return res.json({
          message: 'Cập nhật trạng thái thanh toán thành công',
          paymentStatus: order.paymentStatus,
        });
      } else {
        await t.rollback();
        return res
          .status(400)
          .json({ message: 'Trạng thái thanh toán không hợp lệ' });
      }
    } catch (error) {
      await t.rollback();
      console.error('Lỗi khi cập nhật trạng thái thanh toán:', error);
      return res
        .status(500)
        .json({ message: 'Lỗi server khi cập nhật trạng thái thanh toán' });
    }
  }


}

module.exports = OrderController;
