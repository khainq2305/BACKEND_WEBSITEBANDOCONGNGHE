const slugify = require('slugify');
const { Op } = require('sequelize');

const autoSlug = (Model) => {
  return async (req, res, next) => {
    try {
      console.log('daadxx gọi rebbory', req.body)
      const name = req.body.name || req.body.title;
      if (!name) return res.status(400).json({ message: 'Thiếu tên hoặc tiêu đề để tạo slug' });

      const id = req.params.id; 

      let baseSlug = slugify(name, { lower: true, strict: true });
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
      console.error('generateUniqueSlug ERROR:', err.response);
      return res.status(500).json({ message: 'Lỗi khi tạo slug' });
    }
  };
};

module.exports = autoSlug;
