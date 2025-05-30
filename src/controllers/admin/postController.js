const { Op } = require('sequelize');
const { Post, Category, User } = require('../../models');

class PostController {
ư
  static async create(req, res) {
    try {
      console.log('📦 Dữ liệu nhận:', req.body);
      const {
        title,
        content,
        category,
        authorId = 1,
        status = 0,
        orderIndex = 0,
        publishAt,
        slug,
        isFeature
      } = req.body;

      if (!title || !content || !category || !authorId) {
        return res.status(400).json({ message: 'Thiếu trường bắt buộc' });
      }

      const newPost = await Post.create({
        title,
        content,
        categoryId: category,
        authorId,
        orderIndex,
        publishAt: publishAt ? new Date(publishAt) : null,
        status: parseInt(status, 10),
        slug,
        isFeature
      });

      return res.status(201).json({ message: 'Tạo bài viết thành công', data: newPost });
    } catch (error) {
      console.error('CREATE POST ERROR:', error);
      return res.status(500).json({ message: 'Lỗi server khi tạo bài viết' });
    }
  }

  // [READ] Lấy danh sách bài viết
  static async getAll(req, res) {
  try {
  
    const {
      title,
      content,
      thumbnail,
      categoryId = 1,
      authorId = 39,
      status = 'draft',
      orderIndex = 0,
      publishAt
    } = req.body;

    if (!title || !content || !categoryId || !authorId) {
      return res.status(400).json({ message: 'Thiếu trường bắt buộc' });
    }

    if (categoryId) {
      whereClause.categoryId = parseInt(categoryId, 10);
    }
    console.log(status)
    if (status === 'trash') {
  whereClause.deletedAt = { [Op.not]: null };
} else {
  whereClause.deletedAt = null;

  if (status === 'published') {
    whereClause.status = 1;
  } else if (status === 'draft') {
    whereClause.status = 0;
  }
}

    const { count, rows } = await Post.findAndCountAll({
  where: whereClause,
  limit,
  offset,
  include: [
    {
      model: Category,
      as: 'category', // 👈 đúng alias
      attributes: ['id', 'name']
    },
    {
      model: User,
      attributes: ['id', 'fullName']
    }
  ],
  paranoid: false,
  order: [['createdAt', 'DESC']]
});


    return res.status(201).json({ message: 'Tạo bài viết thành công', data: newPost });
  } catch (error) {
    console.error('CREATE POST ERROR:', error);
    return res.status(500).json({ message: 'Lỗi server khi tạo bài viết' });
  }
}




  static async getAll(req, res) {

    try {

      const posts = await Post.findAll({
  include: [
    { model: Category, attributes: ['id', 'name'] },
    { model: User, attributes: ['id', 'fullName'] }
  ],
  paranoid: false 
});


      return res.json({ data: posts });
    } catch (error) {
      console.error('GET POSTS ERROR:', error);
      return res.status(500).json({ message: 'Lỗi server khi lấy danh sách bài viết' });
    }
  }

  
  static async getById(req, res) {
    try {
      const { id } = req.params;
      const post = await Post.findByPk(id);
      if (!post) return res.status(404).json({ message: 'Không tìm thấy bài viết' });
      return res.json({ data: post });
    } catch (error) {
      console.error('GET POST BY ID ERROR:', error);
      return res.status(500).json({ message: 'Lỗi server khi lấy bài viết' });
    }
  }

  // [UPDATE] Cập nhật bài viết
  static async update(req, res) {
    try {
      const { id } = req.params;
      const post = await Post.findByPk(id);
      if (!post) return res.status(404).json({ message: 'Không tìm thấy bài viết' });

      if (!post) {
        return res.status(404).json({ message: 'Không tìm thấy bài viết' });
      }

      const { title, content, categoryId, authorId, status, orderIndex, publishAt, isFeature } = req.body;

      await post.update({
        title,
        content,
        categoryId,
        authorId,
        status,
        orderIndex,
        publishAt: publishAt ? new Date(publishAt) : null,
        isFeature
      });

      return res.json({ message: 'Cập nhật thành công', data: post });
    } catch (error) {
      console.error('UPDATE POST ERROR:', error);
      return res.status(500).json({ message: 'Lỗi server khi cập nhật bài viết' });
    }
  }
  // [SOFT DELETE] Xoá mềm bài viết
static async softDelete(req, res) {
  try {
    console.log('=== Đã vào BE softDelete ===');
console.log('Body:', req.body);

    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'Danh sách ID không hợp lệ' });
    }

    const posts = await Post.findAll({
      where: { id: ids }
    });

    const existingIds = posts.map(p => p.id);
    const notFound = ids.filter(id => !existingIds.includes(id));

    // Xoá mềm các bài viết tìm được
    await Post.destroy({
      where: { id: existingIds }
    });

    return res.json({
      message: `Đã đưa ${existingIds.length} bài viết vào thùng rác`,
      trashed: existingIds,
      notFound
    });
  } catch (error) {
    console.error('SOFT DELETE ERROR:', error);
    return res.status(500).json({ message: 'Lỗi server khi xóa mềm bài viết' });
  }
}


  
  static async forceDelete(req, res) {
  try {
  
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'Danh sách ID không hợp lệ' });
    }

    const deletedCount = await Post.destroy({
      where: { id: ids },
      force: true 
    });

    return res.json({
      message: `Đã xóa vĩnh viễn ${deletedCount} bài viết`,
      deleted: ids
    });
  } catch (error) {
    console.error('FORCE DELETE ERROR:', error);
    return res.status(500).json({ message: 'Lỗi server khi xóa vĩnh viễn' });
  }
}

  static async restore(req, res) {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'Vui lòng truyền danh sách ID hợp lệ' });
    }

    
    const posts = await Post.findAll({
      where: { id: ids },
      paranoid: false
    });

    const existingIds = posts.map(p => p.id);
    const notFound = ids.filter(id => !existingIds.includes(id));

 
    const toRestore = posts.filter(p => p.deletedAt !== null).map(p => p.id);
    const notTrashed = posts.filter(p => p.deletedAt === null).map(p => p.id);


    await Post.restore({
      where: { id: toRestore }
    });

    return res.json({
      message: `Đã khôi phục ${toRestore.length} bài viết`,
      restored: toRestore,
      notTrashed,
      notFound
    });
  } catch (err) {
    console.error('Lỗi khi khôi phục:', err);
    return res.status(500).json({ message: 'Lỗi server' });
  }
}

}

module.exports = PostController;
