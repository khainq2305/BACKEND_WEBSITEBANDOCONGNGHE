const { Post, categoryPostModel, User } = require('../../models'); 
const { Sequelize } = require('sequelize');
const { Op } = require('sequelize');

class CategoryController {
  static async create(req, res) {
    try {
      const {
        name,
        description = '',
        slug,
        parentId = null,
        isActive,
        orderIndex = 0,
        isDefault = false,
      } = req.body;
      if (!name) {
        return res.status(400).json({ message: 'Tên danh mục là bắt buộc' });
      }

      const newCategory = await categoryPostModel.create({
        name,
        slug,
        description,
        parentId,
        isActive,
        orderIndex,
        isDefault,
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

      const category = await categoryPostModel.findOne({ where: { slug } });

      if (!category) {
        return res.status(404).json({ message: 'Không tìm thấy danh mục' });
      }

      return res.json({ data: category });
    } catch (error) {
      console.error('GET CATEGORY BY SLUG ERROR:', error);
      return res.status(500).json({ message: 'Lỗi server khi lấy danh mục' });
    }
  }

  static async getAll(req, res) {
    try {
      const { search = '', status = '', categoryId = '' } = req.query;
      console.log(req.query)

      const { page, limit, offset } = req.pagination;


      const whereClause = {};

      if (search) {
        whereClause.name = { [Op.like]: `%${search}%` };
      }
      if (status === 'trash') {
        whereClause.deletedAt = { [Op.not]: null };
      } else {
        whereClause.deletedAt = null;

        if (status === 'published') {
          whereClause.isActive = true;
        } else if (status === 'draft') {
          whereClause.isActive = false;
        }
      }

      if (categoryId) {
        whereClause.parentId = Number(categoryId);
      }
      const { count, rows } = await categoryPostModel.findAndCountAll({
        where: whereClause,
        limit,
        offset,
        order: [['createdAt', 'DESC']],
        paranoid: false
      });
      const postCounts = await Post.findAll({
        attributes: [
          'categoryId',
          [Sequelize.fn('COUNT', Sequelize.col('id')), 'total']
        ],
        group: ['categoryId'],
        raw: true,
        paranoid: false
      });


      const postCountMap = Object.fromEntries(
        postCounts.map(p => [p.categoryId, Number(p.total)])
      );

     
      const enrichedRows = rows.map(c => ({
        ...c.toJSON(),
        postCount: postCountMap[c.id] || 0
      }));




    
      const allCategories = await categoryPostModel.findAll({ paranoid: false });

      const counts = {
        all: allCategories.filter(c => !c.deletedAt).length,
        published: allCategories.filter(c => c.isActive === true && !c.deletedAt).length,
        draft: allCategories.filter(c => c.isActive === false && !c.deletedAt).length,
        trash: allCategories.filter(c => c.deletedAt).length
      };


      return res.json({
        data: enrichedRows,
        total: count,
        page,
        totalPages: Math.ceil(count.length / limit),
        counts
      });

    } catch (error) {
      console.error('GET CATEGORIES ERROR:', error);
      return res.status(500).json({ message: 'Lỗi server khi lấy danh mục' });
    }
  }



  static async update(req, res) {
    try {
      const { slug } = req.params;
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

      const category = await categoryPostModel.findOne({ where: { slug } });

      if (!category) {
        return res.status(404).json({ message: 'Không tìm thấy danh mục với slug này' });
      }

      
      await categoryPostModel.update({
        name,
        description,
        parentId,
        isActive,
        orderIndex,
        isDefault
      });

      return res.json({ message: 'Cập nhật danh mục thành công', data: category });
    } catch (error) {
   
      return res.status(500).json({ message: 'Lỗi server khi cập nhật danh mục' });
    }
  }
  static async trashBySlug(req, res) {
    try {
      const { slugs } = req.body;

      if (!Array.isArray(slugs) || slugs.length === 0) {
        return res.status(400).json({ message: 'Danh sách slug không hợp lệ' });
      }

      const result = await categoryPostModel.update(
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

  static async restoreBySlug(req, res) {
    try {
      const { slugs } = req.body;

      if (!Array.isArray(slugs) || slugs.length === 0) {
        return res.status(400).json({ message: 'Danh sách slug không hợp lệ' });
      }

      const result = await categoryPostModel.update(
        { deletedAt: null },
        {
          where: {
            slug: slugs
          },
          paranoid: false 
        }
      );

      return res.json({ message: `Đã khôi phục ${result[0]} danh mục.` });
    } catch (error) {
      console.error('RESTORE CATEGORY BY SLUG ERROR:', error);
      return res.status(500).json({ message: 'Lỗi server khi khôi phục danh mục' });
    }
  }


  static async getPostCountsByCategory(req, res) {
    try {
      const result = await categoryPostModel.findAll({
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
              deletedAt: null 
            },
            required: false
          }
        ],
        group: ['categoryPostModel.id'],
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
