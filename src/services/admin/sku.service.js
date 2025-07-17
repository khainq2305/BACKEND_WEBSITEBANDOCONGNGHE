// services/sku.service.js

const { Sku, Product, Category, StockLog, sequelize, User, Role } = require("../../models/index")
const { Op } = require('sequelize');
class SkuService {
  static async getAllSkus({ limit, offset, search, categoryId, status }) {
  const filters = {};

  // Lọc theo tên sản phẩm
  if (search) {
    filters['$product.name$'] = {
      [Op.iLike]: `%${search}%`
    };
  }

  // Lọc theo danh mục sản phẩm
  if (categoryId) {
    filters['$product.category.id$'] = categoryId;
  }

  // Lọc theo trạng thái tồn kho
  if (status === 'out-of-stock') {
    filters.stock = 0;
  } else if (status === 'low-stock') {
    filters.stock = { [Op.gt]: 0, [Op.lte]: 10 };
  } else if (status === 'in-stock') {
    filters.stock = { [Op.gt]: 10 };
  }

  return await Sku.findAndCountAll({
    where: filters,
    limit,
    offset,
    include: [
      {
        model: Product,
        as: 'product',
        attributes: ['id', 'name', 'thumbnail'],
        include: [
          {
            model: Category,
            as: 'category',
            attributes: ['id', 'name']
          }
        ]
      }
    ],
    order: [['createdAt', 'DESC']]
  });
}


  static async getSkuById(id) {
    const sku = await Sku.findByPk(id);
    if (!sku) throw new Error('SKU not found');
    return sku;
  }

  static async createSku(data) {
    return await Sku.create(data);
  }

  static async updateSku(id, data) {
    const t = await sequelize.transaction();
    try {
      const sku = await Sku.findByPk(id, { transaction: t });
      if (!sku) throw new Error('SKU not found');

      const updates = {};

      if (typeof data.stock === 'number' && data.stock !== sku.stock) {
        const stockBefore = sku.stock;
        const stockAfter = data.stock;

        updates.stock = stockAfter;

        await StockLog.create({
          skuId: id,
          type: stockAfter > stockBefore ? 'import' : 'export',
          quantity: Math.abs(stockAfter - stockBefore),
          price: data.price || null,
          stockBefore,
          stockAfter,
          description: data.description || 'Điều chỉnh tồn kho',
          reference: data.reference || `ADJUST-${Date.now()}`,
          userId: data.userId || null
        }, { transaction: t });
      }

      Object.keys(data).forEach(key => {
        if (!['stock', 'description', 'reference', 'userId', 'price'].includes(key)) {
          updates[key] = data[key];
        }
      });

      await sku.update(updates, { transaction: t });
      await t.commit();

      return sku;
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }

  static async adjustStock(id, type, data) {
    const t = await sequelize.transaction();
    try {
      const sku = await Sku.findByPk(id, { transaction: t });
      if (!sku) throw new Error('SKU not found');

      const quantity = Number(data.quantity);
      const stockBefore = sku.stock;
      const stockAfter = type === 'import'
        ? stockBefore + quantity
        : stockBefore - quantity;

      if (stockAfter < 0) throw new Error('Tồn kho không đủ để xuất');

      // Cập nhật tồn kho
      sku.stock = stockAfter;
      await sku.save({ transaction: t });

      // Tạo log
      await StockLog.create({
        skuId: id,
        type,
        quantity,
        price: data.price || null,
        stockBefore,
        stockAfter,
        description: data.description || `${type === 'import' ? 'Nhập' : 'Xuất'} kho`,
        reference: data.reference || `${type.toUpperCase()}-${Date.now()}`,
        userId: data.userId || null
      }, { transaction: t });

      await t.commit();
      return sku;

    } catch (err) {
      await t.rollback();
      throw err;
    }
  }

  static async getLogsBySkuId(skuId, type) {
    const where = { skuId };

  if (type && type !== 'all') {
    where.type = type;
  } else {
    // Nếu không truyền type, vẫn giữ ['import','export'] nếu bạn muốn an toàn
    where.type = ['import', 'export'];
  }
    return await StockLog.findAll({
      where,
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
      order: [['createdAt', 'DESC']],
    });
  }

}

module.exports = SkuService;
