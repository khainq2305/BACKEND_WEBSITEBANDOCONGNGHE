// src/controllers/admin/orderController.js

const {
  Order,
  User,
  UserAddress,
  Province,
  District,
  Ward,
  PaymentMethod,
  OrderItem,
  Sku,
  Product
} = require('../../models');

class OrderController {
  static async getAll(req, res) {
  try {
    const { page = 1, limit = 10, search = '', status = '' } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = {};
    if (status) {
      whereClause.status = status;
    }

    const includeClause = [
      {
        model: User,
        attributes: ['id', 'fullName', 'email', 'phone'],
        where: search
          ? {
              fullName: { [Op.like]: `%${search}%` }
            }
          : undefined
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

    // Nếu search là mã đơn thì tìm theo orderCode
    if (search) {
      whereClause[Op.or] = [
        { orderCode: { [Op.like]: `%${search}%` } }
      ];
    }

    const { count, rows } = await Order.findAndCountAll({
      where: whereClause,
      include: includeClause,
      order: [['createdAt', 'DESC']],
      offset: parseInt(offset),
      limit: parseInt(limit)
    });

    const formattedOrders = rows.map((o) => ({
      id: o.id,
      code: o.orderCode, // ✅ dùng đúng từ DB
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
}

module.exports = OrderController;
