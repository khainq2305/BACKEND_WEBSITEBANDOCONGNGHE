const {
  HomeSection,
  HomeSectionBanner,
  Product,
  Sku,
  
  Category,
  HomeSectionCategory,
  ProductHomeSection,
} = require("../../models");
const { Op } = require("sequelize");
const slugify = require("slugify");

function buildCategoryTree(list) {
  const map = {},
    roots = [];

  list.forEach((c) => (map[c.id] = { ...c, children: [], level: 0 }));

  list.forEach((c) => {
    if (c.parentId && map[c.parentId]) {
      map[c.parentId].children.push(map[c.id]);
      map[c.id].level = map[c.parentId].level + 1;
    } else {
      roots.push(map[c.id]);
    }
  });

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
            attributes: ["id"],
            through: { attributes: [] }, // nếu không cần sortOrder
          },
          {
            model: HomeSectionBanner,
            as: "banners",
            attributes: ["id"],
          },
          {
            model: Category,
            as: "linkedCategories",
            attributes: ["id"], // ✅ THÊM VÔ ĐÂY để đếm
            through: { attributes: [] },
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
      return res.status(500).json({
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
          {
            model: Category,
            as: "linkedCategories",
            attributes: ["id", "name", "slug", "parentId"],
            through: { attributes: ["sortOrder"] },
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
    const parsedCategoryIds = JSON.parse(req.body.categoryIds || "[]");
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
        message: "Tiêu đề đã tồn tại.",
      });
    }

    if (orderIndex !== null) {
      const conflict = await HomeSection.findOne({
        where: { orderIndex },
        transaction: t,
      });
      if (conflict) {
        await HomeSection.increment(
          { orderIndex: 1 },
          {
            where: { orderIndex: { [Op.gte]: orderIndex } },
            transaction: t,
          }
        );
      }
    }

    const newSection = await HomeSection.create(
      { title, slug, type, orderIndex, isActive },
      { transaction: t }
    );

    if (parsedProductIds.length > 0) {
      const productAssociations = parsedProductIds.map((id, index) => ({
        homeSectionId: newSection.id,
        productId: id,
        sortOrder: index,
      }));
      await ProductHomeSection.bulkCreate(productAssociations, { transaction: t });
    }

    if (parsedCategoryIds.length > 0) {
      const categoryAssociations = parsedCategoryIds.map((id, index) => ({
        homeSectionId: newSection.id,
        categoryId: id,
        sortOrder: index,
      }));
      await HomeSectionCategory.bulkCreate(categoryAssociations, { transaction: t });
    }

    const files = req.files || [];
    if (parsedBannersMeta.length > 0) {
      let bannersToCreate = [];
      let bannerCatesToCreate = [];
      let bannerItemsToCreate = [];

      parsedBannersMeta.forEach((meta, bannerIndex) => {
        let imageUrl = meta.existingImageUrl || null;
        const newFile = files.find(f => f.originalname === meta.fileName);
        if (newFile) imageUrl = newFile.path;
        if (!imageUrl) return;

        let finalLinkValue =
          typeof meta.linkValue === "object" && meta.linkValue !== null
            ? meta.linkValue.slug || String(meta.linkValue.id)
            : meta.linkValue || "";

        bannersToCreate.push({
          homeSectionId: newSection.id,
          imageUrl,
          linkType: meta.linkType || "url",
          linkValue: finalLinkValue,
          sortOrder: Number(meta.sortOrder ?? 0),
          tempIndex: bannerIndex,
        });

        if (meta.categoryId) {
          bannerCatesToCreate.push({
            tempIndex: bannerIndex,
            categoryId: meta.categoryId,
          });
        }

        if (Array.isArray(meta.items) && meta.items.length > 0) {
          meta.items.forEach((item, itemIndex) => {
            bannerItemsToCreate.push({
              tempIndex: bannerIndex,
              imageUrl: item.imageUrl,
              linkType: item.linkType || "url",
              linkValue: item.linkValue || "",
              sortOrder: itemIndex,
            });
          });
        }
      });

      if (bannersToCreate.length > 0) {
        const createdBanners = await HomeSectionBanner.bulkCreate(
          bannersToCreate.map(b => ({
            homeSectionId: b.homeSectionId,
            imageUrl: b.imageUrl,
            linkType: b.linkType,
            linkValue: b.linkValue,
            sortOrder: b.sortOrder,
          })),
          { transaction: t, returning: true }
        );

        const bannerIdMap = {};
        createdBanners.forEach((b, idx) => {
          bannerIdMap[bannersToCreate[idx].tempIndex] = b.id;
        });

        if (bannerCatesToCreate.length > 0) {
          await HomeSectionBannerCate.bulkCreate(
            bannerCatesToCreate.map(c => ({
              bannerId: bannerIdMap[c.tempIndex],
              categoryId: c.categoryId,
            })),
            { transaction: t }
          );
        }

        if (bannerItemsToCreate.length > 0) {
          await HomeSectionBannerItem.bulkCreate(
            bannerItemsToCreate.map(i => ({
              bannerId: bannerIdMap[i.tempIndex],
              imageUrl: i.imageUrl,
              linkType: i.linkType,
              linkValue: i.linkValue,
              sortOrder: i.sortOrder,
            })),
            { transaction: t }
          );
        }
      }
    }

    await t.commit();
    return res.status(201).json({
      success: true,
      message: "Tạo section thành công",
      data: newSection,
    });
  } catch (error) {
    await t.rollback();
    console.error("[CREATE_SECTION ERROR]", error);
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
    const section = await HomeSection.findOne({ where: { slug }, transaction: t });
    if (!section) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Không tìm thấy section' });
    }

    const typeRaw = String(req.body.type || '').trim();
    const key = typeRaw.replace(/\s+/g, '').toLowerCase();
    const TYPE_NORM_MAP = {
      onlyproduct: 'onlyProduct',
      only_product: 'onlyProduct',
      productonly: 'onlyProduct',
      product_only: 'onlyProduct',
      only: 'onlyProduct',
      productwithcategoryfilter: 'productWithCategoryFilter',
      product_with_category_filter: 'productWithCategoryFilter',
      productwithcate: 'productWithCategoryFilter',
      productwithcategory: 'productWithCategoryFilter',
      productwithbanner: 'productWithBanner',
      product_with_banner: 'productWithBanner',
      full: 'full'
    };
    const typeNorm = TYPE_NORM_MAP[key] || typeRaw;
    const TYPE_DB_MAP = {
      onlyProduct: 'productOnly',
      productOnly: 'productOnly',
      productWithBanner: 'productWithBanner',
      productWithCategoryFilter: 'productWithCategoryFilter',
      full: 'full'
    };
    const typeToPersist = TYPE_DB_MAP[typeNorm] || typeRaw;

    const ALLOWED_DB_TYPES = new Set(['productOnly','productWithBanner','productWithCategoryFilter','full']);
    if (!ALLOWED_DB_TYPES.has(typeToPersist)) {
      await t.rollback();
      return res.status(400).json({ success: false, message: `Type không hợp lệ cho DB: "${typeToPersist}".` });
    }

    const title = req.body.title;
    const orderIndex = req.body.orderIndex != null ? Number(req.body.orderIndex) : null;
    const isActive = typeof req.body.isActive === 'boolean' ? req.body.isActive : String(req.body.isActive || '').toLowerCase() === 'true';

    let parsedProductIds = [];
    let parsedCategoryIds = [];
    let parsedBannersMeta = [];
    try { parsedProductIds  = Array.isArray(req.body.productIds) ? req.body.productIds : JSON.parse(req.body.productIds || '[]'); } catch {}
    try { parsedCategoryIds = Array.isArray(req.body.categoryIds) ? req.body.categoryIds : JSON.parse(req.body.categoryIds || '[]'); } catch {}
    try { parsedBannersMeta = Array.isArray(req.body.bannersMetaJson) ? req.body.bannersMetaJson : JSON.parse(req.body.bannersMetaJson || '[]'); } catch {}

    const updateData = { title, type: typeToPersist, isActive, orderIndex };

    if (title && title !== section.title) {
      const newSlug = slugify(title, { lower: true, strict: true, remove: /[*+~.()'"!:@]/g });
      const existed = await HomeSection.findOne({ where: { slug: newSlug, id: { [Op.ne]: section.id } }, transaction: t });
      if (existed) {
        await t.rollback();
        return res.status(409).json({ success: false, field: 'title', message: 'Tiêu đề đã tồn tại.' });
      }
      updateData.slug = newSlug;
    }

    if (orderIndex !== null && Number.isFinite(orderIndex) && orderIndex !== section.orderIndex) {
      const conflict = await HomeSection.findOne({ where: { orderIndex, id: { [Op.ne]: section.id } }, transaction: t });
      if (conflict) {
        await HomeSection.increment({ orderIndex: 1 }, { where: { orderIndex: { [Op.gte]: orderIndex }, id: { [Op.ne]: section.id } }, transaction: t });
      }
    }

    await section.update(updateData, { transaction: t });

    await ProductHomeSection.destroy({ where: { homeSectionId: section.id }, transaction: t });
    if (parsedProductIds.length) {
      const rows = parsedProductIds.map((id, idx) => ({ homeSectionId: section.id, productId: id, sortOrder: idx }));
      await ProductHomeSection.bulkCreate(rows, { transaction: t });
    }

    const ALLOW_CATEGORY_FILTER_TYPES = ['productWithCategoryFilter'];
    await HomeSectionCategory.destroy({ where: { homeSectionId: section.id }, transaction: t });
    if (ALLOW_CATEGORY_FILTER_TYPES.includes(typeNorm) && parsedCategoryIds.length) {
      const rows = parsedCategoryIds.map((id, idx) => ({ homeSectionId: section.id, categoryId: id, sortOrder: idx }));
      await HomeSectionCategory.bulkCreate(rows, { transaction: t });
    }

    const NO_BANNER_TYPES = ['onlyProduct', 'productWithCategoryFilter'];
    await HomeSectionBanner.destroy({ where: { homeSectionId: section.id }, transaction: t });
    if (!NO_BANNER_TYPES.includes(typeNorm) && parsedBannersMeta.length) {
      const files = req.files || [];
      const bannersToCreate = parsedBannersMeta.map((meta) => {
        let imageUrl = meta.existingImageUrl || null;
        const f = files.find((x) => x.originalname === meta.fileName);
        if (f) imageUrl = f.path;
        if (!imageUrl) return null;
        const linkValue = typeof meta.linkValue === 'object' && meta.linkValue ? (meta.linkValue.slug || String(meta.linkValue.id)) : (meta.linkValue || '');
        return { homeSectionId: section.id, imageUrl, linkType: meta.linkType || 'url', linkValue, sortOrder: Number(meta.sortOrder ?? 0) };
      }).filter(Boolean);
      if (bannersToCreate.length) {
        await HomeSectionBanner.bulkCreate(bannersToCreate, { transaction: t });
      }
    }

    await t.commit();
    return res.json({ success: true, message: 'Cập nhật section thành công', data: section });
  } catch (error) {
    await t.rollback();
    return res.status(500).json({ success: false, message: 'Lỗi cập nhật section', error: error.message });
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
      return res.status(500).json({
        success: false,
        message: "Lỗi xoá section",
        error: error.message,
      });
    }
  }

  static async getAllProducts(req, res) {
    try {
      const { search = "", page = 1, limit = 10 } = req.query;
      const pageNum = parseInt(page, 10) || 1;
      const limitNum = parseInt(limit, 10) || 10;
      const offset = (pageNum - 1) * limitNum;

      const whereClause = {
        deletedAt: null,
        isActive: true,
        ...(search && { name: { [Op.like]: `%${search}%` } }),
      };

      const { count, rows: products } = await Product.findAndCountAll({
        where: whereClause,
        offset,
        limit: limitNum,
        order: [["updatedAt", "DESC"]],
        include: [
          {
            model: Sku,
            as: "skus",
            where: { deletedAt: null },
            required: false,
            limit: 1, // Chỉ lấy 1 SKU đại diện
            separate: true,
            order: [["price", "ASC"]], // hoặc ['id', 'ASC']
            attributes: ["price", "originalPrice"],
          },
        ],
        attributes: ["id", "name", "thumbnail"],
        distinct: true,
      });

      const formatted = products.map((product) => {
        const sku = product.skus?.[0]; // Lấy SKU đầu tiên
        return {
          id: product.id,
          name: product.name,
          thumbnail: product.thumbnail,
          price: sku?.price || 0,
          originalPrice: sku?.originalPrice || 0,
        };
      });

      return res.json({
        success: true,
        data: formatted,
        pagination: {
          totalItems: count,
          totalPages: Math.ceil(count / limitNum),
          currentPage: pageNum,
          pageSize: limitNum,
        },
      });
    } catch (error) {
      console.error("[getAllProducts]", error);
      return res.status(500).json({
        success: false,
        message: "Lỗi khi lấy danh sách sản phẩm",
        error: error.message,
      });
    }
  }

  static async getAllCategories(req, res) {
    try {
      const { search = "" } = req.query;

      const whereClause = {
        deletedAt: null,
        isActive: true,
        ...(search && { name: { [Op.like]: `%${search}%` } }),
      };

    
      const categories = await Category.findAll({
        where: whereClause,
        order: [["sortOrder", "ASC"]],
        attributes: ["id", "name", "slug", "thumbnail", "parentId"],
        raw: true,
      });
      const treeList = buildCategoryTree(categories);
      return res.json({ success: true, data: treeList });
    } catch (error) {
      console.error("[getAllCategories]", error);
      return res.status(500).json({
        success: false,
        message: "Lỗi khi lấy danh sách danh mục",
        error: error.message,
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
      return res.status(500).json({
        success: false,
        message: "Lỗi server khi cập nhật thứ tự",
        error: error.message,
      });
    }
  }
}

module.exports = SectionController;
