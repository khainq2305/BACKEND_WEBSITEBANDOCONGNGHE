const { FlashSale, FlashSaleItem, FlashSaleCategory, Sku, Category,Product } = require('../../models');
const { sequelize } = require('../../models');
const { Op } = require('sequelize');

function buildCategoryTree(flatList, parentId = null) {
  return flatList
    .filter(cat => cat.parentId === parentId)
    .map(cat => ({
      ...cat,
      children: buildCategoryTree(flatList, cat.id)
    }));
}
class FlashSaleController {

 static async list(req, res) {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const result = await FlashSale.findAndCountAll({
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    return res.json({
      count: result.count,
      rows: result.rows
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
}



  static async getById(req, res) {
    try {
      const flashSale = await FlashSale.findByPk(req.params.id, {
        include: [
          {
            model: FlashSaleItem,
            as: 'items',
            include: [{ model: Sku, as: 'sku' }],
          },
          {
            model: FlashSaleCategory,
            as: 'categories',
            include: [{ model: Category, as: 'category' }],
          },
        ],
      });

      if (!flashSale) return res.status(404).json({ message: 'Không tìm thấy' });

      res.json(flashSale);
    } catch (err) {
      console.error('❌ Lỗi getById Flash Sale:', err);
      res.status(500).json({ message: 'Lỗi server' });
    }
  }


  static async create(req, res) {
    const t = await sequelize.transaction();
    try {
      const {
        title,
        bannerUrl,
        startTime,
        endTime,
        slug,
        description,
        isActive,
        items = [],
        categories = [],
      } = req.body;

      const flashSale = await FlashSale.create(
        {
          title,
          bannerUrl,
          startTime,
          endTime,
          slug,
          description,
          isActive,
        },
        { transaction: t }
      );

      if (items.length) {
        const itemData = items.map((item) => ({
          ...item,
          flashSaleId: flashSale.id,
        }));
        await FlashSaleItem.bulkCreate(itemData, { transaction: t });
      }

      if (categories.length) {
        const catData = categories.map((cat) => ({
          ...cat,
          flashSaleId: flashSale.id,
        }));
        await FlashSaleCategory.bulkCreate(catData, { transaction: t });
      }

      await t.commit();
      res.status(201).json({ message: '✅ Tạo thành công', data: flashSale });
    } catch (err) {
      await t.rollback();
      console.error('❌ Lỗi tạo Flash Sale:', err);
      res.status(500).json({ message: 'Lỗi server' });
    }
  }


  static async update(req, res) {
    const t = await sequelize.transaction();
    try {
      const id = req.params.id;
      const flashSale = await FlashSale.findByPk(id);
      if (!flashSale) return res.status(404).json({ message: 'Không tìm thấy' });

      const {
        title,
        bannerUrl,
        startTime,
        endTime,
        slug,
        description,
        isActive,
        items = [],
        categories = [],
      } = req.body;

      await flashSale.update(
        { title, bannerUrl, startTime, endTime, slug, description, isActive },
        { transaction: t }
      );

      // Xoá cũ
      await FlashSaleItem.destroy({ where: { flashSaleId: id }, transaction: t });
      await FlashSaleCategory.destroy({ where: { flashSaleId: id }, transaction: t });

      // Tạo lại
      if (items.length) {
        const itemData = items.map((item) => ({ ...item, flashSaleId: id }));
        await FlashSaleItem.bulkCreate(itemData, { transaction: t });
      }

      if (categories.length) {
        const catData = categories.map((cat) => ({ ...cat, flashSaleId: id }));
        await FlashSaleCategory.bulkCreate(catData, { transaction: t });
      }

      await t.commit();
      res.json({ message: '✅ Cập nhật thành công' });
    } catch (err) {
      await t.rollback();
      console.error('❌ Lỗi cập nhật Flash Sale:', err);
      res.status(500).json({ message: 'Lỗi server' });
    }
  }


  static async delete(req, res) {
    try {
      const flashSale = await FlashSale.findByPk(req.params.id);
      if (!flashSale) return res.status(404).json({ message: 'Không tìm thấy' });

      await flashSale.destroy();
      res.json({ message: '✅ Đã xoá flash sale' });
    } catch (err) {
      console.error('❌ Lỗi xoá Flash Sale:', err);
      res.status(500).json({ message: 'Lỗi server' });
    }
  }

static async getAvailableSkus(req, res) {
  try {
    const skus = await Sku.findAll({
      where: {
        isActive: true,
        deletedAt: null
      },
      include: [
        {
          model: Product,
          as: 'product',
          attributes: ['name'] 
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    const result = skus.map((sku) => ({
      id: sku.id,
      skuCode: sku.skuCode,
      price: sku.price,
      stock: sku.stock,
      label: `${sku.product?.name} - ${sku.skuCode}`
    }));

    res.json(result);
  } catch (err) {
    console.error('Lỗi lấy SKU:', err);
    res.status(500).json({ message: 'Lỗi server khi lấy danh sách SKU' });
  }
}



static async getAvailableCategoriesWithTree(req, res) {
  try {
    const allCategories = await Category.findAll({
      where: {
        deletedAt: null,
        isActive: true,
        isDefault: false
      },
      raw: true,
      order: [['sortOrder', 'ASC']]

    });

    const tree = buildCategoryTree(allCategories);
    return res.json(tree);
  } catch (err) {
    console.error('Lỗi lấy danh mục:', err);
    return res.status(500).json({ message: 'Lỗi server' });
  }
}


}

module.exports = FlashSaleController;
