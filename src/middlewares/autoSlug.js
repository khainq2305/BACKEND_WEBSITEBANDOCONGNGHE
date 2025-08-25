const { Op } = require('sequelize');

const toSlug = (str) => {
  return str
    .toLowerCase()
    .normalize('NFD')                  // tách dấu
    .replace(/[\u0300-\u036f]/g, '')   // loại bỏ dấu
    .replace(/đ/g, 'd')                // đổi đ → d
    .replace(/[^a-z0-9\s-]/g, '')      // loại bỏ ký tự đặc biệt
    .trim()
    .replace(/\s+/g, '-');             // khoảng trắng → -
};

const autoSlug = (Model) => {
  return async (req, res, next) => {
    try {
      const name = req.body.name || req.body.title;
      if (!name) return res.status(400).json({ message: 'Thiếu tên hoặc tiêu đề để tạo slug' });

      const id = req.params.id; 
      let baseSlug = toSlug(name);
      let slug = baseSlug;
      let count = 1;

      while (
        await Model.findOne({
          where: {
            slug,
            ...(id && { id: { [Op.ne]: id } })
          }
        })
      ) {
        slug = `${baseSlug}-${count++}`;
      }

      req.body.slug = slug;
      next();
    } catch (err) {
      console.error('generateUniqueSlug ERROR:', err);
      return res.status(500).json({ message: 'Lỗi khi tạo slug' });
    }
  };
};

module.exports = autoSlug;
