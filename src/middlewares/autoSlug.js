const slugify = require('slugify');
const { Op } = require('sequelize');

const autoSlug = (Model) => {
  return async (req, res, next) => {
    try {
      const name = req.body.name || req.body.title; // 👈 Ưu tiên name, fallback title
      if (!name) return res.status(400).json({ message: 'Thiếu tên hoặc tiêu đề để tạo slug' });

      const id = req.params.id; // nếu là update thì cần loại trừ chính nó

      let baseSlug = slugify(name, { lower: true, strict: true });
      let slug = baseSlug;
      let count = 1;

      while (
        await Model.findOne({
          where: {
            slug,
            ...(id && { id: { [Op.ne]: id } }) // loại trừ chính nó nếu đang update
          }
        })
      ) {
        slug = `${baseSlug}-${count++}`;
      }

      req.body.slug = slug; // gắn vào request để controller nhận
      next();
    } catch (err) {
      console.error('❌ generateUniqueSlug ERROR:', err);
      return res.status(500).json({ message: 'Lỗi khi tạo slug' });
    }
  };
};

module.exports = autoSlug;
