const { VariantValue, Variant } = require('../../models');
const { Op } = require('sequelize');
const slugify = require('slugify');

class VariantValueController {
static async getByVariant(req, res) {
    try {
      const { id } = req.params;
      const { deleted, search = '', page = 1, limit = 10 } = req.query;

      const isTrash = deleted === 'true';
      const offset = (page - 1) * limit;

      
      const variant = await Variant.findByPk(id);
      if (!variant) {
        return res.status(404).json({ message: 'Không tìm thấy biến thể' });
      }

      const whereClause = {
        variantId: id,
        ...(isTrash ? { deletedAt: { [Op.ne]: null } } : {}),
        ...(search ? { value: { [Op.like]: `%${search}%` } } : {})
      };

      const { rows, count } = await VariantValue.findAndCountAll({
        where: whereClause,
        order: [['sortOrder', 'ASC']],
        limit: +limit,
        offset: +offset,
        paranoid: !isTrash
      });

    res.json({
  data: rows,
  variantName: variant.name,
  variantType: variant.type, 
  total: count,
  currentPage: +page,
  totalPages: Math.ceil(count / limit)
});

    } catch (err) {
      console.error('Lỗi lấy giá trị theo variant:', err);
      res.status(500).json({ message: 'Lỗi server', error: err.message });
    }
  }
static async create(req, res) {
  try {
    const { variantId, value, sortOrder, isActive, colorCode } = req.body;
    let imageUrl = null;

    if (req.file) {
      imageUrl = `/uploads/${req.file.filename}`;
    }

    const slug = slugify(value, { lower: true, strict: true }); // ✅ tạo slug tự động

    const newValue = await VariantValue.create({
      variantId,
      value,
      slug,
      sortOrder,
      isActive,
      colorCode,
      imageUrl
    });
// Gọi trước khi tạo mới
await VariantValue.increment('sortOrder', {
  where: {
    variantId,
    sortOrder: {
      [Op.gte]: sortOrder // dịch lên nếu đã >=
    }
  }
});

    res.status(201).json({ message: 'Tạo giá trị thành công', data: newValue });
  } catch (err) {
    console.error('Lỗi tạo giá trị:', err);
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
}



static async update(req, res) {
  try {
    const { id } = req.params;
    const { value, sortOrder, colorCode } = req.body;

    // ✅ Parse lại kiểu cho isActive vì FormData sẽ gửi dưới dạng string
  
    const current = await VariantValue.findByPk(id);
    if (!current) {
      return res.status(404).json({ message: 'Không tìm thấy giá trị để cập nhật' });
    }

    const variantId = current.variantId;

    if (sortOrder !== undefined) {
      await VariantValue.increment('sortOrder', {
        where: {
          variantId,
          sortOrder: { [Op.gte]: sortOrder },
          id: { [Op.ne]: id } // tránh cập nhật chính nó
        }
      });
    }

const isActive =
  req.body.isActive === 'true' ||
  req.body.isActive === true ||
  req.body.isActive === '1' ||
  req.body.isActive === 1;

const updateData = {
  value,
  slug: slugify(value, { lower: true, strict: true }),
  sortOrder,
  isActive, // ✅ CHỈNH CHỖ NÀY
  colorCode
};




    if (req.file) {
      updateData.imageUrl = `/uploads/${req.file.filename}`;
    }

    const [updated] = await VariantValue.update(updateData, { where: { id } });

    if (updated === 0) {
      return res.status(404).json({ message: 'Không tìm thấy giá trị để cập nhật' });
    }

    res.json({ message: 'Cập nhật thành công' });
  } catch (err) {
    console.error('Lỗi cập nhật:', err);
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
}





  static async softDelete(req, res) {
    try {
      await VariantValue.destroy({ where: { id: req.params.id } });
      res.json({ message: 'Đã chuyển vào thùng rác' });
    } catch (err) {
      console.error('Lỗi soft delete:', err);
      res.status(500).json({ message: 'Lỗi server', error: err.message });
    }
  }

  static async forceDelete(req, res) {
    try {
      await VariantValue.destroy({ where: { id: req.params.id }, force: true });
      res.json({ message: 'Đã xoá vĩnh viễn' });
    } catch (err) {
      console.error('Lỗi force delete:', err);
      res.status(500).json({ message: 'Lỗi server', error: err.message });
    }
  }

  static async restore(req, res) {
    try {
      await VariantValue.restore({ where: { id: req.params.id } });
      res.json({ message: 'Khôi phục thành công' });
    } catch (err) {
      console.error('Lỗi khôi phục:', err);
      res.status(500).json({ message: 'Lỗi server', error: err.message });
    }
  }

  static async deleteMany(req, res) {
    try {
      const { ids } = req.body;
      await VariantValue.destroy({ where: { id: ids } });
      res.json({ message: 'Đã chuyển nhiều vào thùng rác' });
    } catch (err) {
      console.error('Lỗi deleteMany:', err);
      res.status(500).json({ message: 'Lỗi server', error: err.message });
    }
  }

  static async forceDeleteMany(req, res) {
    try {
      const { ids } = req.body;
      await VariantValue.destroy({ where: { id: ids }, force: true });
      res.json({ message: 'Đã xoá vĩnh viễn nhiều giá trị' });
    } catch (err) {
      console.error('Lỗi forceDeleteMany:', err);
      res.status(500).json({ message: 'Lỗi server', error: err.message });
    }
  }

  static async restoreMany(req, res) {
    try {
      const { ids } = req.body;
      await VariantValue.restore({ where: { id: ids } });
      res.json({ message: 'Đã khôi phục nhiều giá trị' });
    } catch (err) {
      console.error('Lỗi restoreMany:', err);
      res.status(500).json({ message: 'Lỗi server', error: err.message });
    }
  }
  // POST /admin/variant-values/reorder
static async reorder(req, res) {
  try {
    const updates = req.body;

    const promises = updates.map(item =>
      VariantValue.update({ sortOrder: item.sortOrder }, { where: { id: item.id } })
    );

    await Promise.all(promises);
    res.json({ message: 'Cập nhật thứ tự thành công' });
  } catch (err) {
    console.error('Lỗi cập nhật sortOrder:', err);
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
}


static async createQuick(req, res) {
  try {
    const { variantId, value } = req.body;

    if (!variantId || !value || !value.trim()) {
      return res.status(400).json({ message: 'Thiếu variantId hoặc value' });
    }

    const slug = slugify(value, { lower: true, strict: true });

    const maxSort = await VariantValue.max('sortOrder', {
      where: { variantId }
    });

    const newValue = await VariantValue.create({
      variantId,
      value,
      slug,
      sortOrder: isNaN(maxSort) ? 0 : maxSort + 1,
      isActive: true
    });

    res.status(201).json({ message: 'Tạo giá trị thành công', data: newValue });
  } catch (err) {
    console.error('Lỗi tạo giá trị nhanh:', err);
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
}

}

module.exports = VariantValueController;
