const slugify = require('../utils/slugify');
const seoSlugify = require('../utils/seoSlugify');
const { Op } = require('sequelize');

const autoSlug = (Model) => {
  return async (req, res, next) => {
    try {
      console.log('daadxx gọi rebbory', req.body)
      const name = req.body.name || req.body.title;
      if (!name) return res.status(400).json({ message: 'Thiếu tên hoặc tiêu đề để tạo slug' });

      const id = req.params.id; 

      // Use seoSlugify for Post model to maintain consistency with frontend
      // Use regular slugify for other models (Brand, Category, etc.)
      const isPostModel = Model.name === 'Post' || Model.tableName === 'posts';
      let baseSlug = isPostModel ? seoSlugify(name) : slugify(name);
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
