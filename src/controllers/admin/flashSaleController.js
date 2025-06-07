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
    const { page = 1, limit = 10, tab = 'all' } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = {};
    let paranoid = true;

    if (tab === 'active') {
      whereClause.isActive = true;
      whereClause.deletedAt = null;
    } else if (tab === 'inactive') {
      whereClause.isActive = false;
      whereClause.deletedAt = null;
    } else if (tab === 'trash') {
      whereClause.deletedAt = { [Op.ne]: null };
      paranoid = false;
    }

    const result = await FlashSale.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']],
      paranoid
    });

    // Đếm tổng loại
    const [totalActive, totalInactive, totalTrash] = await Promise.all([
      FlashSale.count({ where: { isActive: true, deletedAt: null } }),
      FlashSale.count({ where: { isActive: false, deletedAt: null } }),
      FlashSale.count({ where: { deletedAt: { [Op.ne]: null } }, paranoid: false })
    ]);

    return res.json({
      count: result.count,
      rows: result.rows,
      totalActive,
      totalInactive,
      totalTrash
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
static async deleteMany(req, res) {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'Danh sách ID không hợp lệ' });
    }

    const deletedCount = await FlashSale.destroy({
      where: {
        id: { [Op.in]: ids }
      }
    });

    return res.json({ message: `Đã xoá ${deletedCount} Flash Sale` });
  } catch (err) {
    console.error('Lỗi xoá nhiều Flash Sale:', err);
    return res.status(500).json({ message: 'Lỗi server' });
  }
}
static async softDelete(req, res) {
  try {
    const flashSale = await FlashSale.findByPk(req.params.id);
    if (!flashSale) return res.status(404).json({ message: 'Không tìm thấy' });

    await flashSale.destroy(); // soft delete
    res.json({ message: '✅ Đã chuyển vào thùng rác' });
  } catch (err) {
    console.error('❌ Lỗi xoá mềm Flash Sale:', err);
    res.status(500).json({ message: 'Lỗi server' });
  }
}
static async softDeleteMany(req, res) {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'Danh sách ID không hợp lệ' });
    }

    await FlashSale.destroy({
      where: { id: { [Op.in]: ids } }
    });

    res.json({ message: `✅ Đã xoá tạm thời ${ids.length} mục` });
  } catch (err) {
    console.error('❌ Lỗi xoá mềm nhiều Flash Sale:', err);
    res.status(500).json({ message: 'Lỗi server' });
  }
}
static async restore(req, res) {
  try {
    const flashSale = await FlashSale.findOne({
      where: { id: req.params.id },
      paranoid: false
    });

    if (!flashSale || !flashSale.deletedAt) {
      return res.status(404).json({ message: 'Không tìm thấy hoặc không bị xoá' });
    }

    await flashSale.restore();
    res.json({ message: '✅ Đã khôi phục' });
  } catch (err) {
    console.error('❌ Lỗi khôi phục Flash Sale:', err);
    res.status(500).json({ message: 'Lỗi server' });
  }
}
static async restoreMany(req, res) {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'Danh sách ID không hợp lệ' });
    }

    const list = await FlashSale.findAll({
      where: {
        id: { [Op.in]: ids },
        deletedAt: { [Op.not]: null }
      },
      paranoid: false
    });

    for (const flashSale of list) {
      await flashSale.restore();
    }

    res.json({ message: `✅ Đã khôi phục ${list.length} mục` });
  } catch (err) {
    console.error('❌ Lỗi khôi phục nhiều Flash Sale:', err);
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
