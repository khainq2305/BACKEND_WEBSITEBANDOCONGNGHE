const { Post, Category, User } = require('../../models'); // ✅ GIỜ mới đúng 100%
const { Sequelize } = require('sequelize');

class CategoryController {
  // [CREATE] Thêm bài viết
  static async create(req, res) {
  try {
    const {
      name,
      description = '',
      slug,
      parentId = null,
      isActive = true,
      orderIndex = 0,
      isDefault = false,
    } = req.body;

    // ❌ KHÔNG cần check trùng tên ở đây nữa, middleware xử lý rồi
    if (!name) {
      return res.status(400).json({ message: 'Tên danh mục là bắt buộc' });
    }

    const newCategory = await Category.create({
      name,
      slug,
      description,
      parentId,
      isActive,
      orderIndex,
      isDefault,
    });
    console.log('📦 Dữ liệu tạo category:', {
  name,
  slug,
  description,
  parentId,
  isActive,
  orderIndex,
  isDefault
});

    return res.status(201).json({ message: 'Tạo danh mục thành công', data: newCategory });
  } catch (error) {
    console.error('CREATE CATEGORY ERROR:', error);
    return res.status(500).json({ message: 'Lỗi server khi tạo danh mục' });
  }
}

static async getBySlug(req, res) {
  try {
    const { slug } = req.params;

    const category = await Category.findOne({ where: { slug } });

    if (!category) {
      return res.status(404).json({ message: 'Không tìm thấy danh mục' });
    }

    return res.json({ data: category });
  } catch (error) {
    console.error('GET CATEGORY BY SLUG ERROR:', error);
    return res.status(500).json({ message: 'Lỗi server khi lấy danh mục' });
  }
}


  // [READ] Lấy danh sách bài viết
  static async getAll(req, res) {

    try {

      const newCategory = await Category.findAll()

      return res.json({ data: newCategory });
    } catch (error) {
      console.error('GET POSTS ERROR:', error);
      return res.status(500).json({ message: 'Lỗi server khi lấy danh sách bài viết' });
    }
  }
  static async update(req, res) {
  try {
    const { slug } = req.params; // 👈 lấy slug từ URL
    const {
      name,
      description = '',
      parentId = null,
      isActive = true,
      orderIndex = 0,
      isDefault = false
    } = req.body;

    if (!slug) {
      return res.status(400).json({ message: 'Slug là bắt buộc để cập nhật' });
    }

    const category = await Category.findOne({ where: { slug } });

    if (!category) {
      return res.status(404).json({ message: 'Không tìm thấy danh mục với slug này' });
    }

    // Cập nhật
    await category.update({
      name,
      description,
      parentId,
      isActive,
      orderIndex,
      isDefault
    });

    return res.json({ message: 'Cập nhật danh mục thành công', data: category });
  } catch (error) {
    console.error('UPDATE CATEGORY ERROR:', error);
    return res.status(500).json({ message: 'Lỗi server khi cập nhật danh mục' });
  }
}
static async trashBySlug(req, res) {
  try {
    const { slugs } = req.body;

    if (!Array.isArray(slugs) || slugs.length === 0) {
      return res.status(400).json({ message: 'Danh sách slug không hợp lệ' });
    }

    const result = await Category.update(
      { deletedAt: new Date() },
      {
        where: {
          slug: slugs
        }
      }
    );

    return res.json({ message: `Đã xóa mềm ${result[0]} danh mục.` });
  } catch (error) {
    console.error('TRASH CATEGORY BY SLUG ERROR:', error);
    return res.status(500).json({ message: 'Lỗi server khi xóa mềm danh mục' });
  }
}
// controllers/postController.js


static async getPostCountsByCategory(req, res) {
  try {
    const result = await Category.findAll({
      attributes: [
        'id',
        'name',
        [Sequelize.fn('COUNT', Sequelize.col('Posts.id')), 'postCount']
      ],
      include: [
        {
          model: Post,
          attributes: [],
          where: {
            deletedAt: null // Chỉ tính bài chưa bị xoá mềm
          },
          required: false
        }
      ],
      group: ['Category.id'],
      raw: true
    });

    return res.json({ data: result });
  } catch (error) {
    console.error('Lỗi khi lấy tổng bài viết theo danh mục:', error);
    return res.status(500).json({ message: 'Lỗi server khi thống kê bài viết' });
  }
}

}
module.exports = CategoryController