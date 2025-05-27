const { Op } = require('sequelize');
const { Brand } = require('../../models');
const slugify = require('slugify');

class BrandController {
  // [GET] /brands
  static async getAll(req, res) {
    try {
      const { page = 1, limit = 10, search = '', status = 'all' } = req.query;
      const offset = (page - 1) * limit;

      let whereClause = {};
      let paranoid = true;

      if (search) {
        whereClause.name = { [Op.like]: `%${search}%` };
      }

      switch (status) {
        case 'published':
          whereClause = { ...whereClause, isActive: 1 };
          break;
        case 'draft':
          whereClause = { ...whereClause, isActive: 0 };
          break;
        case 'trash':
          paranoid = false;
          whereClause = { ...whereClause, deletedAt: { [Op.not]: null } };
          break;
        case 'all':
          break;
        default:
          return res.status(400).json({ message: 'Trạng thái không hợp lệ' });
      }

      const { rows, count } = await Brand.findAndCountAll({
        where: whereClause,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['orderIndex', 'ASC']],
        paranoid
      });

      return res.json({
        success: true,
        data: rows,
        total: count,
        currentPage: parseInt(page),
        totalPages: Math.ceil(count / limit)
      });
    } catch (error) {
      console.error('GET BRANDS ERROR:', error);
      return res.status(500).json({ message: 'Lỗi server khi lấy danh sách brand', error });
    }
  }


  static async getById(req, res) {
    try {
      const brand = await Brand.findByPk(req.params.id);
      if (!brand) return res.status(404).json({ message: 'Không tìm thấy brand' });
      return res.json({ data: brand });
    } catch (error) {
      return res.status(500).json({ message: 'Lỗi server' });
    }
  }

  static async create(req, res) {
    try {
      const { name, description, isActive, orderIndex } = req.body;
      const logoUrl = req.file?.path;

      if (!logoUrl) {
        return res.status(400).json({
          field: 'logoUrl',
          message: 'Vui lòng chọn ảnh logoUrl cho thương hiệu!'
        });
      }

      if (!name || name.trim() === '') {
        return res.status(400).json({
          field: 'name',
          message: 'Tên thương hiệu là bắt buộc!'
        });
      }

      const slug = slugify(name, { lower: true, strict: true });

      let finalOrderIndex = Number(orderIndex);
      if (isNaN(finalOrderIndex)) {
        const maxOrder = await Brand.max('orderIndex') || 0;
        finalOrderIndex = maxOrder + 1;
      } else {
        // Nếu người dùng nhập orderIndex thì đẩy các mục >= xuống
        await Brand.increment('orderIndex', {
          by: 1,
          where: {
            orderIndex: {
              [Op.gte]: finalOrderIndex
            }
          }
        });
      }

      const brand = await Brand.create({
        name,
        slug,
        description,
        logoUrl,
        isActive: Number(isActive) === 1 || isActive === true,
        orderIndex: finalOrderIndex
      });

      return res.status(201).json({
        message: 'Tạo brand thành công',
        data: brand
      });
    } catch (error) {
      console.error('Lỗi tạo brand:', error);
      return res.status(500).json({
        message: 'Lỗi server khi tạo brand',
        error: error.message
      });
    }
  }


  static async update(req, res) {
    try {
      const brand = await Brand.findByPk(req.params.id);
      if (!brand) {
        return res.status(404).json({ message: 'Không tìm thấy brand' });
      }

      const { name, description, isActive, orderIndex } = req.body;
      let logoUrl = brand.logoUrl;

      if (req.file?.path) {
        logoUrl = req.file.path;
      }

      const slug = slugify(name, { lower: true, strict: true });

      const newOrder = Number(orderIndex);
      const oldOrder = brand.orderIndex;

      // Nếu thay đổi orderIndex và hợp lệ
      if (!isNaN(newOrder) && newOrder !== oldOrder) {
        if (newOrder > oldOrder) {
          // Đẩy các brand phía sau lên
          await Brand.increment('orderIndex', {
            by: -1,
            where: {
              orderIndex: {
                [Op.gt]: oldOrder,
                [Op.lte]: newOrder
              },
              id: { [Op.not]: brand.id }
            }
          });
        } else {
          // Đẩy các brand phía trước xuống
          await Brand.increment('orderIndex', {
            by: 1,
            where: {
              orderIndex: {
                [Op.gte]: newOrder,
                [Op.lt]: oldOrder
              },
              id: { [Op.not]: brand.id }
            }
          });
        }
        brand.orderIndex = newOrder;
      }

      await brand.update({
        name,
        slug,
        description,
        logoUrl,
        isActive: Number(isActive) === 1 || isActive === true,
        orderIndex: brand.orderIndex // đảm bảo đã cập nhật
      });

      return res.json({ message: 'Cập nhật thành công', data: brand });
    } catch (error) {
      console.error('Lỗi cập nhật brand:', error);
      return res.status(500).json({
        message: 'Lỗi server khi cập nhật brand',
        error: error.message
      });
    }
  }


  static async softDelete(req, res) {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: 'Danh sách ID không hợp lệ' });
      }

      const brands = await Brand.findAll({ where: { id: ids } });
      const existingIds = brands.map(b => b.id);

      await Brand.destroy({ where: { id: existingIds } });

      return res.json({
        message: `Đã xoá mềm ${existingIds.length} brand`,
        trashed: existingIds
      });
    } catch (error) {
      console.error('Lỗi khi xoá mềm:', error);
      return res.status(500).json({ message: 'Lỗi server khi xoá mềm', error });
    }
  }

  static async restore(req, res) {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: 'Danh sách ID không hợp lệ' });
      }

      const brands = await Brand.findAll({ where: { id: ids }, paranoid: false });
      const existingIds = brands.map(b => b.id);
      const notFound = ids.filter(id => !existingIds.includes(id));

      const toRestore = brands.filter(b => b.deletedAt !== null).map(b => b.id);
      const notTrashed = brands.filter(b => b.deletedAt === null).map(b => b.id);

      await Brand.restore({ where: { id: toRestore } });

      return res.json({
        message: `Đã khôi phục ${toRestore.length} brand`,
        restored: toRestore,
        notTrashed,
        notFound
      });
    } catch (error) {
      return res.status(500).json({ message: 'Lỗi server khi khôi phục', error });
    }
  }

  static async forceDelete(req, res) {
    try {
      const { ids } = req.body;

      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: 'Danh sách ID không hợp lệ' });
      }

      // Kiểm tra brand có tồn tại
      const brands = await Brand.findAll({
        where: { id: ids },
        paranoid: false
      });

      const foundIds = brands.map(b => b.id);
      const notFound = ids.filter(id => !foundIds.includes(id));

      const deletedCount = await Brand.destroy({
        where: { id: foundIds },
        force: true
      });

      return res.json({
        message: `Đã xoá vĩnh viễn ${deletedCount} brand`,
        deleted: foundIds,
        notFound
      });
    } catch (error) {
      console.error('❌ Lỗi xoá vĩnh viễn:', error);
      return res.status(500).json({ message: 'Lỗi server khi xoá vĩnh viễn', error: error.message });
    }
  }


  static async updateOrderIndex(req, res) {
    try {
      const ordered = req.body;
      if (!Array.isArray(ordered)) {
        return res.status(400).json({ message: 'Dữ liệu không hợp lệ' });
      }

      const updatePromises = ordered.map(({ id, orderIndex }) =>
        Brand.update({ orderIndex }, { where: { id } })
      );
      await Promise.all(updatePromises);

      return res.json({ message: 'Cập nhật thứ tự thành công' });
    } catch (error) {
      console.error('Lỗi updateOrderIndex:', error);
      return res.status(500).json({ message: 'Lỗi server khi cập nhật thứ tự', error });
    }
  }
}

module.exports = BrandController;

