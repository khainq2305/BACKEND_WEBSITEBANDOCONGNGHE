const { HighlightedCategoryItem, Category } = require('../../models');
const { Op } = require('sequelize');

class HighlightedCategoryController {
  static async list(req, res) {
    try {
      const items = await HighlightedCategoryItem.findAll({
        where: {
          isActive: true,
 
        },
        include: [
          {
            model: Category,
            as: 'category',
            attributes: ['id', 'name', 'slug']
          }
        ],
        order: [['sortOrder', 'ASC']]
      });

      const result = items.map(item => ({
        id: item.category?.id,
        name: item.category?.name,
        slug: item.category?.slug,
        imageUrl: item.imageUrl
      }));

      return res.json({ success: true, data: result });
    } catch (err) {
      console.error('❌ HighlightedCategoryController Error:', err);
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  }
}

module.exports = HighlightedCategoryController;
