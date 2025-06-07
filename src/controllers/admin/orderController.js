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
      // 1. Lấy toàn bộ orders kèm quan hệ
      const ordersRaw = await Order.findAll({
        order: [['createdAt', 'DESC']],
        include: [
          {
            model: User,
            attributes: ['id', 'fullName', 'email', 'phone'],
          },
          {
            model: UserAddress,
            as: 'shippingAddress',
            attributes: ['streetAddress', 'fullName', 'phone'],
            include: [
              { model: Province, as: 'province', attributes: ['name'] },
              { model: District, as: 'district', attributes: ['name'] },
              { model: Ward, as: 'ward', attributes: ['name', 'code'] },
            ],
          },
          {
            model: PaymentMethod,
            as: 'paymentMethod',
            attributes: ['name'],
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
                    attributes: ['name'],
                  },
                ],
              },
            ],
          },
        ],
      });

      // 2. Map về đúng dạng front-end mong đợi
      const ordersFormatted = ordersRaw.map((o) => {
        // VD: tạo 1 “order code” tùy ý nếu bạn không có cột code trong DB:
        // (Ví dụ: “DH0001”, “DH0002”, …). Nếu trong table bạn có cột riêng gọi là "code", 
        // thì chỉ cần dùng o.code thay vì tính toán.
        const code =
          o.id < 10
            ? `DH000${o.id}`
            : o.id < 100
            ? `DH00${o.id}`
            : o.id < 1000
            ? `DH0${o.id}`
            : `DH${o.id}`;

        return {
          id: o.id,
          code: code,
          customer: o.User?.fullName || '—',       // tên khách từ quan hệ User
          total: o.totalPrice || 0,                // totalPrice là cột trong DB
          status: o.status,                         // status
          date: o.createdAt.toISOString().split('T')[0], // chỉ lấy yyyy-mm-dd
          
          // Nếu UI cần thêm shippingFee, finalPrice, items, … bạn vẫn có thể kèm vào
          // shippingFee: o.shippingFee,
          // finalPrice: o.finalPrice,
          // paymentMethod: o.paymentMethod?.name,
          // shippingAddress: o.shippingAddress,
          // items: o.items,
        };
      });

      // 3. Trả về JSON
      // Thông thường bạn cũng sẽ muốn đính kèm pagination (nếu có), ví dụ:
      // res.json({ totalItems: ordersFormatted.length, data: ordersFormatted });
      // Ở đây tạm đơn giản chỉ trả mảng.
      res.json({ data: ordersFormatted });
    } catch (error) {
      console.error('Lỗi lấy danh sách đơn hàng:', error);
      res
        .status(500)
        .json({ message: 'Lỗi server khi lấy danh sách đơn hàng' });
    }
  }
}

module.exports = OrderController;
