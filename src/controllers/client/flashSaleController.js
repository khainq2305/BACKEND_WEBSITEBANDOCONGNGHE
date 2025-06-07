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

 
      
      if (allActiveSales.length > 0) {
      }
  


allActiveSales.forEach(s => {
  console.log(`ID: ${s.id} | ${s.startTime?.toISOString()} → ${s.endTime?.toISOString()}`);
});

      res.json({ data: allActiveSales });

    } catch (err) {
      console.error('Lỗi getAll Flash Sale (client):', err);
      res.status(500).json({ message: 'Lỗi server', error: err.message });
    }
  }
}

module.exports = FlashSaleClientController;
