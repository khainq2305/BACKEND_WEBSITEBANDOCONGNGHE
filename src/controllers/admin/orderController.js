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
      const { page = 1, limit = 10, search = '', status = '' } = req.query;
      const offset = (page - 1) * limit;

      const whereClause = {};
      if (status) {
        whereClause.status = status;
      }

      if (search) {
        whereClause[Op.or] = [
          { orderCode: { [Op.like]: `%${search}%` } },
          Sequelize.literal(`User.fullName LIKE '%${search}%'`)
        ];
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
          as: 'returnRequest', // ✅ Giữ nguyên alias số ít
          attributes: ['id', 'status'],
          required: false,
          where: {
            status: {
              [Op.in]: ['pending', 'approved', 'awaiting_pickup', 'pickup_booked', 'received']
            }
          }
        }
      ];

      const { count, rows } = await Order.findAndCountAll({
        subQuery: false,
        where: whereClause,
        include: includeClause,
        order: [['createdAt', 'DESC']],
        offset: parseInt(offset),
        limit: parseInt(limit),
        distinct: true
      });

      const formattedOrders = rows.map((o) => ({
        id: o.id,
        code: o.orderCode,
        customer: o.User?.fullName || '—',
        total: o.totalPrice || 0,
        status: o.status,
        paymentStatus: o.paymentStatus,
        paymentMethodCode: o.paymentMethod?.code || null,
        createdAt: o.createdAt,
        // ✅ SỬA DÒNG NÀY: Kiểm tra trực tiếp đối tượng returnRequest
        hasPendingReturn: !!o.returnRequest // `!!` chuyển đổi thành boolean: true nếu có object, false nếu null/undefined
      }));

      return res.json({
        totalItems: count,
        totalPages: Math.ceil(count / limit),
        data: formattedOrders
      });
    } catch (error) {
      console.error('Lỗi lấy danh sách đơn hàng:', error);
      return res.status(500).json({
        message: 'Lỗi server khi lấy danh sách đơn hàng'
      });
    }
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
static async cancelOrder(req, res) {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { reason } = req.body || {};
    const reasonText = typeof reason === 'string' ? reason : reason?.reason;

    if (!reasonText?.trim()) {
      return res.status(400).json({ message: 'Lý do huỷ đơn không được bỏ trống' });
    }

    // 1. Tìm đơn hàng + item + sku + flash sale + phương thức thanh toán
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
        }
      ],
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
    if (order.status === 'cancelled')
      return res.status(400).json({ message: 'Đơn hàng đã huỷ' });
    if (['delivered', 'completed'].includes(order.status))
      return res.status(400).json({ message: 'Không thể huỷ đơn đã giao hoặc hoàn thành' });

    // 2. Hoàn tiền nếu đã thanh toán
    const paid = order.paymentStatus === 'paid';
    const payCode = order.paymentMethod?.code?.toLowerCase();

    if (paid && ['momo', 'vnpay', 'zalopay', 'stripe'].includes(payCode)) {
      const payload = {
        orderCode: order.orderCode,
        amount: Math.round(Number(order.finalPrice))
      };

      if (payCode === 'momo') {
        if (!order.momoTransId)
          return res.status(400).json({ message: 'Thiếu thông tin giao dịch MoMo' });
        payload.momoTransId = order.momoTransId;
      }

      if (payCode === 'vnpay') {
        if (!order.vnpTransactionId || !order.paymentTime)
          return res.status(400).json({ message: 'Thiếu thông tin giao dịch VNPay' });
        payload.vnpTransactionId = order.vnpTransactionId;
        payload.transDate = order.paymentTime;
      }

      if (payCode === 'zalopay') {
        if (!order.zaloTransId || !order.zaloAppTransId)
          return res.status(400).json({ message: 'Thiếu thông tin giao dịch ZaloPay' });
        payload.zp_trans_id = order.zaloTransId;
        payload.app_trans_id = order.zaloAppTransId;
      }

      if (payCode === 'stripe') {
        if (!order.stripePaymentIntentId)
          return res.status(400).json({ message: 'Thiếu thông tin giao dịch Stripe' });
        payload.stripePaymentIntentId = order.stripePaymentIntentId;
      }

      console.log('[REFUND] Payload gửi gateway:', payload);

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

    // 3. Trả tồn kho / flash sale
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

    // 4. Trả lại coupon nếu có
    if (order.couponId) {
      await Coupon.increment('totalQuantity', {
        by: 1,
        where: { id: order.couponId },
        transaction: t
      });
    }

    // 5. Cập nhật đơn
    order.status = 'cancelled';
    order.cancelReason = reasonText.trim();
    await order.save({ transaction: t });

    await t.commit();
    return res.json({
      message: 'Huỷ đơn & hoàn tiền thành công',
      orderId: order.id
    });

  } catch (err) {
    await t.rollback();
    console.error('[cancelOrder]', err);
    return res.status(500).json({ message: 'Lỗi server khi huỷ đơn' });
  }
}

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
static async updateStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ message: 'Thiếu trạng thái cần cập nhật' });
    }

    const order = await Order.findByPk(id);
    if (!order) {
      return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
    }

    // Không cập nhật nếu đã chốt
    if (['completed', 'cancelled'].includes(order.status)) {
      return res.status(400).json({ message: 'Đơn hàng đã kết thúc, không thể cập nhật' });
    }

    if (order.status === status) {
      return res.status(400).json({ message: 'Đơn hàng đã ở trạng thái này' });
    }

    // Định nghĩa thứ tự trạng thái
    const statusOrder = ['processing', 'shipping', 'delivered', 'completed'];

    const currentIndex = statusOrder.indexOf(order.status);
    const newIndex = statusOrder.indexOf(status);

    // Nếu trạng thái mới nằm trước trạng thái hiện tại ⇒ KHÔNG CHO PHÉP
    if (newIndex !== -1 && currentIndex !== -1 && newIndex < currentIndex) {
  return res.status(400).json({
    message: `Không thể chuyển trạng thái lùi từ "${order.status}" về "${status}"`
  });
}


    // Nếu là trạng thái khác không nằm trong flow (như "cancelled") thì vẫn cho phép
    order.status = status;
    await order.save();

    return res.json({
      message: 'Cập nhật trạng thái thành công',
      status: order.status
    });

  } catch (error) {
    console.error('Lỗi khi cập nhật trạng thái đơn hàng:', error);
    return res.status(500).json({ message: 'Lỗi server khi cập nhật trạng thái đơn hàng' });
  }
}


}

module.exports = OrderController;
