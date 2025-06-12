const { Op } = require('sequelize');
const {
  Coupon, Role , CouponUser, CouponItem, CouponCategory,
  User, Sku, Category
} = require('../../models');
const { sequelize } = require('../../models'); 

class CouponController {
   static async create(req, res) {
    const t = await sequelize.transaction();
    try {
      const {
        userIds = [], productIds = [], categoryIds = [],
        ...couponData
      } = req.body;

      const coupon = await Coupon.create(couponData, { transaction: t });

      if (userIds.length > 0) {
        const userRecords = userIds.map(userId => ({
          couponId: coupon.id,
          userId
        }));
        await CouponUser.bulkCreate(userRecords, { transaction: t });
      }

      if (productIds.length > 0) {
  const productRecords = productIds.map(skuId => ({
    couponId: coupon.id,
    skuId // ✅ Đúng tên cột trong bảng CouponItem
  }));
  await CouponItem.bulkCreate(productRecords, { transaction: t });
}

     

      if (categoryIds.length > 0) {
        const categoryRecords = categoryIds.map(categoryId => ({
          couponId: coupon.id,
          categoryId
        }));
        await CouponCategory.bulkCreate(categoryRecords, { transaction: t });
      }

      await t.commit();
      res.status(201).json({ message: '✅ Thêm mã giảm giá thành công', data: coupon });
    } catch (err) {
      await t.rollback();
      console.error('❌ Lỗi tạo mã giảm giá:', err);
      res.status(500).json({ message: 'Lỗi server', error: err.message });
    }
  }

static async list(req, res) {
  try {
    const { search = '', status = 'all', page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = {};
    if (search) {
      whereClause[Op.or] = [
        { code: { [Op.like]: `%${search}%` } },
        { title: { [Op.like]: `%${search}%` } }
      ];
    }

    // Trạng thái hoạt động
    if (status === 'active') {
      whereClause.isActive = true;
    } else if (status === 'inactive') {
      whereClause.isActive = false;
    } else if (status === 'deleted') {
      whereClause.deletedAt = { [Op.not]: null };
    }

    const [result, totalCount, activeCount, inactiveCount, deletedCount] = await Promise.all([
      Coupon.findAndCountAll({
        where: whereClause,
        offset: parseInt(offset),
        limit: parseInt(limit),
        order: [['createdAt', 'DESC']],
        paranoid: status !== 'deleted'
      }),
      Coupon.count(),
      Coupon.count({ where: { isActive: true } }),
      Coupon.count({ where: { isActive: false } }),
      Coupon.count({
        where: { deletedAt: { [Op.not]: null } },
        paranoid: false
      })
    ]);

    const { rows, count } = result;

    res.json({
      data: rows,
      pagination: {
        totalItems: count,
        currentPage: +page,
        totalPages: Math.ceil(count / limit),
        limit: +limit
      },
      summary: {
        total: totalCount,
        active: activeCount,
        inactive: inactiveCount,
        deleted: deletedCount
      }
    });
  } catch (err) {
    console.error('❌ Lỗi lấy danh sách mã giảm:', err);
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
}


static async update(req, res) {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;

    const coupon = await Coupon.findByPk(id);
    if (!coupon) {
      return res.status(404).json({ message: 'Không tìm thấy mã giảm giá' });
    }

    const {
      userIds = [],
      productIds = [],
      categoryIds = [],
      ...couponData
    } = req.body;

    // 1. Cập nhật dữ liệu chính của coupon
    await coupon.update(couponData, { transaction: t });

    // ======================
    // === Đồng bộ CouponUser ===
    const currentUsers = await CouponUser.findAll({ where: { couponId: id }, transaction: t });
    const currentUserIds = currentUsers.map(u => u.userId);

    const toDeleteUser = currentUserIds.filter(uid => !userIds.includes(uid));
    const toAddUser = userIds.filter(uid => !currentUserIds.includes(uid));

    if (toDeleteUser.length > 0) {
      await CouponUser.destroy({
        where: { couponId: id, userId: toDeleteUser },
        force: true, // <-- Thêm lại để xóa vĩnh viễn
        transaction: t
      });
    }

    if (toAddUser.length > 0) {
      const newUsers = toAddUser.map(userId => ({ couponId: id, userId }));
      await CouponUser.bulkCreate(newUsers, { transaction: t });
    }

    // ======================
    // === Đồng bộ CouponItem ===
    const currentItems = await CouponItem.findAll({ where: { couponId: id }, paranoid: false, transaction: t });
    const currentItemIds = currentItems.map(i => i.skuId);

    const toDeleteItem = currentItemIds.filter(pid => !productIds.includes(pid));
    const toAddItem = productIds.filter(pid => !currentItemIds.includes(pid));

    if (toDeleteItem.length > 0) {
      await CouponItem.destroy({
        where: { couponId: id, skuId: toDeleteItem },
        force: true, // <-- Thêm lại để xóa vĩnh viễn
        transaction: t
      });
    }

    if (toAddItem.length > 0) {
      const newItems = toAddItem.map(skuId => ({ couponId: id, skuId }));
      await CouponItem.bulkCreate(newItems, { transaction: t });
    }

    // ======================
    // === Đồng bộ CouponCategory ===
    const currentCategories = await CouponCategory.findAll({ where: { couponId: id }, transaction: t });
    const currentCategoryIds = currentCategories.map(c => c.categoryId);

    const toDeleteCategory = currentCategoryIds.filter(cid => !categoryIds.includes(cid));
    const toAddCategory = categoryIds.filter(cid => !currentCategoryIds.includes(cid));

    if (toDeleteCategory.length > 0) {
      await CouponCategory.destroy({
        where: { couponId: id, categoryId: toDeleteCategory },
        force: true, // <-- Thêm lại để xóa vĩnh viễn
        transaction: t
      });
    }

    if (toAddCategory.length > 0) {
      const newCategories = toAddCategory.map(categoryId => ({ couponId: id, categoryId }));
      await CouponCategory.bulkCreate(newCategories, { transaction: t });
    }

    // Commit cuối
    await t.commit();
    res.json({ message: '✅ Cập nhật thành công', data: coupon });

  } catch (err) {
    await t.rollback();
    console.error('❌ Lỗi cập nhật mã giảm:', err);
    res.status(500).json({ message: 'Lỗi cập nhật', error: err.message });
  }
}



  static async softDelete(req, res) {
    try {
      const { id } = req.params;
      const coupon = await Coupon.findByPk(id);
      if (!coupon) return res.status(404).json({ message: 'Không tìm thấy mã giảm giá' });

      await coupon.destroy();
      res.json({ message: '✅ Đã xoá tạm thời' });
    } catch (err) {
      res.status(500).json({ message: '❌ Lỗi xoá mềm', error: err.message });
    }
  }

  static async softDeleteMany(req, res) {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids)) return res.status(400).json({ message: 'Danh sách ID không hợp lệ' });

      await Coupon.destroy({
        where: { id: { [Op.in]: ids } }
      });

      res.json({ message: '✅ Đã xoá tạm thời nhiều mã' });
    } catch (err) {
      res.status(500).json({ message: '❌ Lỗi xoá nhiều', error: err.message });
    }
  }

  static async restore(req, res) {
    try {
      const { id } = req.params;
      const coupon = await Coupon.findOne({ where: { id }, paranoid: false });
      if (!coupon || !coupon.deletedAt) return res.status(404).json({ message: 'Không tìm thấy hoặc không bị xoá' });

      await coupon.restore();
      res.json({ message: '✅ Đã khôi phục' });
    } catch (err) {
      res.status(500).json({ message: '❌ Lỗi khôi phục', error: err.message });
    }
  }

  static async restoreMany(req, res) {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ message: 'Danh sách ID không hợp lệ' });

    const deletedCoupons = await Coupon.findAll({
      where: {
        id: { [Op.in]: ids },
        deletedAt: { [Op.not]: null }
      },
      paranoid: false // 👈 BẮT BUỘC!
    });

    for (const coupon of deletedCoupons) {
      await coupon.restore();
    }

    res.json({ message: '✅ Đã khôi phục nhiều mã' });
  } catch (err) {
    res.status(500).json({ message: '❌ Lỗi khôi phục nhiều', error: err.message });
  }
}


  static async forceDelete(req, res) {
    try {
      const { id } = req.params;
      const coupon = await Coupon.findOne({ where: { id }, paranoid: false });
      if (!coupon) return res.status(404).json({ message: 'Không tìm thấy mã giảm giá' });

      await coupon.destroy({ force: true });
      res.json({ message: '✅ Đã xoá vĩnh viễn' });
    } catch (err) {
      res.status(500).json({ message: '❌ Lỗi xoá vĩnh viễn', error: err.message });
    }
  }

  static async forceDeleteMany(req, res) {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids)) return res.status(400).json({ message: 'Danh sách ID không hợp lệ' });

      await Coupon.destroy({
        where: { id: { [Op.in]: ids } },
        force: true
      });

      res.json({ message: '✅ Đã xoá vĩnh viễn nhiều mã' });
    } catch (err) {
      res.status(500).json({ message: '❌ Lỗi xoá vĩnh viễn nhiều', error: err.message });
    }
  }
   // 👇 LẤY USER ACTIVE (áp dụng cho coupon type = 'private')
static async getUsers(req, res) {
  try {
    const list = await User.findAll({
      where: {
        deletedAt: null,
      },
      include: [
        {
          model: Role,
          where: { name: 'user' }, // ✅ chỉ lấy role là "user"
          attributes: []           // ❌ không cần lấy fields từ Role
        }
      ],
      attributes: ['id', 'email', 'fullName'],
      order: [['fullName', 'ASC']]
    });

    res.json(list);
  } catch (err) {
    console.error('❌ Lỗi getUsers:', err);
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
}
static async getCategories(req, res) {
  try {
    const all = await Category.findAll({
      where: { deletedAt: null, isActive: true },
      attributes: ['id', 'name', 'parentId'],
      order: [['name', 'ASC']]
    });

    const buildTree = (categories, parentId = null, level = 0) => {
      return categories
        .filter(cat => cat.parentId === parentId)
        .map(cat => {
          const indentation = '│   '.repeat(level) + (level > 0 ? '├─ ' : '');
          return {
            id: cat.id,
            label: `${indentation}${cat.name}`,
            parentId: cat.parentId,
            level
          };
        });
    };

    const flattenTree = (categories, parentId = null, level = 0) => {
      let result = [];
      categories
        .filter(cat => cat.parentId === parentId)
        .forEach(cat => {
          const indentation = '│   '.repeat(level) + (level > 0 ? '├─ ' : '');
          result.push({
            id: cat.id,
            label: `${indentation}${cat.name}`
          });
          result = result.concat(flattenTree(categories, cat.id, level + 1));
        });
      return result;
    };

    const flatList = flattenTree(all);

    res.json(flatList);
  } catch (err) {
    console.error('❌ Lỗi getCategories:', err);
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
}


 static async getProducts(req, res) {
  try {
    const list = await Sku.findAll({
      where: { deletedAt: null, isActive: true },
      attributes: ['id', 'skuCode'],
      include: {
        model: require('../../models').Product,
        as: 'product',
        attributes: ['name'], // ✅ lấy tên sản phẩm
        where: { deletedAt: null, isActive: true }
      },
      order: [['skuCode', 'ASC']]
    });

    res.json(list.map(sku => ({
      id: sku.id,
      label: `${sku.skuCode} - ${sku.product?.name || ''}` // ✅ trả label đầy đủ
    })));
  } catch (err) {
    console.error('❌ Lỗi getProducts:', err);
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
}

static async getById(req, res) {
  try {
    const { id } = req.params;

    const coupon = await Coupon.findOne({
      where: { id },
      include: [
        {
          model: CouponUser,
          as: 'users',
          attributes: ['userId'],
          paranoid: false
        },
        {
          model: CouponItem,
          as: 'products',
          attributes: ['skuId'], // ✅ Fix đúng tên trường
          paranoid: false
        },
        {
          model: CouponCategory,
          as: 'categories',
          attributes: ['categoryId'],
          paranoid: false
        }
      ],
      paranoid: false // để lấy cả coupon đã bị xóa mềm
    });

    if (!coupon) {
      return res.status(404).json({ message: 'Không tìm thấy mã giảm giá' });
    }

    res.json({
      ...coupon.toJSON(),
      userIds: coupon.users?.map(c => c.userId) || [],
      productIds: coupon.products?.map(c => c.skuId) || [], // ✅ fix productId → skuId
      categoryIds: coupon.categories?.map(c => c.categoryId) || []
    });
  } catch (err) {
    console.error('❌ Lỗi getById:', err);
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
}



}

module.exports = CouponController;
