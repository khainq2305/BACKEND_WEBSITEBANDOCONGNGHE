const {
  ReturnRequest,
  RefundRequest,
  Order,
  OrderItem,
  Sku,
  FlashSaleItem,
  Product,
  ReturnRequestItem ,
  ShippingProvider,
  PaymentMethod,
  sequelize
} = require('../../models');

const refundGateway = require('../../utils/refundGateway');
const calculateRefundAmount = require('../../utils/calculateRefundAmount');

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

class ReturnController {
  static async getReturnByOrder(req, res) {
  try {
    const { orderId } = req.params;

    const whereClause = orderId && Number(orderId) !== 0 ? { orderId } : {};

    const requests = await ReturnRequest.findAll({
      where: whereClause,
      include: [{ model: Order, as: 'order' }],
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

    console.log(`[updateReturnStatus] 🛠 ID: ${id} | New status:`, req.body);

    const request = await ReturnRequest.findByPk(id, {
      include: {
        model: Order,
        as: 'order',
        include: {
          model: OrderItem,
          as: 'items',
          include: {
            model: Sku,
            include: {
              model: FlashSaleItem,
              as: 'flashSaleSkus',
              required: false,
            }
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

    console.log(`[updateReturnStatus] ✅ Trạng thái hiện tại: ${request.status}`);

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
      return res.status(400).json({ message: `Không thể chuyển trạng thái từ "${request.status}" → "${status}"` });
    }

    if (request.status === 'pending' && status === 'approved') {
      const deadline = new Date();
      deadline.setDate(deadline.getDate() + 1);
      request.deadlineChooseReturnMethod = deadline;
    }

    if (status === 'received') {
      console.log('[updateReturnStatus] 🏬 Trả hàng → hoàn kho');
      await returnStock(request.order.items, t);

      console.log('[updateReturnStatus] 💸 Tạo yêu cầu hoàn tiền');
      await RefundRequest.create({
        orderId: request.orderId,
        userId: request.order.userId,
        amount: request.order.finalPrice,
        reason: 'Hoàn tiền thủ công',
        status: 'pending'
      }, { transaction: t });
    }

    request.status = status;
    request.responseNote = responseNote;

    console.log('[🧾 BEFORE SAVE]', request.toJSON());

    await request.save({ transaction: t });

    console.log('[💾 AFTER SAVE]', request.toJSON());

    await t.commit();

    console.log('[✅ COMMIT DONE]');
    return res.json({ message: 'Cập nhật trạng thái trả hàng thành công', data: request });
  } catch (err) {
    await t.rollback();
    console.error('[❌ updateReturnStatus ERROR]', err.message);
    console.error(err.stack);
    return res.status(500).json({ message: 'Lỗi server khi cập nhật trạng thái' });
  }
}
static async getReturnDetail(req, res) {
  try {
    const { id } = req.params;

    const request = await ReturnRequest.findByPk(id, {
      include: [
        {
          model: Order,
          as: 'order',
          include: [
            {
              model: OrderItem,
              as: 'items',
              include: [
                {
                  model: Sku,
                  include: [
                    {
                      model: FlashSaleItem,
                      as: 'flashSaleSkus',
                      required: false
                    },
                    {
                      model: Product,
                      as: 'product'
                    }
                  ]
                }
              ]
            },
            {
              model: PaymentMethod,
              as: 'paymentMethod',
              attributes: ['code']
            },
            {
              model: ShippingProvider,
              as: 'shippingProvider',
              attributes: ['name']
            }
          ]
        },
        {
          model: ReturnRequestItem,
          as: 'items',
          include: [
            {
              model: Sku,
              as:'sku',
              include: [
                {
                  model: Product,
                  as: 'product'
                }
              ]
            }
          ]
        },
        {
          model: RefundRequest,
          as: 'refundRequest',
          required: false
        }
      ]
    });

    if (!request) {
      return res.status(404).json({ message: 'Không tìm thấy yêu cầu trả hàng' });
    }

  const refundAmount = calculateRefundAmount(request);


    return res.json({ data: { ...request.toJSON(), refundAmount } });

  } catch (error) {
    console.error('[getReturnDetail]', error);
    return res.status(500).json({ message: 'Lỗi server khi lấy chi tiết trả hàng' });
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

static async updateRefundStatus(req, res) {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { status, responseNote } = req.body;

    const refund = await RefundRequest.findByPk(id, {
      include: [
        {
          model: Order,
          as: 'order',
          include: [
            { model: PaymentMethod, as: 'paymentMethod', attributes: ['code'] },
            { model: ReturnRequest, as: 'returnRequest', required: false }
          ]
        }
      ],
      lock: t.LOCK.UPDATE,
      transaction: t
    });

    if (!refund || refund.status === 'refunded') {
      await t.rollback();
      return res.status(400).json({ message: 'Yêu cầu hoàn tiền không hợp lệ' });
    }

    // Nếu admin xác nhận đã hoàn tiền
    if (status === 'refunded') {
      const payCode = refund.order.paymentMethod?.code?.toLowerCase();
      const payload = {
        orderCode: refund.order.orderCode,
        amount: refund.amount,
      };

      if (payCode === 'momo') {
        if (!refund.order.momoTransId) {
          await t.rollback();
          return res.status(400).json({ message: 'Thiếu momoTransId' });
        }
        payload.momoTransId = refund.order.momoTransId;
      }

      if (payCode === 'vnpay') {
        if (!refund.order.vnpTransactionId || !refund.order.paymentTime) {
          await t.rollback();
          return res.status(400).json({ message: 'Thiếu thông tin VNPay' });
        }

        const formatDateToVnp = (date) => {
          const pad = (n) => n.toString().padStart(2, '0');
          const yyyy = date.getFullYear();
          const MM = pad(date.getMonth() + 1);
          const dd = pad(date.getDate());
          const HH = pad(date.getHours());
          const mm = pad(date.getMinutes());
          const ss = pad(date.getSeconds());
          return `${yyyy}${MM}${dd}${HH}${mm}${ss}`;
        };

        payload.vnpTransactionId = refund.order.vnpTransactionId;
        payload.transDate = formatDateToVnp(new Date(refund.order.paymentTime));
      }

      if (payCode === 'zalopay') {
        if (!refund.order.zp_trans_id || !refund.order.app_trans_id) {
          await t.rollback();
          return res.status(400).json({ message: 'Thiếu thông tin ZaloPay' });
        }
        payload.zp_trans_id = refund.order.zp_trans_id;
        payload.app_trans_id = refund.order.app_trans_id;
      }

      if (payCode === 'stripe') {
        if (!refund.order.stripePaymentIntentId) {
          await t.rollback();
          return res.status(400).json({ message: 'Thiếu stripePaymentIntentId' });
        }
        payload.stripePaymentIntentId = refund.order.stripePaymentIntentId;
      }

      // Gọi gateway để thực hiện hoàn tiền
      const { ok, transId, rawResp } = await refundGateway(payCode, payload);
      if (!ok) {
        await t.rollback();
        console.error('[❌ Refund Fail]', rawResp);
        return res.status(400).json({ message: 'Hoàn tiền thất bại', error: rawResp });
      }

      console.log('[✅ Refund Success]', rawResp);

      // ✅ Hoàn tiền thành công
      refund.gatewayTransId = transId || null;
      refund.order.paymentStatus = 'refunded';
      await refund.order.save({ transaction: t });

      if (refund.order.returnRequest) {
        refund.order.returnRequest.status = 'refunded';
        await refund.order.returnRequest.save({ transaction: t });
      }
    }

    refund.status = status;
    refund.responseNote = responseNote || null;
    await refund.save({ transaction: t });

    await t.commit();
    return res.json({
      message: 'Cập nhật trạng thái hoàn tiền thành công',
      data: refund
    });

  } catch (err) {
    await t.rollback();
    console.error('[updateRefundStatus]', err);
    return res.status(500).json({ message: 'Lỗi server khi cập nhật hoàn tiền' });
  }
}


}

module.exports = ReturnController;
