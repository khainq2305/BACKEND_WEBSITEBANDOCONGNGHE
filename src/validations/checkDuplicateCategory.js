const { Op } = require('sequelize');

const checkDuplicateCategory = (Model) => {
  return async (req, res, next) => {
    try {
      const { name, parentId } = req.body;
      const categoryId = req.params.id;

      if (!name) return res.status(400).json({ message: 'Tên danh mục là bắt buộc' });

      const whereClause = {
        name,
        parentId: parentId || null
      };

      if (categoryId) {
        whereClause.id = { [Op.ne]: categoryId };
      }

      const existing = await Model.findOne({ where: whereClause });

      if (existing) {
        return res.status(400).json({ message: 'Tên danh mục đã tồn tại trong cấp hiện tại' });
      }

      next();
    } catch (err) {
      console.error('❌ MIDDLEWARE checkDuplicateCategory ERROR:', err);
      return res.status(500).json({ message: 'Lỗi khi kiểm tra trùng danh mục' });
    }
  };
};

module.exports = checkDuplicateCategory;
