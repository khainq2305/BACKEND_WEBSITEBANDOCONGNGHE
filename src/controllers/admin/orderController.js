// src/controllers/admin/orderController.js

const {
  Order,
  User,
  UserAddress,
  Province,
  ReturnRequest,
  RefundRequest,
  District,
  Ward,
  PaymentMethod,
  OrderItem,
  Sku,
  Product
} = require('../../models');
const { Sequelize, Op } = require('sequelize');


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
          { model: Ward, as: 'ward', attributes: ['name', 'code'] }
        ]
      },
      {
        model: PaymentMethod,
        as: 'paymentMethod',
        attributes: ['name']
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
      id: o.id,
      code: o.orderCode,
      customer: o.User?.fullName || '—',
      total: o.totalPrice || 0,
      status: o.status,
      createdAt: o.createdAt
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
              { model: Ward, as: 'ward', attributes: ['name', 'code'] }
            ]
          },
          {
            model: PaymentMethod,
            as: 'paymentMethod',
            attributes: ['id', 'name']
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
static async cancelOrder(req, res) {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim() === '') {
      return res.status(400).json({ message: 'Lý do huỷ đơn không được bỏ trống' });
    }

    const order = await Order.findByPk(id);

    if (!order) {
      return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
    }

    if (order.status === 'cancelled') {
      return res.status(400).json({ message: 'Đơn hàng đã huỷ rồi' });
    }

    if (order.status === 'delivered' || order.status === 'completed') {
      return res.status(400).json({ message: 'Không thể huỷ đơn đã giao hoặc đã hoàn thành' });
    }

    order.status = 'cancelled';
    order.cancelReason = reason;
    await order.save();

    return res.json({ message: 'Huỷ đơn hàng thành công', orderId: order.id });
  } catch (error) {
    console.error('Lỗi khi huỷ đơn hàng:', error);
    return res.status(500).json({ message: 'Lỗi server khi huỷ đơn hàng' });
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

    // ❌ Không được cập nhật trạng thái nếu giống nhau
    if (order.status === status) {
      return res.status(400).json({ message: 'Đơn hàng đã ở trạng thái này' });
    }

    // ❌ Không được cập nhật nếu đơn đã huỷ
    if (order.status === 'cancelled') {
      return res.status(400).json({ message: 'Đơn hàng đã huỷ và không thể cập nhật nữa' });
    }

    // ❌ Không được chuyển về trạng thái trước đó (ví dụ: từ "đang giao" về "xác nhận")
    const validFlow = ['pending', 'confirmed', 'shipping', 'delivered', 'completed'];
    const fromIndex = validFlow.indexOf(order.status);
    const toIndex = validFlow.indexOf(status);

    if (fromIndex !== -1 && toIndex !== -1 && toIndex < fromIndex) {
      return res.status(400).json({ message: 'Không thể quay lại trạng thái trước đó' });
    }

    order.status = status;
    await order.save();

    return res.json({ message: 'Cập nhật trạng thái thành công', status: order.status });
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
  try {
    const { id } = req.params;
    const { status, responseNote } = req.body;

    const request = await ReturnRequest.findByPk(id);
    if (!request) return res.status(404).json({ message: 'Không tìm thấy yêu cầu' });

    request.status = status;
    request.responseNote = responseNote;
    await request.save();

    return res.json({ message: 'Cập nhật trạng thái trả hàng thành công' });
  } catch (error) {
    console.error('Lỗi cập nhật trạng thái trả hàng:', error);
    return res.status(500).json({ message: 'Lỗi server' });
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
  try {
    const { id } = req.params;
    const { status, responseNote } = req.body;

    const refund = await RefundRequest.findByPk(id);
    if (!refund) return res.status(404).json({ message: 'Không tìm thấy yêu cầu hoàn tiền' });

    refund.status = status;
    refund.responseNote = responseNote;
    await refund.save();

    return res.json({ message: 'Cập nhật trạng thái hoàn tiền thành công' });
  } catch (error) {
    console.error('Lỗi cập nhật trạng thái hoàn tiền:', error);
    return res.status(500).json({ message: 'Lỗi server' });
  }
}

}

module.exports = OrderController;
