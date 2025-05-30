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
      isActive
    } = req.query;

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const offset = (pageNum - 1) * limitNum;

    const whereClause = {};
    if (search) {
      whereClause.title = { [Op.like]: `%${search}%` };
    }
    if (isActive === 'true') {
      whereClause.isActive = true;
    } else if (isActive === 'false') {
      whereClause.isActive = false;
    }

    const totalItems = await HomeSection.count({ where: whereClause });

    const sections = await HomeSection.findAll({
      where: whereClause,
      offset,
      limit: limitNum,
      order: [['orderIndex', 'ASC']],
      include: [
        { model: ProductHomeSection, as: 'productHomeSections', attributes: ['id'] },
        { model: HomeSectionBanner, as: 'banners', attributes: ['id'] }
      ]
    });

    const countActive = await HomeSection.count({
      where: {
        title: { [Op.like]: `%${search}%` },
        isActive: true
      }
    });
    const countInactive = await HomeSection.count({
      where: {
        title: { [Op.like]: `%${search}%` },
        isActive: false
      }
    });

    return res.json({
      success: true,
      data: sections,
      counts: {
        active: countActive,
        inactive: countInactive
      },
      pagination: {
        totalItems,
        totalPages: Math.ceil(totalItems / limitNum),
        currentPage: pageNum,
        pageSize: limitNum
      }
    });
  } catch (error) {
    console.error('[getAllSections]', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy danh sách',
      error
    });
  }
}


static async getSectionById(req, res) {
  try {
    const section = await HomeSection.findByPk(req.params.id, {
      include: [
        {
          model: HomeSectionBanner,
          as: 'banners',
          attributes: ['id', 'imageUrl', 'linkType', 'linkValue', 'sortOrder']
        },
        {
          model: ProductHomeSection,
          as: 'productHomeSections',
          attributes: ['id', 'skuId', 'sortOrder'],
          include: [
            {
              model: Sku,
              as: 'sku',
              required: false, // ✅ không fail nếu không có
              attributes: ['skuCode'],
              include: [
                {
                  model: Product,
                  as: 'product',
                  required: false, // ✅ không fail nếu không có
                  attributes: ['name']
                }
              ]
            }
          ]
        },
        {
          model: HomeSectionFilter,
          as: 'filters',
          attributes: ['id', 'label', 'type', 'value', 'sortOrder']
        }
      ]
    });

    if (!section) {
      console.error('[DEBUG] Không tìm thấy HomeSection với id =', req.params.id);
      return res.status(404).json({ success: false, message: 'Không tìm thấy section' });
    }

    console.log('[DEBUG] Dữ liệu trả về section:', JSON.stringify(section, null, 2));
    res.json({ success: true, data: section });
  } catch (error) {
    console.error('[getSectionById error]', JSON.stringify(error, null, 2));
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
      skuIds = '[]',
      filters = '[]',
      bannersMetaJson = '[]'
    } = req.body;

    const parsedSkuIds = JSON.parse(skuIds);
    const parsedFilters = JSON.parse(filters);
    const parsedBannersMeta = JSON.parse(bannersMetaJson);

    const bannerFiles = req.files || [];
console.log('🟢 Body nhận được:', req.body);
console.log('🟢 SKU IDs:', parsedSkuIds);
console.log('🟢 Filters:', parsedFilters);
console.log('🟢 BannersMeta:', parsedBannersMeta);

    const section = await HomeSection.create(
      { title, type, orderIndex, isActive },
      { transaction: t }
    );

    // 🟢 Thêm productHomeSections nếu có
    if (Array.isArray(parsedSkuIds)) {
      const skuEntries = parsedSkuIds.map((skuId, idx) => ({
        homeSectionId: section.id,
        skuId,
        sortOrder: idx
      }));
      await ProductHomeSection.bulkCreate(skuEntries, { transaction: t });
    }

    // 🟢 Thêm banners
    if (Array.isArray(parsedBannersMeta)) {
      const banners = parsedBannersMeta.map((meta, idx) => {
        const file = meta.hasNewFile ? bannerFiles.shift() : null;
        return {
          homeSectionId: section.id,
          imageUrl: file ? `/uploads/${file.filename}` : meta.existingImageUrl || '',
          linkType: meta.linkType || 'url',
          linkValue: meta.linkValue || '',
          sortOrder: idx
        };
      });
      await HomeSectionBanner.bulkCreate(banners, { transaction: t });
    }

    // 🟢 Thêm filters
    if (Array.isArray(parsedFilters)) {
      const filterEntries = parsedFilters.map((filter, idx) => ({
        homeSectionId: section.id,
        label: filter.label,
        type: filter.type || 'url',
        value: filter.value,
        sortOrder: idx
      }));
      await HomeSectionFilter.bulkCreate(filterEntries, { transaction: t });
    }

    await t.commit();
    return res.status(201).json({ success: true, message: 'Tạo section thành công', data: section });
  } catch (error) {
  await t.rollback();
  console.error('[CREATE_SECTION ERROR]', error);
  return res.status(500).json({
    success: false,
    message: error?.parent?.sqlMessage || error.message || 'Lỗi server không xác định',
    error
  });
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
static async updateOrderIndexes(req, res) {
  try {
    const { orderedIds = [] } = req.body;

    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ success: false, message: 'Dữ liệu không hợp lệ' });
    }

    // Cập nhật từng mục theo vị trí mới
    await Promise.all(
      orderedIds.map((id, index) =>
        HomeSection.update({ orderIndex: index }, { where: { id } })
      )
    );

    return res.json({ success: true, message: 'Cập nhật thứ tự thành công' });
  } catch (error) {
    console.error('[updateOrderIndexes]', error);
    return res.status(500).json({ success: false, message: 'Lỗi server', error });
  }
}

}

module.exports = SectionController;
