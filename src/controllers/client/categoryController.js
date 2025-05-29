const Category = require('../../models/categoryModel');

class CategoryController {
  static async getNestedCategories(req, res) {
    try {
const all = await Category.findAll({
  attributes: ['id', 'name', 'slug', 'parentId', 'thumbnail', 'isActive', 'sortOrder'], // ✅ Thêm 'slug'
  where: {
    isActive: 1,
    deletedAt: null
  },
  order: [['sortOrder', 'ASC']]
});

      const parents = all.filter(cat => !cat.parentId);
      const children = all.filter(cat => cat.parentId);

      const data = parents.map(parent => {
        const sub = children.filter(child => child.parentId === parent.id);
        return {
          ...parent.dataValues,
          children: sub.map(s => s.dataValues)
        };
      });

      res.json(data);
    } catch (err) {
      console.error('Lỗi lấy danh mục:', err);
      res.status(500).json({ message: 'Lỗi server' });
    }
  }

  static async getBySlug(req, res) {
  try {
    const { slug } = req.params;
    const category = await Category.findOne({
      where: { slug, deletedAt: null },
      include: [
        {
          model: Category,
          as: 'parent',
          attributes: ['id', 'name', 'slug']
        }
      ]
    });

    if (!category) {
      return res.status(404).json({ message: 'Không tìm thấy danh mục' });
    }

    res.json(category);
  } catch (err) {
    console.error('❌ Lỗi khi lấy danh mục theo slug:', err);
    res.status(500).json({ message: 'Lỗi server' });
  }
}

}

module.exports = CategoryController;
