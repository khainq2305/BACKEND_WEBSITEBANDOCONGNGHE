// src/controllers/admin/variantController.js
 const { Variant, VariantValue } = require('../../models');
const { Op } = require('sequelize');

class VariantController {

static async getAll(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const offset = (page - 1) * limit;

      const fetchDeletedOnly = req.query.deleted === 'true'; // Đổi tên biến cho rõ ràng
      const keyword = req.query.keyword?.trim();
      const status = req.query.status?.trim();

      const whereClause = {};
      let queryOptions = { // Tạo object options cho query
        limit,
        offset,
        order: [['createdAt', 'DESC']],
        include: [{
          model: VariantValue,
          as: 'values',
          attributes: ['id', 'value']
        }],
        // paranoid: true mặc định nếu model có paranoid: true và không có gì ghi đè ở đây
      };

      if (status === 'true') {
        whereClause.isActive = true;
        // Mặc định paranoid: true sẽ chỉ lấy active và chưa bị xóa
      } else if (status === 'false') {
        whereClause.isActive = false;
        // Mặc định paranoid: true sẽ chỉ lấy inactive và chưa bị xóa
      }

      if (keyword) {
        whereClause.name = { [Op.like]: `%${keyword}%` };
      }

      if (fetchDeletedOnly) {
        // Khi muốn lấy danh sách trong thùng rác:
        // 1. Cần bỏ qua paranoid mặc định để có thể thấy các record đã soft-delete
        queryOptions.paranoid = false;
        // 2. Thêm điều kiện tường minh để chỉ lấy những record có deletedAt KHÁC NULL
        whereClause.deletedAt = { [Op.ne]: null };
      }
      // Nếu không phải fetchDeletedOnly (ví dụ tab 'all', 'active', 'inactive'), 
      // thì paranoid: true (mặc định của Sequelize nếu model được định nghĩa paranoid)
      // sẽ tự động lọc ra những bản ghi chưa bị xóa.
      // Nếu model Variant của bạn không có `paranoid: true` trong định nghĩa,
      // bạn cần đảm bảo `whereClause.deletedAt = null;` cho các trường hợp không phải thùng rác.
      // Giả sử model Variant đã có `paranoid: true`.

      queryOptions.where = whereClause;

      const result = await Variant.findAndCountAll(queryOptions);

      res.json({
        data: result.rows,
        total: result.count,
        currentPage: page,
        totalPages: Math.ceil(result.count / limit)
      });
    } catch (error) {
      console.error('❌ Lỗi lấy variant:', error);
      res.status(500).json({ message: 'Lỗi server', error: error.message });
    }
  }





static async create(req, res) {
    try {
      const { name, description, type, isActive } = req.body;
      const slug = name.toLowerCase().replace(/\s+/g, '-');
    const newVariant = await Variant.create({ name, description, type, slug, isActive });
if (!['image', 'color', 'text'].includes(type)) {
  return res.status(400).json({ message: 'Kiểu thuộc tính không hợp lệ' });
}

      res.status(201).json({ message: 'Tạo thuộc tính thành công', data: newVariant });
    } catch (error) {
      console.error("❌ Lỗi tạo variant:", error);
      res.status(500).json({ message: "Lỗi khi tạo variant", error: error.message });
    }
  }
  static async softDelete(req, res) {
    try {
      const { id } = req.params;
      await Variant.destroy({ where: { id } });
      res.json({ message: 'Đã chuyển vào thùng rác' });
    } catch (error) {
      console.error("❌ Lỗi chuyển vào thùng rác:", error);
      res.status(500).json({ message: "Lỗi khi xóa mềm", error: error.message });
    }
  }

  static async forceDelete(req, res) {
    try {
      const { id } = req.params;
      await Variant.destroy({ where: { id }, force: true });
      res.json({ message: 'Đã xoá vĩnh viễn' });
    } catch (error) {
      console.error("❌ Lỗi xóa vĩnh viễn:", error);
      res.status(500).json({ message: "Lỗi khi xóa vĩnh viễn", error: error.message });
    }
  }

  static async restore(req, res) {
    try {
      const { id } = req.params;
      await Variant.restore({ where: { id } });
      res.json({ message: 'Khôi phục thành công' });
    } catch (error) {
      console.error("❌ Lỗi khôi phục:", error);
      res.status(500).json({ message: "Lỗi khi khôi phục", error: error.message });
    }
  }
    static async softDeleteMany(req, res) {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0)
        return res.status(400).json({ message: "Danh sách ID không hợp lệ" });

      await Variant.destroy({ where: { id: ids } }); // soft delete
      res.json({ message: `Đã chuyển ${ids.length} thuộc tính vào thùng rác` });
    } catch (error) {
      console.error("❌ Lỗi softDeleteMany:", error);
      res.status(500).json({ message: "Lỗi khi chuyển nhiều vào thùng rác", error: error.message });
    }
  }

static async forceDeleteMany(req, res) {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0)
      return res.status(400).json({ message: "Danh sách ID không hợp lệ" });

    // ✅ Xoá hết value liên quan trước
    await VariantValue.destroy({ where: { variantId: ids }, force: true });

    // ✅ Rồi xoá variant
    await Variant.destroy({ where: { id: ids }, force: true });

    res.json({ message: `Đã xoá vĩnh viễn ${ids.length} thuộc tính` });
  } catch (error) {
    console.error("❌ Lỗi forceDeleteMany:", error);
    res.status(500).json({ message: "Lỗi khi xoá nhiều vĩnh viễn", error: error.message });
  }
}


  static async restoreMany(req, res) {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0)
        return res.status(400).json({ message: "Danh sách ID không hợp lệ" });

      await Variant.restore({ where: { id: ids } });
      res.json({ message: `Đã khôi phục ${ids.length} thuộc tính` });
    } catch (error) {
      console.error("❌ Lỗi restoreMany:", error);
      res.status(500).json({ message: "Lỗi khi khôi phục nhiều", error: error.message });
    }
  }
static async getById(req, res) {
  try {
    const { id } = req.params;

    const variant = await Variant.findOne({
      where: { id },
      include: [
        {
          model: VariantValue,
          as: 'values',
          attributes: ['id', 'value', 'slug', 'sortOrder', 'isActive']
        }
      ]
    });

    if (!variant) {
      return res.status(404).json({ message: 'Không tìm thấy thuộc tính' });
    }

    res.json(variant);
  } catch (error) {
    console.error('❌ Lỗi khi lấy chi tiết variant:', error);
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
}
static async update(req, res) {
  try {
    const { id } = req.params;
    const { name, description, type, isActive } = req.body;

    const slug = name.toLowerCase().replace(/\s+/g, '-');

    const [updated] = await Variant.update(
      { name, description, type, isActive, slug },
      { where: { id } }
    );
if (!['image', 'color', 'text'].includes(type)) {
  return res.status(400).json({ message: 'Kiểu thuộc tính không hợp lệ' });
}

    if (updated === 0) {
      return res.status(404).json({ message: 'Không tìm thấy thuộc tính cần cập nhật' });
    }

    res.json({ message: 'Cập nhật thành công' });
  } catch (error) {
    console.error("❌ Lỗi cập nhật variant:", error);
    res.status(500).json({ message: "Lỗi khi cập nhật", error: error.message });
  }
}

// Lấy toàn bộ variant có sẵn kèm value để dùng khi tạo sản phẩm
static async getAllActiveWithValues(req, res) {
  try {
    const variants = await Variant.findAll({
      where: { isActive: true },
      include: [
        {
          model: VariantValue,
          as: 'values',
          where: { isActive: true },
          required: false,
          attributes: ['id', 'value', 'slug', 'colorCode'],
          order: [['sortOrder', 'ASC']]
        }
      ],
     
    });

    res.json({ data: variants });
  } catch (error) {
    console.error("❌ Lỗi lấy variant có giá trị:", error);
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
}
static async createTypeOnly(req, res) {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Tên loại thuộc tính không được để trống.' });
    }

    const slug = name.toLowerCase().trim().replace(/\s+/g, '-');
    const newVariant = await Variant.create({
      name,
      slug,
      type: 'text',         // gán mặc định
      isActive: true        // gán mặc định
    });

    res.status(201).json({ message: 'Tạo loại thuộc tính thành công.', data: newVariant });
  } catch (error) {
    console.error("❌ Lỗi tạo loại thuộc tính đơn giản:", error);
    res.status(500).json({ message: "Lỗi server khi tạo loại thuộc tính.", error: error.message });
  }
}

}

module.exports = VariantController;
