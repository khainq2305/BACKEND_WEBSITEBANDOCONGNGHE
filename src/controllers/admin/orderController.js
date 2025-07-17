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

    // ⚠️ Không để '$User.fullName$' trong where khi subQuery = true (mặc định)
    if (search) {
      whereClause[Op.or] = [
        { orderCode: { [Op.like]: `%${search}%` } },
        // ✅ dùng Sequelize.literal nếu cần vẫn giữ ở đây, hoặc dùng having bên dưới
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
  attributes: ['name', 'code'] // 👈 thêm "code" ở đây
}
,
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
      }
    ];

    const { count, rows } = await Order.findAndCountAll({
      subQuery: false, // ✅ CHÌA KHÓA để tránh lỗi subquery chưa join bảng User
      where: whereClause,
      include: includeClause,
      order: [['createdAt', 'DESC']],
      offset: parseInt(offset),
      limit: parseInt(limit),
      distinct: true
    });
const formattedOrders = rows.map((o) => ({
  id               : o.id,
  code             : o.orderCode,
  customer         : o.User?.fullName || '—',
  total            : o.totalPrice || 0,
  status           : o.status,           // trạng thái giao hàng
  paymentStatus    : o.paymentStatus,    // trạng thái thanh toán
  paymentMethodCode: o.paymentMethod?.code || null, // ✅ thêm dòng này
  createdAt        : o.createdAt
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
    /* --------- 0. Input --------- */
    const { id }     = req.params;
    const { reason } = req.body || {};

    if (!reason?.trim()) {
      return res.status(400).json({ message: 'Lý do huỷ đơn không được bỏ trống' });
    }

    /* --------- 1. Lấy đơn + items + sku + flashSaleItem --------- */
    const order = await Order.findOne({
      where: { id },
      include: [{
        model : OrderItem,
        as    : 'items',
        include: [{
          model : Sku,
          required: true,
          include: {
            model : FlashSaleItem,
            as    : 'flashSaleSkus',      // alias bạn đã khai báo
            required: false
          }
        }]
      }],
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!order)                 return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
    if (order.status === 'cancelled')
      return res.status(400).json({ message: 'Đơn hàng đã huỷ' });
    if (['delivered', 'completed'].includes(order.status))
      return res.status(400).json({ message: 'Không thể huỷ đơn đã giao hoặc hoàn thành' });

    /* --------- 2. Trả tồn kho / flash sale --------- */
    for (const it of order.items) {
      /* 2.1 SKU */
      await Sku.increment('stock', {
        by : it.quantity,
        where: { id: it.skuId },
        transaction: t
      });

      /* 2.2 Flash Sale (nếu có) */
      const fsItem = it.Sku.flashSaleSkus?.[0];
      if (fsItem) {
        await FlashSaleItem.increment('quantity', {
          by : it.quantity,
          where: { id: fsItem.id },
          transaction: t
        });
      }
    }

    /* --------- 3. Trả lượt dùng coupon (nếu giới hạn) --------- */
    if (order.couponId) {
      await Coupon.increment('totalQuantity', {
        by : 1,
        where: { id: order.couponId },
        transaction: t
      });
    }

    /* --------- 4. Cập nhật trạng thái đơn --------- */
    order.status        = 'cancelled';
    order.paymentStatus = 'unpaid';      // huỷ ⇒ coi như chưa thanh toán
    order.cancelReason  = reason.trim();
    await order.save({ transaction: t });

    await t.commit();
    return res.json({
      message: 'Huỷ đơn & hoàn kho thành công',
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
    const { status } = req.body;            // ⬅ trạng thái mới

    if (!status) {
      return res.status(400).json({ message: 'Thiếu trạng thái cần cập nhật' });
    }

    const order = await Order.findByPk(id);
    if (!order) {
      return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
    }

    /* ───────────────────────────────────────────────
       1. Không cho cập nhật những trạng thái “chốt”
    ─────────────────────────────────────────────── */
    if (['completed', 'cancelled'].includes(order.status)) {
      return res.status(400).json({ message: 'Đơn hàng đã kết thúc, không thể cập nhật' });
    }

    /* ───────────────────────────────────────────────
       2. Không được cập nhật nếu trùng trạng thái
    ─────────────────────────────────────────────── */
    if (order.status === status) {
      return res.status(400).json({ message: 'Đơn hàng đã ở trạng thái này' });
    }

    /* ───────────────────────────────────────────────
       3. Định nghĩa luồng chuyển tiếp hợp lệ
    ─────────────────────────────────────────────── */
    const forwardFlow = {
      processing: ['shipping', 'cancelled'],        // xử lý xong → giao / huỷ
      shipping  : ['delivered', 'cancelled'],       // đang giao  → đã giao / huỷ
      delivered : ['completed'],                    // giao xong  → hoàn thành
    };

    const nextAllowed = forwardFlow[order.status] || [];

    if (!nextAllowed.includes(status)) {
      return res.status(400).json({ 
        message: `Không thể chuyển từ "${order.status}" sang "${status}"` 
      });
    }

    /* ───────────────────────────────────────────────
       4. Cập nhật & trả về
    ─────────────────────────────────────────────── */
    order.status = status;
    await order.save();

    return res.json({ 
      message: 'Cập nhật trạng thái thành công',
      status : order.status 
    });

  } catch (error) {
    console.error('Lỗi khi cập nhật trạng thái đơn hàng:', error);
    return res.status(500).json({ message: 'Lỗi server khi cập nhật trạng thái đơn hàng' });
  }
}

static async getReturnByOrder(req, res) {
  try {
    const { orderId } = req.params;
    const requests = await ReturnRequest.findAll({
      where: { orderId },
      order: [['createdAt', 'DESC']]
    });

    return res.json({ data: requests });
  } catch (error) {
    console.error('Lỗi khi lấy yêu cầu trả hàng:', error);
    return res.status(500).json({ message: 'Lỗi server' });
  }
}
 static async updateReturnStatus(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;
      const { status, responseNote } = req.body;

      // ✅ Lấy yêu cầu trả hàng + đơn + item + SKU + flashSale nếu có
      const request = await ReturnRequest.findByPk(id, {
        include: {
          model: Order,
          as: 'order',
          include: {
            model: OrderItem,
            as: 'items',
            include: {
              model: Sku,
              include: { model: FlashSaleItem, as: 'flashSaleSkus', required: false }
            }
          }
        },
        transaction: t,
        lock: t.LOCK.UPDATE
      });

      if (!request) {
        await t.rollback();
        return res.status(404).json({ message: 'Không tìm thấy yêu cầu' });
      }

      // ✅ Kiểm tra trạng thái chuyển tiếp hợp lệ
      const flow = {
        pending: ['approved', 'rejected'],
        approved: ['awaiting_pickup', 'pickup_booked'],
        awaiting_pickup: ['received'],
        pickup_booked: ['received'],
        received: ['refunded'],
      };
      const next = flow[request.status] || [];
      if (!next.includes(status)) {
        await t.rollback();
        return res.status(400).json({ message: `Không thể chuyển ${request.status} → ${status}` });
      }

      // ✅ Nếu chuyển sang received → hoàn kho + sinh yêu cầu hoàn tiền
      if (status === 'received') {
        await returnStock(request.order.items, t);

   await RefundRequest.create({
  orderId : request.orderId,
  userId  : request.order.userId, // 👈 thêm dòng này
  amount  : request.order.finalPrice,
  reason  : 'Hoàn tiền thủ công',
  status  : 'pending'
}, { transaction: t });

      }

      // ✅ Cập nhật trạng thái yêu cầu
      request.status = status;
      request.responseNote = responseNote;
      await request.save({ transaction: t });

      await t.commit();
      return res.json({ message: 'Cập nhật trạng thái trả hàng thành công', data: request });

    } catch (error) {
      await t.rollback();
      console.error('[updateReturnStatus]', error);
      return res.status(500).json({ message: 'Lỗi server khi cập nhật trạng thái' });
    }
  }
static async getRefundByOrder(req, res) {
  try {
    const { orderId } = req.params;

    const refunds = await RefundRequest.findAll({
      where: { orderId },
      order: [['createdAt', 'DESC']]
    });

    return res.json({ data: refunds });
  } catch (error) {
    console.error('Lỗi khi lấy yêu cầu hoàn tiền:', error);
    return res.status(500).json({ message: 'Lỗi server' });
  }
}
// PATCH /admin/refund-requests/:id
// controllers/admin/orderController.js
// ...
static async updateRefundStatus(req, res) {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { status, responseNote } = req.body; // 'refunded' | 'rejected'

    console.log('✅ INPUT:', { id, status, responseNote });

    // 1️⃣ Lấy refund + order + payment method
    const refund = await RefundRequest.findByPk(id, {
      include: [{
        model: Order,
        as: 'order',
        include: [
          { model: PaymentMethod, as: 'paymentMethod', attributes: ['code'] },
          { model: ReturnRequest, as: 'returnRequest', required: false }
        ]
      }],
      lock: t.LOCK.UPDATE,
      transaction: t,
    });

    if (!refund) {
      console.log('❌ Không tìm thấy RefundRequest');
      return res.status(404).json({ message: 'Không tìm thấy yêu cầu hoàn tiền' });
    }

    console.log('✅ RefundRequest:', refund.toJSON());
    console.log('✅ Order:', refund.order?.toJSON());
    console.log('✅ PaymentMethod:', refund.order?.paymentMethod?.code);

    if (refund.status === 'refunded') {
      console.log('⚠️ Yêu cầu đã được hoàn tiền trước đó');
      return res.status(400).json({ message: 'Yêu cầu đã được hoàn tiền trước đó' });
    }

    // 2️⃣ Nếu admin chọn trạng thái “refunded” → gọi cổng thanh toán
    if (status === 'refunded') {
      const payCode = refund.order.paymentMethod?.code?.toLowerCase() || '';
      console.log('✅ payCode:', payCode);

      if (['vnpay', 'momo'].includes(payCode)) {
        const payload = {
          orderCode: refund.order.orderCode,
          amount: refund.amount,
        };

        if (payCode === 'momo') {
          console.log('✅ momoTransId:', refund.order.momoTransId);
          if (!refund.order.momoTransId) {
            console.log('❌ Thiếu momoTransId');
            await t.rollback();
            return res.status(400).json({
              message: 'Đơn hàng chưa lưu momoTransId, không thể hoàn tiền tự động',
            });
          }
          payload.momoTransId = refund.order.momoTransId;
        }

// 👇 Thêm vào nếu là VNPay
if (payCode === 'vnpay') {
  if (!refund.order.vnpTransactionId || !refund.order.paymentTime) {
    console.log('❌ Thiếu vnpTransactionId hoặc paymentTime');
    await t.rollback();
    return res.status(400).json({
      message: 'Thiếu thông tin giao dịch VNPay, không thể hoàn tiền',
    });
  }

  payload.vnpTransactionId = refund.order.vnpTransactionId;
  payload.transDate = refund.order.paymentTime;
}

        console.log('🚀 Gọi refundGateway với payload:', payload);

        const { ok, transId } = await refundGateway(payCode, payload);

        console.log('✅ Kết quả refundGateway:', { ok, transId });

        if (!ok) {
          console.log('❌ Hoàn tiền qua cổng thanh toán thất bại');
          await t.rollback();
          return res.status(400).json({ message: 'Hoàn tiền qua cổng thanh toán thất bại' });
        }

        refund.gatewayTransId = transId || null;
      }

      // 3️⃣ Cập nhật Order & ReturnRequest (nếu có)
      refund.order.paymentStatus = 'refunded';
      await refund.order.save({ transaction: t });

      if (refund.order.returnRequest) {
        refund.order.returnRequest.status = 'refunded';
        await refund.order.returnRequest.save({ transaction: t });
      }
    }

    // 4️⃣ Lưu RefundRequest
    refund.status = status;
    refund.responseNote = responseNote || null;
    await refund.save({ transaction: t });

    console.log('✅ RefundRequest updated:', refund.toJSON());

    await t.commit();
    return res.json({ message: 'Cập nhật trạng thái hoàn tiền thành công', data: refund });

  } catch (err) {
    await t.rollback();
    console.error('[updateRefundStatus] ❌ Lỗi:', err);
    return res.status(500).json({ message: 'Lỗi server khi cập nhật hoàn tiền' });
  }
}

// ...

}

module.exports = OrderController;
