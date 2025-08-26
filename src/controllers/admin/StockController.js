const { StockLog, Sku, Product, User, Role } = require('../../models');

const StockLogController = {
  // ✅ Lấy lịch sử theo SKU ID
  async getBySkuId(req, res) {
    try {
      const { skuId } = req.params;

      const logs = await StockLog.findAll({
        where: { skuId },
        include: [
  {
    model: Sku,
    as: 'sku',
    attributes: ['id', 'skuCode', 'stock'],
    include: [
      {
        model: Product,
        as: 'product',
        attributes: ['id', 'name']
      }
    ]
  },
  {
    model: User,
    as: 'user', // phải trùng alias
    attributes: ['id', 'fullName'],
    include: [
      {
        model: Role,
        as: 'roles',
        attributes: ['id', 'name']
      }
    ]
  }
],
        order: [['createdAt', 'DESC']]
      });

      res.json({ data: logs });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server Error' });
    }
  },

  // ✅ Lấy tất cả log (tuỳ ý)
  async getAll(req, res) {
    try {
      const logs = await StockLog.findAll({
        include: [
          {
            model: Sku,
            as: 'sku',
            attributes: ['id', 'skuCode'],
            include: [
              {
                model: Product,
                as: 'product',
                attributes: ['id', 'name']
              }
            ]
          }
        ],
        order: [['createdAt', 'DESC']]
      });

      res.json({ data: logs });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server Error' });
    }
  },

  // ✅ Tạo log mới (khi nhập kho / xuất kho)
  async create(req, res) {
 
    try {
      const {
        skuId,
        type,
        quantity,
        stockBefore,
        stockAfter,
        description,
        reference,
        userId
      } = req.body;

      // Tạo log
      const log = await StockLog.create({
        skuId,
        type,
        quantity,
        stockBefore,
        stockAfter,
        description,
        reference,
        userId
      });
      await Sku.update(
  { stock: stockAfter },  // Giá trị mới
  { where: { id: skuId } }  // SKU nào
);
      res.status(201).json({ data: log });
    } catch (err) {
      console.error(err);
      res.status(400).json({ error: 'Bad Request' });
    }
  },

  // ✅ (Tùy chọn) Xoá log
  async delete(req, res) {
    try {
      const { id } = req.params;

      const deleted = await StockLog.destroy({ where: { id } });

      if (deleted) {
        res.json({ message: 'Deleted successfully' });
      } else {
        res.status(404).json({ error: 'Log not found' });
      }
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server Error' });
    }
  },

  // ✅ (Tùy chọn) Update log
  async update(req, res) {
    try {
      const { id } = req.params;
      const updated = await StockLog.update(req.body, {
        where: { id }
      });

      if (updated[0]) {
        res.json({ message: 'Updated successfully' });
      } else {
        res.status(404).json({ error: 'Log not found' });
      }
    } catch (err) {
      console.error(err);
      res.status(400).json({ error: 'Bad Request' });
    }
  }
};

module.exports = StockLogController;
