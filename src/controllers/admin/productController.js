const {
  Product,
  Sku,
  ProductMedia,
  ProductVariant,
  SkuVariantValue,
  Category,
  Brand,
  Variant,
  VariantValue,
  ProductInfo,
  ProductSpec,
  CartItem,
  WishlistItem,
  OrderItem,
} = require("../../models");

const slugify = require("slugify");
const { Op } = require("sequelize");

class ProductController {
static async create(req, res) {
  const t = await Product.sequelize.transaction();
  try {
    // 1) Lấy dữ liệu đầu vào
    const {
      name,
      badge,
      description,
      shortDescription,
      thumbnail,
      hasVariants,
      orderIndex,
      isActive,
      categoryId,
      brandId,
      variants = [],
      skus = [],
      infoContent,
      specs = []
    } = req.product;

    // 2) Tạo slug duy nhất
    const baseSlug = slugify(name, { lower: true, strict: true });
    let slug = baseSlug, suffix = 1;
    while (await Product.findOne({ where: { slug } })) {
      slug = `${baseSlug}-${suffix++}`;
    }

    // 3) Tính orderIndex
    let finalOrderIndex = orderIndex;
    if (finalOrderIndex == null || finalOrderIndex === "") {
      const maxOrder = await Product.findOne({
        where: { categoryId },
        order: [["orderIndex", "DESC"]],
        paranoid: false
      });
      finalOrderIndex = maxOrder ? maxOrder.orderIndex + 1 : 0;
    } else {
      await Product.increment("orderIndex", {
        by: 1,
        where: {
          categoryId,
          orderIndex: { [Op.gte]: finalOrderIndex },
          deletedAt: null
        },
        transaction: t
      });
    }

    // 4) Xử lý thumbnail upload
    const uploadedThumb = req.files?.find(f => f.fieldname === "thumbnail");
    const finalThumb = uploadedThumb?.path || thumbnail;

    // 5) Tạo product
    const product = await Product.create({
      name,
      slug,
      description,
      shortDescription,
      thumbnail: finalThumb,
      orderIndex: finalOrderIndex,
      isActive,
      hasVariants,
      categoryId,
      badge,
      brandId
    }, { transaction: t });

    // 6) Helper cho SKU & file type
    const generateSkuCode = async (prefix = "SKU") => {
      let code, exists = true;
      while (exists) {
        code = `${prefix}-${Math.floor(100000 + Math.random() * 900000)}`;
        exists = await Sku.findOne({ where: { skuCode: code } });
      }
      return code;
    };
    const getFileType = url => {
      const ext = url.split(".").pop().toLowerCase();
      return ["mp4","mov","avi","webm"].includes(ext) ? "video" : "image";
    };

    // 7) Trường hợp không có biến thể: chỉ 1 SKU
    if (!hasVariants && skus.length > 0) {
      const sku = skus[0];
      const newSku = await Sku.create({
        skuCode: sku.skuCode || await generateSkuCode(product.slug.toUpperCase()),
        productId: product.id,
        price: sku.price > 0 ? sku.price : null,                            // <-- SỬA ĐỔI
        originalPrice: sku.originalPrice > 0 ? sku.originalPrice : null,    // <-- SỬA ĐỔI
        stock: sku.stock,
        height: sku.height || 0,
        width:  sku.width  || 0,
        length: sku.length || 0,
        weight: sku.weight || 0,
        isActive: true
      }, { transaction: t });

      for (const url of sku.mediaUrls || []) {
        await ProductMedia.create({
          skuId: newSku.id,
          mediaUrl: url,
          type: getFileType(url)
        }, { transaction: t });
      }
      for (const f of req.files?.filter(f => f.fieldname === "media_sku_0") || []) {
        await ProductMedia.create({
          skuId: newSku.id,
          mediaUrl: f.path,
          type: getFileType(f.filename)
        }, { transaction: t });
      }
    }

    // 8) Trường hợp có biến thể
    if (hasVariants) {
      for (const v of variants) {
        await ProductVariant.findOrCreate({
          where: { productId: product.id, variantId: v.id },
          defaults: { productId: product.id, variantId: v.id },
          transaction: t
        });
      }
      for (let i = 0; i < skus.length; i++) {
        const sku = skus[i];
        const createdSku = await Sku.create({
          productId: product.id,
          skuCode: sku.skuCode || await generateSkuCode(product.slug.toUpperCase()),
          price: sku.price > 0 ? sku.price : null,                            // <-- SỬA ĐỔI
          originalPrice: sku.originalPrice > 0 ? sku.originalPrice : null,    // <-- SỬA ĐỔI
          stock: sku.stock,
          height: sku.height || 0,
          width:  sku.width  || 0,
          length: sku.length || 0,
          weight: sku.weight || 0,
          isActive: true
        }, { transaction: t });

        for (const url of sku.mediaUrls || []) {
          await ProductMedia.create({
            skuId: createdSku.id,
            mediaUrl: url,
            type: getFileType(url)
          }, { transaction: t });
        }
        for (const f of req.files?.filter(f => f.fieldname === `media_sku_${i}`) || []) {
          await ProductMedia.create({
            skuId: createdSku.id,
            mediaUrl: f.path,
            type: getFileType(f.filename)
          }, { transaction: t });
        }
        for (const valId of sku.variantValueIds || []) {
          await SkuVariantValue.create({
            skuId: createdSku.id,
            variantValueId: valId
          }, { transaction: t });
        }
      }
    }

    // 9) Lưu ProductInfo nếu có
    if (infoContent) {
      await ProductInfo.create({
        productId: product.id,
        content:   infoContent
      }, { transaction: t });
    }

    // 10) Lưu specs
    for (const spec of specs) {
      if (spec.key && spec.value) {
        await ProductSpec.create({
          productId:  product.id,
          specKey:    spec.key,
          specValue:  spec.value,
          specGroup:  spec.specGroup || null,
          sortOrder:  spec.sortOrder || 0
        }, { transaction: t });
      }
    }

    // 11) Commit & trả về
    await t.commit();
    return res.status(201).json({
      message: "Thêm sản phẩm thành công",
      data: product
    });

  } catch (error) {
    await t.rollback();
    console.error("Lỗi tạo sản phẩm:", error);
    return res.status(500).json({
      message: "Lỗi server",
      error:   error.message
    });
  }
}
static async update(req, res) {
  const t = await Product.sequelize.transaction();
  try {
    const { slug: slugParam } = req.params;

    if (!req.body.product) {
      return res.status(400).json({ message: "Thiếu dữ liệu sản phẩm" });
    }

    let parsedProduct;
    try {
      parsedProduct = JSON.parse(req.body.product);
    } catch (err) {
      return res.status(400).json({ message: "Dữ liệu sản phẩm không hợp lệ (JSON lỗi)" });
    }

    const {
      name,
      description,
      shortDescription,
      thumbnail,
      badge,
      orderIndex,
      isActive,
      categoryId,
      brandId,
      hasVariants,
      skus = [],
      variants = [],
      infoContent = "",
      specs = [],
    } = parsedProduct;

    const product = await Product.findOne({ where: { slug: slugParam } });
    if (!product) return res.status(404).json({ message: "Không tìm thấy sản phẩm" });

    const productId = product.id;

    // Xử lý slug nếu đổi tên
    let newSlug = product.slug;
    if (name && name !== product.name) {
      const baseSlug = slugify(name, { lower: true, strict: true });
      newSlug = baseSlug;
      let suffix = 1;
      while (await Product.findOne({ where: { slug: newSlug, id: { [Op.ne]: productId } } })) {
        newSlug = `${baseSlug}-${suffix++}`;
      }
    }

    // Xử lý thứ tự
    if (orderIndex !== undefined && orderIndex !== product.orderIndex) {
      if (orderIndex > product.orderIndex) {
        await Product.decrement("orderIndex", {
          by: 1,
          where: { orderIndex: { [Op.gt]: product.orderIndex, [Op.lte]: orderIndex } },
          transaction: t
        });
      } else {
        await Product.increment("orderIndex", {
          by: 1,
          where: { orderIndex: { [Op.gte]: orderIndex, [Op.lt]: product.orderIndex } },
          transaction: t
        });
      }
    }

    // Thumbnail
    const uploadedThumbnail = req.files?.find(f => f.fieldname === "thumbnail");
    const finalThumbnail = uploadedThumbnail?.path || thumbnail || product.thumbnail;

    await product.update({
      name, slug: newSlug, description, shortDescription,
      thumbnail: finalThumbnail, orderIndex, isActive,
      hasVariants, categoryId, brandId, badge,
    }, { transaction: t });

    // Cập nhật lại các biến thể nếu có
    await ProductVariant.destroy({ where: { productId }, transaction: t });
    for (const variant of variants) {
      await ProductVariant.create({ productId, variantId: variant.id }, { transaction: t });
    }

    // SKU xử lý thông minh
    const existingSkus = await Sku.findAll({ where: { productId }, transaction: t });
    const existingMap = new Map(existingSkus.map(s => [s.id, s]));
    const seenSkuIds = new Set();

    const generateSkuCode = async (prefix = "SKU") => {
      let code, exists = true;
      while (exists) {
        code = `${prefix}-${Math.floor(100000 + Math.random() * 900000)}`;
        exists = await Sku.findOne({ where: { skuCode: code } });
      }
      return code;
    };
    const getFileType = url => {
      const ext = url.split(".").pop().toLowerCase();
      return ["mp4","mov","avi","webm"].includes(ext) ? "video" : "image";
    };

    for (let i = 0; i < skus.length; i++) {
      const sku = skus[i];
      let skuId = sku.id;

      if (skuId && existingMap.has(skuId)) {
        // ✅ Update SKU
        await Sku.update({
          skuCode: sku.skuCode || existingMap.get(skuId).skuCode,
          price: sku.price > 0 ? sku.price : null,
          originalPrice: sku.originalPrice > 0 ? sku.originalPrice : null,
          stock: sku.stock,
          height: sku.height || 0,
          width:  sku.width  || 0,
          length: sku.length || 0,
          weight: sku.weight || 0,
          isActive: true
        }, { where: { id: skuId }, transaction: t });

        seenSkuIds.add(skuId);

        // Clear & tái tạo media, variantValue
        await ProductMedia.destroy({ where: { skuId }, transaction: t });
        await SkuVariantValue.destroy({ where: { skuId }, transaction: t });

        for (const url of sku.mediaUrls || []) {
          await ProductMedia.create({ skuId, mediaUrl: url, type: getFileType(url) }, { transaction: t });
        }
        for (const f of req.files?.filter(f => f.fieldname === `media_sku_${i}`) || []) {
          await ProductMedia.create({ skuId, mediaUrl: f.path, type: getFileType(f.filename) }, { transaction: t });
        }
        for (const valId of sku.variantValueIds || []) {
          await SkuVariantValue.create({ skuId, variantValueId: valId }, { transaction: t });
        }
      } else {
        // ✅ Create SKU mới
        const createdSku = await Sku.create({
          productId,
          skuCode: sku.skuCode || await generateSkuCode(newSlug.toUpperCase()),
          price: sku.price > 0 ? sku.price : null,
          originalPrice: sku.originalPrice > 0 ? sku.originalPrice : null,
          stock: sku.stock,
          height: sku.height || 0,
          width:  sku.width  || 0,
          length: sku.length || 0,
          weight: sku.weight || 0,
          isActive: true
        }, { transaction: t });

        skuId = createdSku.id;
        seenSkuIds.add(skuId);

        for (const url of sku.mediaUrls || []) {
          await ProductMedia.create({ skuId, mediaUrl: url, type: getFileType(url) }, { transaction: t });
        }
        for (const f of req.files?.filter(f => f.fieldname === `media_sku_${i}`) || []) {
          await ProductMedia.create({ skuId, mediaUrl: f.path, type: getFileType(f.filename) }, { transaction: t });
        }
        for (const valId of sku.variantValueIds || []) {
          await SkuVariantValue.create({ skuId, variantValueId: valId }, { transaction: t });
        }
      }
    }

    // Xoá SKU cũ không còn
    const skuIdsToDelete = [...existingMap.keys()].filter(id => !seenSkuIds.has(id));
    await ProductMedia.destroy({ where: { skuId: { [Op.in]: skuIdsToDelete } }, transaction: t });
    await SkuVariantValue.destroy({ where: { skuId: { [Op.in]: skuIdsToDelete } }, transaction: t });
    await Sku.destroy({ where: { id: skuIdsToDelete }, transaction: t });

    // Product Info
    await ProductInfo.destroy({ where: { productId }, transaction: t });
    if (infoContent) {
      await ProductInfo.create({ productId, content: infoContent }, { transaction: t });
    }

    // Specs
    await ProductSpec.destroy({ where: { productId }, transaction: t });
    for (const spec of specs) {
      if (spec.key && spec.value) {
        await ProductSpec.create({
          productId,
          specKey: spec.key,
          specValue: spec.value,
          specGroup: spec.specGroup || null,
          sortOrder: spec.sortOrder || 0
        }, { transaction: t });
      }
    }

    await t.commit();
    return res.json({ message: "Cập nhật sản phẩm thành công", data: product });

  } catch (error) {
    await t.rollback();
    console.error("Lỗi update product:", error);
    return res.status(500).json({ message: "Lỗi server", error: error.message });
  }
}

  static async getAll(req, res) {
    try {
      const {
        filter = "all",
        search = "",
        categoryId,
        page = 1,
        limit = 10,
      } = req.query;

      const offset = (page - 1) * limit;
      const whereClause = {};

      let paranoid = true;

      if (filter === "active") {
        whereClause.isActive = true;
      } else if (filter === "inactive") {
        whereClause.isActive = false;
      } else if (filter === "deleted") {
        whereClause.deletedAt = { [Op.ne]: null };
        paranoid = false;
      }

      if (search) {
        const searchCondition = { [Op.like]: `%${search}%` };
        whereClause[Op.or] = [
          { name: searchCondition },
          { slug: searchCondition },
        ];
      }

      if (categoryId) {
        whereClause.categoryId = categoryId;
      }

      const { rows: products, count: totalItems } =
        await Product.findAndCountAll({
          where: whereClause,
          include: [
            {
              model: Category,
              as: "category",
              attributes: ["id", "name"],
            },
          ],
          attributes: {
            include: ["deletedAt"],
          },
          order: [["orderIndex", "ASC"]],
          offset: parseInt(offset),
          limit: parseInt(limit),
          paranoid,
        });

      const totalPages = Math.ceil(totalItems / limit);

      // Đếm số lượng theo từng loại
      const [activeCount, inactiveCount, deletedCount] = await Promise.all([
        Product.count({ where: { isActive: true, deletedAt: null } }),
        Product.count({ where: { isActive: false, deletedAt: null } }),
        Product.count({
          where: { deletedAt: { [Op.ne]: null } },
          paranoid: false,
        }),
      ]);

      res.json({
        data: products,
        pagination: {
          totalItems,
          totalPages,
          currentPage: parseInt(page),
          limit: parseInt(limit),
        },
        counts: {
          all: activeCount + inactiveCount,
          active: activeCount,
          inactive: inactiveCount,
          deleted: deletedCount,
        },
      });
    } catch (error) {
      console.error("Lỗi getAll:", error);
      res.status(500).json({ message: "Lỗi server", error: error.message });
    }
  }

  static async getCategoryTree(req, res) {
    try {
      const categories = await Category.findAll({
        where: {
          isActive: true,
          isDefault: false,
        },
        raw: true,
      });

      // Hàm đệ quy để xây cây danh mục
      const buildTree = (parentId = null) => {
        return categories
          .filter((cat) => cat.parentId === parentId)
          .map((cat) => ({
            ...cat,
            children: buildTree(cat.id),
          }));
      };

      const tree = buildTree();
      res.json({ data: tree });
    } catch (error) {
      console.error("Lỗi lấy danh sách danh mục:", error);
      res.status(500).json({ message: "Lỗi server", error: error.message });
    }
  }
  static async getBrandList(req, res) {
    try {
      const brands = await Brand.findAll({
        where: {
          isActive: true,
        },
        raw: true,
        order: [["name", "ASC"]],
        attributes: ["id", "name", "slug"],
      });

      res.json({ data: brands });
    } catch (error) {
      console.error("Lỗi lấy danh sách thương hiệu:", error);
      res.status(500).json({ message: "Lỗi server", error: error.message });
    }
  }
  static async softDelete(req, res) {
    try {
      const { id } = req.params;
      const product = await Product.findByPk(id);
      if (!product)
        return res.status(404).json({ message: "Không tìm thấy sản phẩm" });

      await product.destroy(); 
      res.json({ message: "Đã xóa sản phẩm tạm thời" });
    } catch (error) {
      res.status(500).json({ message: "Lỗi server", error: error.message });
    }
  }




  static async getById(req, res) {
    try {
      // 1) Lấy slug từ URL thay vì id
      const { slug: slugParam } = req.params;

      // 2) Tìm product theo slug, bao gồm luôn các quan hệ cần thiết
      const product = await Product.findOne({
        where: { slug: slugParam },
        include: [
          { model: ProductInfo, as: "productInfo", attributes: ["content"] },
          {
            model: ProductSpec,
            as: "specs",
            attributes: ["specKey", "specValue", "specGroup", "sortOrder"], // Bổ sung specGroup
          },
          {
            model: Sku,
            as: "skus",
            include: [
              {
                model: ProductMedia,
                as: "ProductMedia",
                attributes: ["mediaUrl", "type"],
                required: false,
              },
              {
                model: SkuVariantValue,
                as: "variantValues",
                attributes: ["variantValueId"],
              },
            ],
          },
          {
            model: ProductVariant,
            as: "productVariants",
            paranoid: false,
            include: [
              {
                model: Variant,
                as: "variant",
                attributes: ["id", "name"],
                paranoid: false,
                include: [
                  {
                    model: VariantValue,
                    as: "values",
                    attributes: ["id", "value"],
                    paranoid: false,
                  },
                ],
              },
            ],
          },
        ],
      });

      if (!product) {
        return res.status(404).json({ message: "Không tìm thấy sản phẩm" });
      }

      
      const infoContent = product.productInfo?.content || "";

      
      const skus = await Promise.all(
        (product.skus || []).map(async (sku) => {
       
          const variantMappings = await SkuVariantValue.findAll({
            where: { skuId: sku.id },
            include: [
              {
                model: VariantValue,
                as: "variantValue",
                attributes: ["id", "variantId"],
                paranoid: false,
              },
            ],
          });

          const selectedValues = {};
          const variantValueIds = [];

          for (const mapping of variantMappings) {
            const v = mapping.variantValue;
            if (v) {
              selectedValues[v.variantId] = v.id;
              variantValueIds.push(v.id);
            }
          }

          return {
            id: sku.id,
            skuCode: sku.skuCode,
            originalPrice: sku.originalPrice,
            price: sku.price,
            stock: sku.stock,
            height: sku.height,
            width: sku.width,
            length: sku.length,
            weight: sku.weight,
            description: sku.description,
            mediaUrls: sku.ProductMedia?.map((m) => m.mediaUrl) || [],
            variantValueIds,
            selectedValues,
          };
        })
      );
      const usedValueIds = new Set();
      for (const sku of skus) {
        for (const valId of sku.variantValueIds || []) {
          usedValueIds.add(valId);
        }
      }
      const variantsMap = new Map();

      (product.productVariants || []).forEach((pv) => {
        const variantId = pv.variant?.id;
        const variantName = pv.variant?.name;
        const allValues = pv.variant?.values || [];
        const filteredValues = allValues.filter((v) =>
          usedValueIds.has(v.id)
        );

        if (variantId && !variantsMap.has(variantId)) {
          variantsMap.set(variantId, {
            id: variantId,
            name: variantName,
            values: filteredValues,
          });
        }
      });

      const variants = Array.from(variantsMap.values());
      return res.json({
        data: {
          id: product.id,
          slug: product.slug,
          name: product.name,
          description: product.description,
          shortDescription: product.shortDescription,
          thumbnail: product.thumbnail,
          orderIndex: product.orderIndex,
          isActive: product.isActive,
          badge: product.badge,

          hasVariants: product.hasVariants,
          categoryId: product.categoryId,
          brandId: product.brandId,
          infoContent,
          variants,
          skus,
          specs:
            product.specs?.map((s) => ({
              key: s.specKey,
              value: s.specValue,
              specGroup: s.specGroup,
              sortOrder: s.sortOrder,
            })) || [],
        },
      });
    } catch (error) {
      console.error("Lỗi lấy chi tiết sản phẩm:", error);
      return res
        .status(500)
        .json({ message: "Lỗi server", error: error.message });
    }
  }
  static async softDeleteMany(req, res) {
    try {
      const { ids = [] } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "Danh sách ID không hợp lệ" });
      }

      await Product.destroy({
        where: { id: ids },
      });

      res.json({ message: "Đã xoá tạm thời các sản phẩm" });
    } catch (error) {
      res.status(500).json({ message: "Lỗi server", error: error.message });
    }
  }

  static async restore(req, res) {
    try {
      const { id } = req.params;

      const product = await Product.findOne({
        where: { id },
        paranoid: false,
      });

      if (!product || !product.deletedAt) {
        return res
          .status(404)
          .json({ message: "Không tìm thấy sản phẩm đã xoá" });
      }

      await product.restore();
      res.json({ message: "Đã khôi phục sản phẩm" });
    } catch (error) {
      res.status(500).json({ message: "Lỗi server", error: error.message });
    }
  }

  static async restoreMany(req, res) {
    try {
      const { ids = [] } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "Danh sách ID không hợp lệ" });
      }

      await Product.restore({
        where: { id: ids },
      });

      res.json({ message: "Đã khôi phục các sản phẩm" });
    } catch (error) {
      res.status(500).json({ message: "Lỗi server", error: error.message });
    }
  }

  static async forceDelete(req, res) {
    const t = await Product.sequelize.transaction();
    try {
      const { id } = req.params;

      const product = await Product.findByPk(id, {
        paranoid: false,
        transaction: t,
      });
      if (!product)
        return res.status(404).json({ message: "Không tìm thấy sản phẩm." });

      const skus = await Sku.findAll({
        where: { productId: id },
        attributes: ["id"],
        raw: true,
        transaction: t,
      });
      const skuIds = skus.map((s) => s.id);

      const usedInOrder = await OrderItem.count({
  where: { skuId: skuIds },
  transaction: t,
});
if (usedInOrder > 0) {
  await t.rollback();
  return res.status(400).json({
    message:
      "Không thể xoá vĩnh viễn vì sản phẩm đã từng xuất hiện trong đơn hàng.\n" +
      "Hãy giữ lại để bảo toàn lịch sử.",
  });
}


      const opts = { force: true, transaction: t };

      await CartItem.destroy({ where: { skuId: skuIds }, ...opts });
      await WishlistItem.destroy({ where: { productId: id }, ...opts });

      await ProductMedia.destroy({ where: { skuId: skuIds }, ...opts });
      await SkuVariantValue.destroy({ where: { skuId: skuIds }, ...opts });
      await ProductSpec.destroy({ where: { productId: id }, ...opts });
      await ProductInfo.destroy({ where: { productId: id }, ...opts });
      await ProductVariant.destroy({ where: { productId: id }, ...opts });

      await Sku.destroy({ where: { id: skuIds }, ...opts });
      await product.destroy({ force: true, transaction: t });

      await t.commit();
      return res.json({ message: "Đã xoá vĩnh viễn sản phẩm" });
    } catch (err) {
      if (!t.finished) await t.rollback();
      console.error("Lỗi forceDelete:", err);
      return res
        .status(500)
        .json({ message: " Lỗi server", error: err.message });
    }
  }
static async forceDeleteMany(req, res) {
    const t = await Product.sequelize.transaction();
    try {
      const { ids = [] } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "Danh sách ID không hợp lệ" });
      }

      const skus = await Sku.findAll({
        where: { productId: ids },
        attributes: ["id", "productId"],
        raw: true,
        transaction: t,
      });

      const skuIds = skus.map((s) => s.id);

      const orderCnt = await OrderItem.findAll({
        where: { skuId: skuIds },
        attributes: ["skuId"],
        raw: true,
        transaction: t,
      });

      const blockedSkuIds = new Set(orderCnt.map((o) => o.skuId));
      const blockedProductIds = new Set(
        skus.filter((s) => blockedSkuIds.has(s.id)).map((s) => s.productId)
      );

      const deletableProductIds = ids.filter(
        (pid) => !blockedProductIds.has(pid)
      );
      if (deletableProductIds.length === 0) {
        return res.status(400).json({
          message:
            "Không thể xoá vì tất cả sản phẩm đã xuất hiện trong đơn hàng.\n" +
            "Hãy giữ lại để bảo toàn lịch sử.",
        });
      }

      const deletableSkuIds = skus
        .filter((s) => deletableProductIds.includes(s.productId))
        .map((s) => s.id);

    
      await Promise.all([
        CartItem.destroy({
          where: { skuId: deletableSkuIds },
          force: true,
          transaction: t,
        }),
        +(await WishlistItem.destroy({
          where: { productId: deletableProductIds },
          force: true,
          transaction: t,
        })),
        ProductMedia.destroy({
          where: { skuId: deletableSkuIds },
          force: true,
          transaction: t,
        }),
        SkuVariantValue.destroy({
          where: { skuId: deletableSkuIds },
          force: true,
          transaction: t,
        }),
        ProductSpec.destroy({
          where: { productId: deletableProductIds },
          force: true,
          transaction: t,
        }),
        ProductInfo.destroy({
          where: { productId: deletableProductIds },
          force: true,
          transaction: t,
        }),
        ProductVariant.destroy({
          where: { productId: deletableProductIds },
          force: true,
          transaction: t,
        }),
        Sku.destroy({
          where: { id: deletableSkuIds },
          force: true,
          transaction: t,
        }),
        Product.destroy({
          where: { id: deletableProductIds },
          force: true,
          transaction: t,
        }),
      ]);

      await t.commit();

      const msgOk = `Đã xoá vĩnh viễn ${deletableProductIds.length} sản phẩm.`;
      const msgBad = blockedProductIds.size
        ? `\nKhông xoá ${blockedProductIds.size} sản phẩm vì đã có trong đơn hàng.`
        : "";
      return res.json({ message: msgOk + msgBad });
    } catch (error) {
      if (!t.finished) await t.rollback();
      console.error("forceDeleteMany error:", error);
      return res
        .status(500)
        .json({ message: "Lỗi server", error: error.message });
    }
  }
  static async updateOrderIndexBulk(req, res) {
    const t = await Product.sequelize.transaction();
    try {
      const { items } = req.body;

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "Danh sách không hợp lệ" });
      }

      for (const item of items) {
        await Product.update(
          { orderIndex: item.orderIndex },
          { where: { id: item.id }, transaction: t }
        );
      }

      await t.commit();
      return res.json({ message: "Cập nhật thứ tự thành công!" });
    } catch (error) {
      if (!t.finished) await t.rollback();
      console.error("updateOrderIndexBulk LỖI:", error);
      return res
        .status(500)
        .json({ message: "Lỗi cập nhật thứ tự", error: error.message });
    }
  }
  
  
}

module.exports = ProductController;
