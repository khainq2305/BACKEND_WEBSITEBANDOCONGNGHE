// src/controllers/admin/bannerController.js
const { Banner } = require('../../models');
const { Op } = require('sequelize');

class BannerController {
  
   static async create(req, res) {
    try {
      const {
        title,
        linkUrl,
        altText,
        type,
        displayOrder,
        startDate,
        endDate,
        isActive
      } = req.body;

   
      if (!req.file || !req.file.path) {
        return res.status(400).json({ message: 'Vui lòng chọn ảnh banner' });
      }

      
      const imageUrl = req.file.path.startsWith('http')
        ? req.file.path
        : `/uploads/${req.file.filename}`;

      const banner = await Banner.create({
        title: title?.trim() || null,
        linkUrl: linkUrl?.trim() || null,
        altText: altText?.trim() || null,
        type: type?.trim() || null,
        displayOrder: parseInt(displayOrder, 10) || 1,
        startDate: startDate || null,
        endDate: endDate || null,
        isActive: isActive === 'true' || isActive === true,
        imageUrl
      });

      return res.status(201).json({
        message: 'Tạo banner thành công',
        data: banner
      });
    } catch (error) {
      console.error('CREATE BANNER ERROR:', error);
      return res.status(500).json({
        message: 'Lỗi server khi tạo banner',
        error: error.message
      });
    }
  }

  
  static async getAll(req, res) {
  try {
    const { type, isActive, search, page = 1, limit = 10 } = req.query;
    const whereClause = {};

    if (type) {
      whereClause.type = type.trim();
    }
    if (isActive !== undefined) {
      whereClause.isActive = isActive === '1' || isActive === 'true';
    }
    if (search && search.trim() !== '') {
      const keyword = `%${search.trim()}%`;
      whereClause[Op.or] = [
        { title:   { [Op.like]: keyword } },
        { altText: { [Op.like]: keyword } }
      ];
    }

    const offset = (Number(page) - 1) * Number(limit);

    const { rows: banners, count: totalItems } = await Banner.findAndCountAll({
      where: whereClause,
      order: [
        ['type', 'ASC'],
        ['displayOrder', 'ASC']
      ],
      offset,
      limit: Number(limit)
    });

    const totalPages = Math.ceil(totalItems / Number(limit));

    return res.json({
      data: banners,
      pagination: {
        totalItems,
        totalPages,
        currentPage: Number(page),
        limit: Number(limit)
      }
    });
  } catch (error) {
    console.error('GET BANNERS ERROR:', error);
    return res.status(500).json({
      message: 'Lỗi lấy danh sách banner',
      error: error.message
    });
  }
}


 
  static async getById(req, res) {
    try {
      const banner = await Banner.findByPk(req.params.id);
      if (!banner) {
        return res.status(404).json({ message: 'Không tìm thấy banner' });
      }
      return res.json({ data: banner });
    } catch (error) {
      console.error('GET BANNER BY ID ERROR:', error);
      return res.status(500).json({ message: 'Lỗi lấy banner', error: error.message });
    }
  }

 
 static async update(req, res) {
  try {
    const banner = await Banner.findByPk(req.params.id);
    if (!banner) {
      return res.status(404).json({ message: 'Không tìm thấy banner' });
    }

   
    if (req.file && req.file.path) {
      banner.imageUrl = req.file.path.startsWith('http')
        ? req.file.path
        : `/uploads/${req.file.filename}`;
    }

    
    const {
      title,
      linkUrl,
      altText,
      type,
      displayOrder,
      startDate,
      endDate,
      isActive
    } = req.body;

    if (title !== undefined) banner.title = title?.trim() || null;
    if (linkUrl !== undefined) banner.linkUrl = linkUrl?.trim() || null;
    if (altText !== undefined) banner.altText = altText?.trim() || null;
    if (type !== undefined) banner.type = type?.trim() || null;
    if (displayOrder !== undefined) banner.displayOrder = parseInt(displayOrder, 10) || 1;
    if (startDate !== undefined) banner.startDate = startDate || null;
    if (endDate !== undefined) banner.endDate = endDate || null;
    if (isActive !== undefined) {
      banner.isActive = isActive === 'true' || isActive === true;
    }

    await banner.save();
    return res.json({ message: 'Cập nhật banner thành công', data: banner });
  } catch (error) {
    console.error('UPDATE BANNER ERROR:', error);
    return res.status(500).json({ message: 'Lỗi cập nhật banner', error: error.message });
  }
}


  
  static async delete(req, res) {
    try {
      const banner = await Banner.findByPk(req.params.id);
      if (!banner) {
        return res.status(404).json({ message: 'Không tìm thấy banner' });
      }
      await banner.destroy();
      return res.json({ message: 'Xóa banner thành công' });
    } catch (error) {
      console.error('DELETE BANNER ERROR:', error);
      return res.status(500).json({ message: 'Lỗi xóa banner', error: error.message });
    }
  }

 static async forceDeleteMany(req, res) {
    try {
      const { ids } = req.body;

      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: 'Danh sách id không hợp lệ' });
      }

      // force: true -> xoá hẳn (bỏ qua paranoid)
      const rowsDeleted = await Banner.destroy({
        where: { id: { [Op.in]: ids } },
        force : true,
      });

      return res.json({
        message: `Đã xoá vĩnh viễn ${rowsDeleted} banner`,
        rowsDeleted,
      });
    } catch (error) {
      console.error('FORCE DELETE MANY BANNERS ERROR:', error);
      return res.status(500).json({
        message: 'Lỗi xoá nhiều banner',
        error  : error.message,
      });
    }
  }
  static async updateOrder(req, res) {
  try {
    const { id } = req.params;
    const { displayOrder } = req.body;

    if (!displayOrder || isNaN(Number(displayOrder))) {
      return res.status(400).json({ message: 'Thứ tự hiển thị không hợp lệ' });
    }

    const banner = await Banner.findByPk(id);
    if (!banner) {
      return res.status(404).json({ message: 'Không tìm thấy banner' });
    }

    banner.displayOrder = Number(displayOrder);
    await banner.save();

    return res.json({ message: 'Cập nhật thứ tự hiển thị thành công', data: banner });
  } catch (error) {
    console.error('UPDATE DISPLAY ORDER ERROR:', error);
    return res.status(500).json({ message: 'Lỗi server khi cập nhật thứ tự', error: error.message });
  }
}
 static async getCategoriesForSelect(req, res) {
    try {
      const categories = await Category.findAll({
        attributes: ['id', 'name'],
        where: { isActive: true },          // chỉ lấy categories đang active
        order: [['name', 'ASC']]            // sắp xếp theo tên
        // Sequelize sẽ tự động loại bỏ những bản ghi có deletedAt != null (paranoid = true)
      });
      return res.json({ data: categories });
    } catch (error) {
      console.error('GET CATEGORIES FOR SELECT ERROR:', error);
      return res.status(500).json({
        message: 'Lỗi khi lấy danh sách category',
        error: error.message
      });
    }
  }

  // GET /admin/banners/products-for-select
  static async getProductsForSelect(req, res) {
    try {
      const products = await Product.findAll({
        attributes: ['id', 'name'],
        where: { isActive: true },          // chỉ lấy products đang active
        order: [['name', 'ASC']]            // sắp xếp theo tên
        // deletedAt != null sẽ tự động bị loại nhờ paranoid = true
      });
      return res.json({ data: products });
    } catch (error) {
      console.error('GET PRODUCTS FOR SELECT ERROR:', error);
      return res.status(500).json({
        message: 'Lỗi khi lấy danh sách product',
        error: error.message
      });
    }
  }
}

module.exports = BannerController;
