const {
  FlashSale,
  FlashSaleItem,
  Sku,
  Product,
  ProductMedia
} = require('../../models');

const { Sequelize, Op } = require('sequelize'); // ✅ Đảm bảo import Sequelize

class FlashSaleClientController {
  static async getAll(req, res) {
    try {
      const now = new Date(new Date().getTime() + 7 * 60 * 60 * 1000);

      const allActiveSales = await FlashSale.findAll({
        where: {
          isActive: true,
          startTime: { [Op.lte]: now },
          endTime: { [Op.gte]: now }
        },
        include: [
          {
            model: FlashSaleItem,
            as: 'flashSaleItems',
            required: false,
            include: [
              {
                model: Sku,
                as: 'sku',
                attributes: {
  include: [
    'id',
    'skuCode',
    'price',
    'originalPrice',
    'stock',
    // ✅ Tổng đã bán
    [
      Sequelize.literal(`(
        SELECT SUM(oi.quantity)
        FROM orderitems AS oi
        WHERE oi.skuId = \`flashSaleItems->sku\`.\`id\`
      )`),
      'soldCount'
    ],
    // ✅ Trung bình đánh giá
    [
      Sequelize.literal(`(
        SELECT AVG(r.rating)
        FROM reviews AS r
        WHERE r.skuId = \`flashSaleItems->sku\`.\`id\`
      )`),
      'averageRating'
    ]
  ]
}
,
                include: [
                  {
                    model: Product,
                    as: 'product'
                  },
                  {
                    model: ProductMedia,
                    as: 'ProductMedia',
                    required: false,
                    attributes: ['mediaUrl', 'type', 'sortOrder']
                  }
                ]
              }
            ]
          }
        ],
        order: [['startTime', 'ASC']]
      });

      res.json({ data: allActiveSales });
    } catch (err) {
      console.error('Lỗi getAll Flash Sale (client):', err);
      res.status(500).json({ message: 'Lỗi server', error: err.message });
    }
  }
}

module.exports = FlashSaleClientController;
