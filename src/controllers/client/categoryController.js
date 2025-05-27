const Category = require('../../models/categoryModel');

class CategoryController {
  static async getNestedCategories(req, res) {
    try {
      const all = await Category.findAll({
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
      console.error('❌ Lỗi lấy danh mục:', err);
      res.status(500).json({ message: '⚠️ Lỗi server' });
    }
  }
}

module.exports = CategoryController;
