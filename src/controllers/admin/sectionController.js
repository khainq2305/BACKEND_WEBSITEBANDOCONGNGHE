const {
  HomeSection,
  HomeSectionBanner,
  Product,
  Category,
  ProductHomeSection,
} = require("../../models");
const { Op } = require("sequelize");
const slugify = require("slugify");
// ở đầu file SectionController.js, ngay sau các require:
function buildCategoryTree(list) {
  const map = {}, roots = [];
  // Khởi tạo map[id] và thêm children + level
  list.forEach(c => map[c.id] = { ...c, children: [], level: 0 });
  // Gán con vào parent
  list.forEach(c => {
    if (c.parentId && map[c.parentId]) {
      map[c.parentId].children.push(map[c.id]);
      map[c.id].level = map[c.parentId].level + 1;
    } else {
      roots.push(map[c.id]);
    }
  });
  // Duyệt theo thứ tự depth-first để flatten ra array theo cây
  const out = [];
  function dfs(node) {
    out.push(node);
    node.children.forEach(dfs);
  }
  roots.forEach(dfs);
  return out;
}

class SectionController {
  static async getAllSections(req, res) {
    try {
      const { page = 1, limit = 10, search = "", isActive } = req.query;
      const pageNum = parseInt(page, 10) || 1;
      const limitNum = parseInt(limit, 10) || 10;
      const offset = (pageNum - 1) * limitNum;

      const whereClause = {};
      if (search) whereClause.title = { [Op.like]: `%${search}%` };
      if (isActive === "true") whereClause.isActive = true;
      else if (isActive === "false") whereClause.isActive = false;

      const { count, rows: sections } = await HomeSection.findAndCountAll({
        where: whereClause,
        offset,
        limit: limitNum,
        order: [["orderIndex", "ASC"]],
        include: [
          {
            model: Product,
            as: "products",
            attributes: ["id", "name", "thumbnail"],
            through: { attributes: ["sortOrder"] },
          },
          {
            model: HomeSectionBanner,
            as: "banners",
            attributes: ["id"],
          },
        ],
        distinct: true,
      });

      const countActive = await HomeSection.count({
        where: {
          ...(search && { title: { [Op.like]: `%${search}%` } }),
          isActive: true,
        },
      });
      const countInactive = await HomeSection.count({
        where: {
          ...(search && { title: { [Op.like]: `%${search}%` } }),
          isActive: false,
        },
      });
      const totalAll = await HomeSection.count({
        where: { ...(search && { title: { [Op.like]: `%${search}%` } }) },
      });

      return res.json({
        success: true,
        data: sections,
        counts: { all: totalAll, active: countActive, inactive: countInactive },
        pagination: {
          totalItems: count,
          totalPages: Math.ceil(count / limitNum),
          currentPage: pageNum,
          pageSize: limitNum,
        },
      });
    } catch (error) {
      console.error("[getAllSections]", error);
      return res
        .status(500)
        .json({
          success: false,
          message: "Lỗi server khi lấy danh sách",
          error: error.message,
        });
    }
  }

  static async getSectionById(req, res) {
    try {
      const { slug } = req.params;

      const section = await HomeSection.findOne({
        where: { slug },
        include: [
          {
            model: Product,
            as: "products",
            attributes: ["id", "name", "thumbnail"],
            through: { attributes: ["sortOrder"] },
          },
          {
            model: HomeSectionBanner,
            as: "banners",
            attributes: [
              "id",
              "imageUrl",
              "linkType",
              "linkValue",
              "sortOrder",
            ],
          },
        ],
      });

      if (!section) {
        return res
          .status(404)
          .json({ success: false, message: "Không tìm thấy section" });
      }

      return res.json({ success: true, data: section });
    } catch (error) {
      console.error("[getSectionById]", error);
      return res
        .status(500)
        .json({ success: false, message: "Lỗi server", error: error.message });
    }
  }

  static async createSection(req, res) {
  const t = await HomeSection.sequelize.transaction();
  try {
    const { title, type, orderIndex = 0, isActive = true } = req.body;
    const parsedProductIds = JSON.parse(req.body.productIds || "[]");
    const parsedBannersMeta = JSON.parse(req.body.bannersMetaJson || "[]");

    const slug = slugify(title, {
      lower: true,
      strict: true,
      remove: /[*+~.()'"!:@]/g,
    });

    const existingSection = await HomeSection.findOne({
      where: { slug },
      transaction: t,
    });
    if (existingSection) {
      await t.rollback();
      return res.status(409).json({
        success: false,
        field: "title",
        message: "Tiêu đề đã tồn tại. Hãy dùng tên khác.",
      });
    }

    const existingSameIndex = await HomeSection.findOne({
      where: { orderIndex },
      transaction: t,
    });
    if (existingSameIndex) {
      await HomeSection.update(
        { orderIndex: HomeSection.sequelize.literal("orderIndex + 1") },
        { where: { orderIndex: { [Op.gte]: orderIndex } }, transaction: t }
      );
    }

    const section = await HomeSection.create(
      { title, slug, type, orderIndex, isActive },
      { transaction: t }
    );

    if (parsedProductIds && parsedProductIds.length > 0) {
      await section.setProducts(parsedProductIds, { transaction: t });
    }

    const files = req.files || [];

    if (Array.isArray(parsedBannersMeta) && parsedBannersMeta.length > 0) {
      const toCreate = [];
      let fileIndex = 0;

      for (const meta of parsedBannersMeta) {
        let imageUrl = meta.existingImageUrl || null;
        if (meta.hasNewFile && files[fileIndex]) {
          imageUrl = files[fileIndex].path;
          fileIndex++;
        }

        // ✅ FIX: Chuẩn hoá linkValue
        let finalLinkValue = "";
        if (typeof meta.linkValue === "object" && meta.linkValue !== null) {
          finalLinkValue = meta.linkValue.slug || String(meta.linkValue.id);
        } else {
          finalLinkValue = meta.linkValue || "";
        }

        if (imageUrl) {
          toCreate.push({
            homeSectionId: section.id,
            imageUrl,
            linkType: meta.linkType || "url",
            linkValue: finalLinkValue,
            sortOrder: meta.sortOrder ?? toCreate.length,
          });
        }
      }

      if (toCreate.length > 0) {
        await HomeSectionBanner.bulkCreate(toCreate, { transaction: t });
      }
    }

    await t.commit();
    return res.status(201).json({
      success: true,
      message: "Tạo section thành công",
      data: section,
    });
  } catch (error) {
    await t.rollback();
    console.error("[CREATE_SECTION ERROR]", {
      message: error.message,
      stack: error.stack,
      body: req.body,
      files: req.files,
    });

    return res.status(500).json({
      success: false,
      message: "Lỗi khi tạo section",
      error: error.message,
    });
  }
}


  static async updateSection(req, res) {
  const t = await HomeSection.sequelize.transaction();
  try {
    const { slug } = req.params;
    const section = await HomeSection.findOne({
      where: { slug },
      transaction: t,
    });

    if (!section) {
      await t.rollback();
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy section",
      });
    }

    const { title, type, orderIndex, isActive } = req.body;
    const { parsedProductIds, parsedBannersMeta } = req.parsedBody;

    const updateData = { title, type, isActive };

    // ✅ Đổi slug nếu title đổi
    if (title && title !== section.title) {
      const newSlug = slugify(title, {
        lower: true,
        strict: true,
        remove: /[*+~.()'"!:@]/g,
      });

      const existed = await HomeSection.findOne({
        where: { slug: newSlug, id: { [Op.ne]: section.id } },
        transaction: t,
      });

      if (existed) {
        await t.rollback();
        return res.status(409).json({
          success: false,
          field: "title",
          message: "Tiêu đề đã tồn tại.",
        });
      }

      updateData.slug = newSlug;
    }

    // ✅ Đổi orderIndex nếu khác
    if (orderIndex !== undefined && orderIndex !== section.orderIndex) {
      const existing = await HomeSection.findOne({
        where: { orderIndex, id: { [Op.ne]: section.id } },
        transaction: t,
      });

      if (existing) {
        await HomeSection.update(
          { orderIndex: HomeSection.sequelize.literal("orderIndex + 1") },
          {
            where: {
              orderIndex: { [Op.gte]: orderIndex },
              id: { [Op.ne]: section.id },
            },
            transaction: t,
          }
        );
      }

      updateData.orderIndex = orderIndex;
    }

    // ✅ Update section
    await section.update(updateData, { transaction: t });

    if (parsedProductIds) {
      await section.setProducts(parsedProductIds, { transaction: t });
    }

    // ✅ Clear banners cũ
    await HomeSectionBanner.destroy({
      where: { homeSectionId: section.id },
      transaction: t,
    });

    const files = req.files || [];

    if (Array.isArray(parsedBannersMeta) && parsedBannersMeta.length > 0) {
      const toCreate = [];
      let fileIndex = 0;

      for (const meta of parsedBannersMeta) {
        let imageUrl = meta.existingImageUrl || null;

        if (meta.hasNewFile && files[fileIndex]) {
          imageUrl = files[fileIndex].path || files[fileIndex].url;
          fileIndex++;
        }

        // ✅ CHUẨN HÓA linkValue
        let finalLinkValue = "";
        if (typeof meta.linkValue === "object" && meta.linkValue !== null) {
          finalLinkValue = meta.linkValue.slug || String(meta.linkValue.id);
        } else {
          finalLinkValue = meta.linkValue || "";
        }

        if (imageUrl) {
          toCreate.push({
            homeSectionId: section.id,
            imageUrl,
            linkType: meta.linkType || "url",
            linkValue: finalLinkValue,
            sortOrder: meta.sortOrder ?? toCreate.length,
          });
        }
      }

      if (toCreate.length > 0) {
        await HomeSectionBanner.bulkCreate(toCreate, { transaction: t });
      }
    }

    await t.commit();
    return res.json({
      success: true,
      message: "Cập nhật section thành công",
      data: section,
    });
  } catch (error) {
    await t.rollback();
    console.error("[UPDATE_SECTION ERROR]", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi cập nhật section",
      error: error.message,
    });
  }
}


  static async deleteSection(req, res) {
    const t = await HomeSection.sequelize.transaction();
    try {
      const section = await HomeSection.findByPk(req.params.id, {
        transaction: t,
      });
      if (!section) {
        await t.rollback();
        return res
          .status(404)
          .json({ success: false, message: "Không tìm thấy section" });
      }

      await section.setProducts([], { transaction: t });
      await HomeSectionBanner.destroy({
        where: { homeSectionId: section.id },
        transaction: t,
      });
      await section.destroy({ transaction: t });

      await t.commit();
      return res.json({ success: true, message: "Xoá section thành công" });
    } catch (error) {
      await t.rollback();
      console.error("[DELETE_SECTION ERROR]", error);
      return res
        .status(500)
        .json({
          success: false,
          message: "Lỗi xoá section",
          error: error.message,
        });
    }
  }

static async getAllProducts(req, res) {
  try {
    const { search = '' } = req.query;

    const whereClause = {
      deletedAt: null,
      isActive: true, // 👈 chỉ lấy sản phẩm đang hoạt động
      ...(search && { name: { [Op.like]: `%${search}%` } })
    };

    const products = await Product.findAll({
      where: whereClause,
      order: [['updatedAt', 'DESC']],
      attributes: ['id', 'name', 'thumbnail']
    });

    return res.json({ success: true, data: products });
  } catch (error) {
    console.error('[getAllProducts]', error);
    return res.status(500).json({ success: false, message: 'Lỗi khi lấy danh sách sản phẩm', error: error.message });
  }
}
static async getAllCategories(req, res) {
  try {
    const { search = '' } = req.query;

    const whereClause = {
      deletedAt: null,
      isActive: true,
      ...(search && { name: { [Op.like]: `%${search}%` } })
    };

    // Lấy về flat list dưới dạng plain objects
    const categories = await Category.findAll({
      where: whereClause,
      order: [['sortOrder', 'ASC']],
      attributes: ['id', 'name', 'slug', 'thumbnail', 'parentId'],
      raw: true
    });

    // Xây tree rồi trả về
    const treeList = buildCategoryTree(categories);
    return res.json({ success: true, data: treeList });
  } catch (error) {
    console.error('[getAllCategories]', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi khi lấy danh sách danh mục',
      error: error.message
    });
  }
}



  static async updateOrderIndexes(req, res) {
    const t = await HomeSection.sequelize.transaction();
    try {
      const { orderedItems = [] } = req.body;
      if (!Array.isArray(orderedItems)) {
        await t.rollback();
        return res
          .status(400)
          .json({ success: false, message: "Danh sách không hợp lệ." });
      }

      for (const item of orderedItems) {
        await HomeSection.update(
          { orderIndex: item.orderIndex },
          { where: { id: item.id }, transaction: t }
        );
      }

      await t.commit();
      return res.json({ success: true, message: "Cập nhật thứ tự thành công" });
    } catch (error) {
      await t.rollback();
      console.error("[updateOrderIndexes]", error);
      return res
        .status(500)
        .json({
          success: false,
          message: "Lỗi server khi cập nhật thứ tự",
          error: error.message,
        });
    }
  }
}

module.exports = SectionController;
