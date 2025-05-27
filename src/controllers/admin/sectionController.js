const {
  HomeSection,
  HomeSectionBanner,
  ProductHomeSection,
  HomeSectionFilter,
  Product,
  Sku
} = require('../../models');
const { Op } = require('sequelize');

class SectionController {
  // === SECTIONS ===
  static async getAllSections(req, res) {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      type,
      isActive,           // lọc theo trạng thái hoạt động
      sortBy = 'orderIndex',
      sortOrder = 'ASC'
    } = req.query;

    const whereClause = {};

    if (search) {
      whereClause.title = { [Op.like]: `%${search}%` };
    }

    if (type) {
      whereClause.type = type;
    }

    if (isActive === 'true') whereClause.isActive = true;
    if (isActive === 'false') whereClause.isActive = false;

    const totalItems = await HomeSection.count({ where: whereClause });

    const sections = await HomeSection.findAll({
      where: whereClause,
      order: [[sortBy, sortOrder]],
      offset: (parseInt(page) - 1) * parseInt(limit),
      limit: parseInt(limit)
    });

    res.json({
      success: true,
      data: sections,
      pagination: {
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: parseInt(page),
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Lỗi server', error });
  }
}


  static async createSection(req, res) {
  const t = await HomeSection.sequelize.transaction();
  try {
    const {
      title,
      type,
      orderIndex = 0,
      isActive = true,
      skuIds = [],
      banners = [],
      filters = [],
    } = req.body;

    // 1. Tạo section
    const section = await HomeSection.create(
      { title, type, orderIndex, isActive },
      { transaction: t }
    );

    // 2. Gán sản phẩm (nếu có)
    if (Array.isArray(skuIds) && skuIds.length > 0) {
      const productEntries = skuIds.map((skuId, idx) => ({
        homeSectionId: section.id,
        skuId,
        sortOrder: idx,
      }));
      await ProductHomeSection.bulkCreate(productEntries, { transaction: t });
    }

    // 3. Gán banner (nếu có)
    if (Array.isArray(banners) && banners.length > 0) {
      const bannerEntries = banners.map((banner, idx) => ({
        homeSectionId: section.id,
        imageUrl: banner.imageUrl,
        linkType: banner.linkType || 'url',
        linkValue: banner.linkValue,
        sortOrder: idx,
      }));
      await HomeSectionBanner.bulkCreate(bannerEntries, { transaction: t });
    }

    // 4. Gán filter (nếu có)
    if (Array.isArray(filters) && filters.length > 0) {
      const filterEntries = filters.map((filter, idx) => ({
        homeSectionId: section.id,
        label: filter.label,
        type: filter.type || 'category',
        value: filter.value,
        sortOrder: idx,
      }));
      await HomeSectionFilter.bulkCreate(filterEntries, { transaction: t });
    }

    await t.commit();
    res.status(201).json({ success: true, message: 'Tạo section thành công', section });
  } catch (error) {
    await t.rollback();
    res.status(500).json({ message: 'Lỗi server', error });
  }
}

  static async updateSection(req, res) {
    try {
      const section = await HomeSection.findByPk(req.params.id);
      if (!section) return res.status(404).json({ message: 'Không tìm thấy section' });

      const { title, type, orderIndex } = req.body;
      await section.update({ title, type, orderIndex });

      res.json({ message: 'Cập nhật section thành công', section });
    } catch (error) {
      res.status(500).json({ message: 'Lỗi server', error });
    }
  }

  static async deleteSection(req, res) {
    try {
      const section = await HomeSection.findByPk(req.params.id);
      if (!section) return res.status(404).json({ message: 'Không tìm thấy section' });

      await section.destroy();
      res.json({ message: 'Đã xoá section' });
    } catch (error) {
      res.status(500).json({ message: 'Lỗi server', error });
    }
  }
static async getAllSkus(req, res) {
  try {
    const { search = '', limit = 20 } = req.query;

    const whereClause = {};
    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { sku: { [Op.like]: `%${search}%` } }
      ];
    }
const skus = await Sku.findAll({
  where: whereClause,
  limit: parseInt(limit),
  order: [['updatedAt', 'DESC']],
  attributes: ['id', 'skuCode', 'price', 'originalPrice'],
  include: [{
    model: Product,
    as: 'product',
    attributes: ['name']
  }]
});


    res.json({ success: true, data: skus });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi khi lấy danh sách SKU', error: err });
  }
}

}

module.exports = SectionController;
