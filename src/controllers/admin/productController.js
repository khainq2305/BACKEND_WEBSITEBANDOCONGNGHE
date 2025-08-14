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
  ProductView,
  ProductInfo,
  ProductSpec,
  CartItem,
  WishlistItem,
  OrderItem,
} = require("../../models");

const slugify = require("slugify");
const {
  generateImageEmbedding,
} = require("../../services/client/FlaskEmbeddingService");
const dayjs = require("dayjs");
const axios = require("axios");
const FormData = require("form-data");
const { Op, fn, col, literal, Sequelize } = require("sequelize");

const FLASK_EMBED_API_URL = "http://127.0.0.1:8000/embed";

class ProductController {
  static async create(req, res) {
    const t = await Product.sequelize.transaction();
    try {
      const {
        name,
        badge,
        badgeImage,
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
        specs = [],
      } = req.product;

      const baseSlug = slugify(name, { lower: true, strict: true });
      let slug = baseSlug,
        suffix = 1;
      while (await Product.findOne({ where: { slug } })) {
        slug = `${baseSlug}-${suffix++}`;
      }

      let finalOrderIndex = orderIndex;
      if (finalOrderIndex == null || finalOrderIndex === "") {
        const maxOrder = await Product.findOne({
          where: { categoryId },
          order: [["orderIndex", "DESC"]],
          paranoid: false,
        });
        finalOrderIndex = maxOrder ? maxOrder.orderIndex + 1 : 0;
      } else {
        await Product.increment("orderIndex", {
          by: 1,
          where: {
            categoryId,
            orderIndex: { [Op.gte]: finalOrderIndex },
            deletedAt: null,
          },
          transaction: t,
        });
      }

      const uploadedThumb = req.files?.find((f) => f.fieldname === "thumbnail");
      const finalThumb = uploadedThumb?.path || thumbnail;
      const uploadedBadge = req.files?.find(
        (f) => f.fieldname === "badgeImage"
      );
      const finalBadgeImg = uploadedBadge?.path || badgeImage || null;

      const product = await Product.create(
        {
          name,
          slug,
          description,
          shortDescription,
          thumbnail: finalThumb,
          orderIndex: finalOrderIndex,
          isActive,
          badgeImage: finalBadgeImg,
          hasVariants,
          categoryId,
          badge,
          brandId,
        },
        { transaction: t }
      );

      const generateSkuCode = async (prefix = "SKU") => {
        let code,
          exists = true;
        while (exists) {
          code = `${prefix}-${Math.floor(100000 + Math.random() * 900000)}`;
          exists = await Sku.findOne({ where: { skuCode: code } });
        }
        return code;
      };
      const getFileType = (url) => {
        const ext = url.split(".").pop().toLowerCase();
        return ["mp4", "mov", "avi", "webm"].includes(ext) ? "video" : "image";
      };

      if (!hasVariants && skus.length > 0) {
        const sku = skus[0];
        const newSku = await Sku.create(
          {
            skuCode:
              sku.skuCode ||
              (await generateSkuCode(product.slug.toUpperCase())),
            productId: product.id,
            price: sku.price > 0 ? sku.price : null,
            originalPrice: sku.originalPrice > 0 ? sku.originalPrice : null,
            stock: sku.stock,
            height: sku.height || 0,
            width: sku.width || 0,
            length: sku.length || 0,
            weight: sku.weight || 0,
            isActive: true,
          },
          { transaction: t }
        );

        for (const [order, url] of (sku.mediaUrls || []).entries()) {
          await ProductMedia.create(
            {
              skuId: newSku.id,
              mediaUrl: url,
              type: getFileType(url),
              sortOrder: order,
            },
            { transaction: t }
          );
        }

        for (const f of req.files?.filter(
          (f) => f.fieldname === "media_sku_0"
        ) || []) {
          await ProductMedia.create(
            {
              skuId: newSku.id,
              mediaUrl: f.path,
              type: getFileType(f.filename),
            },
            { transaction: t }
          );
        }
      }

      if (hasVariants) {
        for (const v of variants) {
          await ProductVariant.findOrCreate({
            where: { productId: product.id, variantId: v.id },
            defaults: { productId: product.id, variantId: v.id },
            transaction: t,
          });
        }
        for (let i = 0; i < skus.length; i++) {
          const sku = skus[i];
          const createdSku = await Sku.create(
            {
              productId: product.id,
              skuCode:
                sku.skuCode ||
                (await generateSkuCode(product.slug.toUpperCase())),
              price: sku.price > 0 ? sku.price : null,
              originalPrice: sku.originalPrice > 0 ? sku.originalPrice : null,
              stock: sku.stock,
              height: sku.height || 0,
              width: sku.width || 0,
              length: sku.length || 0,
              weight: sku.weight || 0,
              isActive: true,
            },
            { transaction: t }
          );

          for (const url of sku.mediaUrls || []) {
            await ProductMedia.create(
              {
                skuId: createdSku.id,
                mediaUrl: url,
                type: getFileType(url),
              },
              { transaction: t }
            );
          }
          for (const f of req.files?.filter(
            (f) => f.fieldname === `media_sku_${i}`
          ) || []) {
            await ProductMedia.create(
              {
                skuId: createdSku.id,
                mediaUrl: f.path,
                type: getFileType(f.filename),
              },
              { transaction: t }
            );
          }
          for (const valId of sku.variantValueIds || []) {
            await SkuVariantValue.create(
              {
                skuId: createdSku.id,
                variantValueId: valId,
              },
              { transaction: t }
            );
          }
        }
      }

      if (infoContent) {
        await ProductInfo.create(
          {
            productId: product.id,
            content: infoContent,
          },
          { transaction: t }
        );
      }

      for (const spec of specs) {
        if (spec.key && spec.value) {
          await ProductSpec.create(
            {
              productId: product.id,
              specKey: spec.key,
              specValue: spec.value,
              specGroup: spec.specGroup || null,
              sortOrder: spec.sortOrder || 0,
            },
            { transaction: t }
          );
        }
      }
      t.afterCommit(async () => {
        try {
          const embedding = await generateImageEmbedding(finalThumb);
          if (embedding) {
            await Product.update(
              {
                imageVector: JSON.stringify(embedding),
                imageVectorUrl: finalThumb,
              },
              { where: { id: product.id } }
            );
          }
        } catch (err) {
          console.error(
            "[ProductController] Lỗi tạo vector (post-commit):",
            err
          );
        }
      });
      await t.commit();

      return res.status(201).json({
        message: "Thêm sản phẩm thành công",
        data: product,
      });
    } catch (error) {
        console.error('❌ ERROR CREATE PRODUCT:', err);
      await t.rollback();
      console.error("Lỗi tạo sản phẩm:", error);
      return res.status(500).json({
        message: "Lỗi server",
        error: error.message,
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
        return res
          .status(400)
          .json({ message: "Dữ liệu sản phẩm không hợp lệ (JSON lỗi)" });
      }

      const {
        name,
        description,
        shortDescription,
        thumbnail,
        badge,
        orderIndex,
        isActive,
        badgeImage,
        categoryId,
        brandId,
        hasVariants,
        skus = [],
        variants = [],
        infoContent = "",
        specs = [],
      } = parsedProduct;

      const product = await Product.findOne({ where: { slug: slugParam } });
      if (!product)
        return res.status(404).json({ message: "Không tìm thấy sản phẩm" });

      const productId = product.id;

      let newSlug = product.slug;
      if (name && name !== product.name) {
        const baseSlug = slugify(name, { lower: true, strict: true });
        newSlug = baseSlug;
        let suffix = 1;
        while (
          await Product.findOne({
            where: { slug: newSlug, id: { [Op.ne]: productId } },
          })
        ) {
          newSlug = `${baseSlug}-${suffix++}`;
        }
      }

      if (orderIndex !== undefined && orderIndex !== product.orderIndex) {
        if (orderIndex > product.orderIndex) {
          await Product.decrement("orderIndex", {
            by: 1,
            where: {
              categoryId,
              orderIndex: { [Op.gt]: product.orderIndex, [Op.lte]: orderIndex },
              deletedAt: null,
            },
            transaction: t,
          });
        } else {
          await Product.increment("orderIndex", {
            by: 1,
            where: {
              categoryId,
              orderIndex: { [Op.gte]: orderIndex, [Op.lt]: product.orderIndex },
              deletedAt: null,
            },
            transaction: t,
          });
        }
      }

      const uploadedThumbnail = req.files?.find(
        (f) => f.fieldname === "thumbnail"
      );
      const finalThumbnail =
        uploadedThumbnail?.path || thumbnail || product.thumbnail;
      const uploadedBadge = req.files?.find(
        (f) => f.fieldname === "badgeImage"
      );
      const finalBadgeImg =
        uploadedBadge?.path || badgeImage || product.badgeImage;

      let imageUrlForVector = finalThumbnail;

      if (hasVariants && skus && skus.length > 0) {
        const primarySkuData = skus
          .slice()
          .sort((a, b) => (a.price || 0) - (b.price || 0))[0];

        if (primarySkuData) {
          const primarySkuIndex = skus.findIndex(
            (s) => s.id === primarySkuData.id || !s.id
          );

          const newPrimarySkuImageFile = req.files?.find(
            (f) => f.fieldname === `media_sku_${primarySkuIndex}`
          );

          if (newPrimarySkuImageFile) {
            imageUrlForVector = newPrimarySkuImageFile.path;
          } else if (
            primarySkuData.mediaUrls &&
            primarySkuData.mediaUrls.length > 0
          ) {
            imageUrlForVector = primarySkuData.mediaUrls[0];
          }
        }
      }

      const baseUpdatePayload = {
        name,
        slug: newSlug,
        description,
        shortDescription,
        thumbnail: finalThumbnail,
        orderIndex,
        isActive,
        badgeImage: finalBadgeImg,
        hasVariants,
        categoryId,
        brandId,
        badge,
      };

      await product.update(baseUpdatePayload, { transaction: t });

      await ProductVariant.destroy({ where: { productId }, transaction: t });
      for (const variant of variants) {
        await ProductVariant.create(
          { productId, variantId: variant.id },
          { transaction: t }
        );
      }

      const existingSkus = await Sku.findAll({
        where: { productId },
        transaction: t,
      });
      const existingMap = new Map(existingSkus.map((s) => [s.id, s]));
      const seenSkuIds = new Set();

      const generateSkuCode = async (prefix = "SKU") => {
        let code,
          exists = true;
        while (exists) {
          code = `${prefix}-${Math.floor(100000 + Math.random() * 900000)}`;
          exists = await Sku.findOne({ where: { skuCode: code } });
        }
        return code;
      };

      const getFileType = (url) => {
        const ext = (url?.split(".").pop() || "").toLowerCase();
        return ["mp4", "mov", "avi", "webm"].includes(ext) ? "video" : "image";
      };

      for (let i = 0; i < skus.length; i++) {
        const sku = skus[i];
        let skuId = sku.id;

        if (skuId && existingMap.has(skuId)) {
          await Sku.update(
            {
              skuCode: sku.skuCode || existingMap.get(skuId).skuCode,
              price: sku.price > 0 ? sku.price : null,
              originalPrice: sku.originalPrice > 0 ? sku.originalPrice : null,
              stock: sku.stock,
              height: sku.height || 0,
              width: sku.width || 0,
              length: sku.length || 0,
              weight: sku.weight || 0,
              isActive: true,
            },
            { where: { id: skuId }, transaction: t }
          );

          seenSkuIds.add(skuId);

          await ProductMedia.destroy({ where: { skuId }, transaction: t });
          await SkuVariantValue.destroy({ where: { skuId }, transaction: t });

          for (const [order, url] of (sku.mediaUrls || []).entries()) {
            await ProductMedia.create(
              {
                skuId,
                mediaUrl: url,
                type: getFileType(url),
                sortOrder: order,
              },
              { transaction: t }
            );
          }

          for (const f of req.files?.filter(
            (f) => f.fieldname === `media_sku_${i}`
          ) || []) {
            await ProductMedia.create(
              { skuId, mediaUrl: f.path, type: getFileType(f.filename) },
              { transaction: t }
            );
          }

          for (const valId of sku.variantValueIds || []) {
            await SkuVariantValue.create(
              { skuId, variantValueId: valId },
              { transaction: t }
            );
          }
        } else {
          const createdSku = await Sku.create(
            {
              productId,
              skuCode:
                sku.skuCode || (await generateSkuCode(newSlug.toUpperCase())),
              price: sku.price > 0 ? sku.price : null,
              originalPrice: sku.originalPrice > 0 ? sku.originalPrice : null,
              stock: sku.stock,
              height: sku.height || 0,
              width: sku.width || 0,
              length: sku.length || 0,
              weight: sku.weight || 0,
              isActive: true,
            },
            { transaction: t }
          );

          skuId = createdSku.id;
          seenSkuIds.add(skuId);

          for (const [order, url] of (sku.mediaUrls || []).entries()) {
            await ProductMedia.create(
              {
                skuId,
                mediaUrl: url,
                type: getFileType(url),
                sortOrder: order,
              },
              { transaction: t }
            );
          }

          for (const f of req.files?.filter(
            (f) => f.fieldname === `media_sku_${i}`
          ) || []) {
            await ProductMedia.create(
              { skuId, mediaUrl: f.path, type: getFileType(f.filename) },
              { transaction: t }
            );
          }

          for (const valId of sku.variantValueIds || []) {
            await SkuVariantValue.create(
              { skuId, variantValueId: valId },
              { transaction: t }
            );
          }
        }
      }

      const skuIdsToDelete = [...existingMap.keys()].filter(id => !seenSkuIds.has(id));

if (skuIdsToDelete.length > 0) {
  const usedRows = await OrderItem.findAll({
    attributes: ["skuId"],
    where: { skuId: { [Op.in]: skuIdsToDelete } },
    raw: true,
    transaction: t,
  });

  const usedSet  = new Set(usedRows.map(r => r.skuId));
  const toArchive = skuIdsToDelete.filter(id => usedSet.has(id));
  const toDelete  = skuIdsToDelete.filter(id => !usedSet.has(id));

  if (toArchive.length > 0) {
    await Sku.update(
      { isActive: false },
      { where: { id: { [Op.in]: toArchive } }, transaction: t }
    );
  }

  if (toDelete.length > 0) {
    await ProductMedia.destroy({
      where: { skuId: { [Op.in]: toDelete } },
      transaction: t,
    });
    await SkuVariantValue.destroy({
      where: { skuId: { [Op.in]: toDelete } },
      transaction: t,
    });
    await Sku.destroy({
      where: { id: { [Op.in]: toDelete } },
      transaction: t,       
    });
  }
}


      await ProductInfo.destroy({ where: { productId }, transaction: t });
      if (infoContent) {
        await ProductInfo.create(
          { productId, content: infoContent },
          { transaction: t }
        );
      }

      await ProductSpec.destroy({ where: { productId }, transaction: t });
      for (const spec of specs) {
        if (spec.key && spec.value) {
          await ProductSpec.create(
            {
              productId,
              specKey: spec.key,
              specValue: spec.value,
              specGroup: spec.specGroup || null,
              sortOrder: spec.sortOrder || 0,
            },
            { transaction: t }
          );
        }
      }

      async function buildImageBuffer(src) {
        if (!src) return null;
        try {
          if (src.startsWith("http://") || src.startsWith("https://")) {
            const resp = await axios.get(src, { responseType: "arraybuffer" });
            return Buffer.from(resp.data);
          }
          const fs = require("fs");
          if (fs.existsSync(src)) {
            return fs.readFileSync(src);
          }
          return null;
        } catch (e) {
          console.warn("⚠️ Không thể đọc ảnh để tạo buffer:", e.message);
          return null;
        }
      }

      async function generateVectorAndSave(imageSrc) {
        const buf = await buildImageBuffer(imageSrc);
        if (!buf) {
          console.warn(
            `⚠️ Bỏ qua tạo vector vì không đọc được ảnh: ${imageSrc}`
          );
          return;
        }

        try {
          const FormData = require("form-data");
          const formData = new FormData();
          formData.append("image", buf, {
            filename: "image.jpg",
            contentType: "image/jpeg",
          });

          const flaskResponse = await axios.post(
            FLASK_EMBED_API_URL,
            formData,
            {
              headers: formData.getHeaders(),
              maxBodyLength: Infinity,
              maxContentLength: Infinity,
              timeout: 60000,
            }
          );

          const newVector = flaskResponse?.data?.vector;
          if (Array.isArray(newVector) && newVector.length > 0) {
            const updatePayload = { imageVector: JSON.stringify(newVector) };

            if ("imageVectorUrl" in product.dataValues) {
              updatePayload.imageVectorUrl = imageSrc;
            }
            await Product.update(updatePayload, { where: { id: productId } });
            console.log(
              `✅ Đã tạo & lưu imageVector cho sản phẩm ${product.name}`
            );
          } else {
            console.warn(
              `⚠️ Flask trả vector không hợp lệ cho ảnh: ${imageSrc}`
            );
          }
        } catch (e) {
          console.error(
            `❌ Lỗi tạo vector từ Flask cho ảnh: ${imageSrc}`,
            e.message
          );
        }
      }

      const currentImageUrlInDbForVector = product.imageVectorUrl;
      const needReembed =
        imageUrlForVector &&
        (imageUrlForVector !== currentImageUrlInDbForVector ||
          !product.imageVector);

      if (needReembed) {
        t.afterCommit(async () => {
          try {
            await generateVectorAndSave(imageUrlForVector, product.id);
          } catch (e) {
            console.error("Vector post-commit failed:", e.message);
          }
        });
      }

      await t.commit();

      return res.json({
        message: "Cập nhật sản phẩm thành công",
        data: product,
      });
    } catch (error) {
      await t.rollback();
      console.error("Lỗi update product:", error);
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
        return res.status(400).json({ message: "Danh sách không hợp lệ." });
      }

      for (const item of items) {
        if (!item.id || item.orderIndex == null || item.categoryId == null) {
          return res.status(400).json({ message: "Thiếu thông tin sản phẩm." });
        }
      }

      const categoryIds = [...new Set(items.map((item) => item.categoryId))];
      if (categoryIds.length !== 1) {
        return res.status(400).json({
          message: "Chỉ được sắp xếp sản phẩm trong cùng một danh mục.",
        });
      }

      const categoryId = categoryIds[0];

      for (const item of items) {
        await Product.update(
          { orderIndex: item.orderIndex },
          {
            where: {
              id: item.id,
              categoryId: categoryId,
            },
            transaction: t,
          }
        );
      }

      await t.commit();
      return res.json({ message: "Cập nhật thứ tự thành công!" });
    } catch (error) {
      if (!t.finished) await t.rollback();
      console.error("updateOrderIndexBulk LỖI:", error);
      return res.status(500).json({
        message: "Lỗi cập nhật thứ tự sản phẩm.",
        error: error.message,
      });
    }
  }

 static async getAll(req, res) {
  const t0 = Date.now();
  try {
    const {
      filter = "all",
      search = "",
      categoryId,
      page = 1,
      limit = 10,
      createdFrom,
      createdTo,
      startDate,
      endDate,
    } = req.query;

    const pageNum  = Number(page)  || 1;
    const limitNum = Number(limit) || 10;
    const offset   = (pageNum - 1) * limitNum;

   

    const whereClause = {};
    let paranoid = true;

    if (filter === "active") whereClause.isActive = true;
    else if (filter === "inactive") whereClause.isActive = false;
    else if (filter === "deleted") {
      whereClause.deletedAt = { [Op.ne]: null };
      paranoid = false;
    }

    if (search) {
      const like = { [Op.like]: `%${search}%` };
      whereClause[Op.or] = [{ name: like }, { slug: like }];
    }
    if (categoryId) whereClause.categoryId = categoryId;

    const normalizeDate = (str) => {
      if (!str || typeof str !== "string") return "";
      const s = str.trim();
      if (!s) return "";
      if (s.includes("/")) {
        const [d, m, y] = s.split("/");
        return `${y}-${m}-${d}`;
      }
      return s;
    };

    const fromStr = normalizeDate(createdFrom ?? startDate ?? "");
    const toStr   = normalizeDate(createdTo   ?? endDate   ?? "");
 
    if (fromStr || toStr) {
      let gte = fromStr ? new Date(`${fromStr}T00:00:00`) : undefined;
      let lte = toStr   ? new Date(`${toStr}T23:59:59`) : undefined;

      const gteValid = gte instanceof Date && !Number.isNaN(gte?.getTime());
      const lteValid = lte instanceof Date && !Number.isNaN(lte?.getTime());

      if (gteValid && lteValid && gte > lte) { const tmp = gte; gte = lte; lte = tmp; }

      const createdAt = {};
      if (gteValid) createdAt[Op.gte] = gte;
      if (lteValid) createdAt[Op.lte] = lte;
      if (gteValid || lteValid) whereClause.createdAt = createdAt;

      
    }



    const findOpts = {
      where: whereClause,
      include: [
        { model: Category, as: "category", attributes: ["id", "name"] },
        { model: Sku,      as: "skus",     attributes: ["stock"] },
      ],
      attributes: { include: ["deletedAt"] },
      order: categoryId ? [["orderIndex", "ASC"]] : [["createdAt", "DESC"]],
      offset,
      limit: limitNum,
      paranoid,
      distinct: true, 

    };

   

    const result = await Product.findAndCountAll(findOpts);

    const products   = result.rows || [];
    const totalItems = Array.isArray(result.count) ? result.count.length : result.count;

  
    for (const p of products) {
      const stocks = p.skus?.map((s) => s.stock || 0) || [];
      const totalStock = stocks.reduce((sum, v) => sum + v, 0);
      const anyLow = stocks.some((s) => s <= 5);
      p.setDataValue("totalStock", totalStock);
      p.setDataValue("lowStockWarning", anyLow);
    }

    const totalPages = Math.ceil((Number(totalItems) || 0) / limitNum);
  

    let activeCount = 0, inactiveCount = 0, deletedCount = 0, lowStockCount = 0;
    try {
      const counts = await Promise.all([
        Product.count({ where: { isActive: true,  deletedAt: null } }),
        Product.count({ where: { isActive: false, deletedAt: null } }),
        Product.count({ where: { deletedAt: { [Op.ne]: null } }, paranoid: false }),
        Product.count({
          include: [
            { model: Sku, as: "skus", attributes: [], where: { stock: { [Op.lte]: 5 } }, required: true },
          ],
          where: { deletedAt: null },
          distinct: true, 
          
        }),
      ]);
      [activeCount, inactiveCount, deletedCount, lowStockCount] = counts;
    } catch (e) {
      console.error("[PRODUCT][COUNT_ERR]", e?.message || e);
    }

    res.json({
      data: products,
      pagination: { totalItems, totalPages, currentPage: pageNum, limit: limitNum },
      counts: { all: activeCount + inactiveCount, active: activeCount, inactive: inactiveCount, deleted: deletedCount, lowStock: lowStockCount },
      debug: { where: whereClause, paranoid, tookMs: Date.now() - t0 },
    });
  } catch (error) {
    console.error("[PRODUCT][GET_ALL_ERROR]", {
      message: error?.message, name: error?.name,
      stack: error?.stack?.split("\n").slice(0,3).join(" | "),
      parent: error?.parent?.message, sql: error?.parent?.sql
    });
    res.status(500).json({ message: "Lỗi máy chủ", error: error?.message || "Unknown error" });
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
      const { slug: slugParam } = req.params;

      const product = await Product.findOne({
        where: { slug: slugParam },
        include: [
          { model: ProductInfo, as: "productInfo", attributes: ["content"] },
          {
            model: ProductSpec,
            as: "specs",
            attributes: ["specKey", "specValue", "specGroup", "sortOrder"],
          },
          {
            model: Sku,
            as: "skus",
            include: [
              {
                model: ProductMedia,
                as: "ProductMedia",
                attributes: ["mediaUrl", "type", "sortOrder"],
                required: false,
                order: [["sortOrder", "ASC"]],
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
            mediaUrls: (sku.ProductMedia || [])
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((m) => ({
                id: m.mediaUrl,
                url: m.mediaUrl,
                type: m.type || getFileType(m.mediaUrl),
              })),

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
        const filteredValues = allValues.filter((v) => usedValueIds.has(v.id));

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
          badgeImage: product.badgeImage || null,
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
      const restoredProduct = await Product.findOne({ where: { id } });
      req.auditNewValue = restoredProduct.toJSON();
      res.json({ message: "Đã khôi phục sản phẩm", data: restoredProduct });
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
      if (!product) {
        await t.rollback();
        return res.status(404).json({ message: "Không tìm thấy sản phẩm." });
      }

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
      await ProductView.destroy({ where: { productId: id }, ...opts });
      await ProductMedia.destroy({ where: { skuId: skuIds }, ...opts });
      await SkuVariantValue.destroy({ where: { skuId: skuIds }, ...opts });
      await ProductSpec.destroy({ where: { productId: id }, ...opts });
      await ProductInfo.destroy({ where: { productId: id }, ...opts });
      await ProductVariant.destroy({ where: { productId: id }, ...opts });

      await Sku.destroy({ where: { id: skuIds }, ...opts });

      await product.destroy(opts);

      await t.commit();
      return res.json({ message: "Đã xoá vĩnh viễn sản phẩm" });
    } catch (err) {
      if (!t.finished) await t.rollback();

      if (err.name === "SequelizeForeignKeyConstraintError") {
        return res.status(400).json({
          message:
            "Không thể xoá vĩnh viễn vì sản phẩm vẫn còn dữ liệu liên quan (VD: lượt xem, đánh giá, bình luận...).",
        });
      }

      console.error("Lỗi forceDelete:", err);
      return res
        .status(500)
        .json({ message: "Lỗi server", error: err.message });
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
        await t.rollback();
        return res.status(400).json({
          message:
            "Không thể xoá vì tất cả sản phẩm đã xuất hiện trong đơn hàng.\n" +
            "Hãy giữ lại để bảo toàn lịch sử.",
        });
      }

      const deletableSkuIds = skus
        .filter((s) => deletableProductIds.includes(s.productId))
        .map((s) => s.id);

      const opts = { force: true, transaction: t };

      const modelsToDelete = [
        { m: CartItem, cond: { skuId: deletableSkuIds } },
        { m: WishlistItem, cond: { productId: deletableProductIds } },
        { m: ProductView, cond: { productId: deletableProductIds } },
        { m: ProductMedia, cond: { skuId: deletableSkuIds } },
        { m: SkuVariantValue, cond: { skuId: deletableSkuIds } },
        { m: ProductSpec, cond: { productId: deletableProductIds } },
        { m: ProductInfo, cond: { productId: deletableProductIds } },
        { m: ProductVariant, cond: { productId: deletableProductIds } },
        { m: Sku, cond: { id: deletableSkuIds } },
        { m: Product, cond: { id: deletableProductIds } },
      ];

      for (const item of modelsToDelete) {
        await item.m.destroy({ where: item.cond, ...opts });
      }

      await t.commit();

      const msgOk = `Đã xoá vĩnh viễn ${deletableProductIds.length} sản phẩm.`;
      const msgBad = blockedProductIds.size
        ? `\nKhông xoá ${blockedProductIds.size} sản phẩm vì đã có trong đơn hàng.`
        : "";
      return res.json({ message: msgOk + msgBad });
    } catch (error) {
      if (!t.finished) await t.rollback();

      if (error.name === "SequelizeForeignKeyConstraintError") {
        return res.status(400).json({
          message:
            "Không thể xoá vĩnh viễn vì một số sản phẩm vẫn còn dữ liệu liên quan (VD: lượt xem, đánh giá, bình luận...).",
        });
      }

      console.error("forceDeleteMany error:", error);
      return res
        .status(500)
        .json({ message: "Lỗi server", error: error.message });
    }
  }
}

module.exports = ProductController;
