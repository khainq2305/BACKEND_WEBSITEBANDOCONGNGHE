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
  id: item.categoryId,
  title: item.customTitle || item.category?.name || "Chưa đặt tiêu đề",
  slug: item.slug || item.category?.slug || null,
  imageUrl: item.imageUrl,
  label: item.isHot ? 'hot' : item.isNew ? 'new' : item.isFeatured ? 'featured' : null,
  link: item.customLink || (item.category ? `/category/${item.category.slug}` : '#'),
}));


      return res.json({ success: true, data: result });
    } catch (err) {
      console.error('HighlightedCategoryController Error:', err);
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  }

}

module.exports = HighlightedCategoryController;
