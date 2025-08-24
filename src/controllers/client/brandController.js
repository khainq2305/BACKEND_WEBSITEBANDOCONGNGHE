const { Brand, Product, Category } = require('../../models');
const { Op } = require('sequelize');

class BrandController {
  static async getAll(req, res) {
  try {
    const { categoryId } = req.query;

    if (categoryId) {
      const parent = await Category.findOne({
        where: { id: categoryId, isActive: 1, deletedAt: null },
      });

      if (!parent) return res.status(200).json([]);

      const allCategories = await Category.findAll({
        where: { isActive: 1, deletedAt: null },
        attributes: ['id', 'parentId'],
      });

      const subCategoryIds = allCategories
        .filter(cat => cat.parentId === parent.id)
        .map(cat => cat.id);

      const categoryIds = [parent.id, ...subCategoryIds];

      const brands = await Brand.findAll({
        attributes: ['id', 'name', 'slug', 'logoUrl'],
        where: { isActive: 1, deletedAt: null },
        include: [{
          model: Product,
          as: 'products',
          attributes: [],
          required: true,
          where: {
            categoryId: { [Op.in]: categoryIds },
            isActive: 1,
            deletedAt: null,
          },
        }],
        group: ['Brand.id'],
        order: [['name', 'ASC']],
      });

      return res.status(200).json(brands);
    }

    const allBrands = await Brand.findAll({
      where: { isActive: 1, deletedAt: null },
      order: [['orderIndex', 'ASC']],
      attributes: ['id', 'name', 'slug', 'logoUrl'],
    });

    return res.status(200).json(allBrands);
  } catch (error) {
    console.error('❌ Lỗi khi lấy danh sách thương hiệu:', error);
    return res.status(500).json({ message: 'Lỗi server' });
  }
}

}

module.exports = BrandController;
