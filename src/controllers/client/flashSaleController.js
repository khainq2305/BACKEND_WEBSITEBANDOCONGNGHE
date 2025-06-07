const {
  FlashSale,
  FlashSaleItem,
  Sku,
  Product
} = require('../../models');
const { Op } = require('sequelize');

class FlashSaleClientController {
  static async getAll(req, res) {
    try {
     const now = new Date(new Date().getTime() + 7 * 60 * 60 * 1000); // cộng thêm 7 tiếng


      // ✅ Lọc sale đang diễn ra bằng Sequelize
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
                include: [
                  {
                    model: Product,
                    as: 'product',
                  }
                ]
              }
            ]
          }
        ],
        order: [['startTime', 'ASC']]
      });

      // ✅ Debug log
      console.log('🟢 Số lượng flash sale hợp lệ:', allActiveSales.length);
      if (allActiveSales.length > 0) {
        console.log('🟢 Flash sale đầu tiên:', JSON.stringify(allActiveSales[0], null, 2));
      }
      console.log('🕒 now =', now.toISOString());

console.log('🟡 Sale time check >>>');
allActiveSales.forEach(s => {
  console.log(`ID: ${s.id} | ${s.startTime?.toISOString()} → ${s.endTime?.toISOString()}`);
});

      res.json({ data: allActiveSales });

    } catch (err) {
      console.error('❌ Lỗi getAll Flash Sale (client):', err);
      res.status(500).json({ message: 'Lỗi server', error: err.message });
    }
  }
}

module.exports = FlashSaleClientController;
