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
} = require("../../models");

const slugify = require("slugify");
const { Op } = require("sequelize");

class ProductController {
  static async create(req, res) {
    const t = await Product.sequelize.transaction();
    try {
      const {
        name,
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
      let slug = baseSlug;
      let suffix = 1;
      while (await Product.findOne({ where: { slug } })) {
        slug = `${baseSlug}-${suffix++}`;
      }

      // ✅ Xử lý orderIndex nếu không được truyền
      let finalOrderIndex = orderIndex;
      if (
        finalOrderIndex === undefined ||
        finalOrderIndex === null ||
        finalOrderIndex === ""
      ) {
        const maxOrderProduct = await Product.findOne({
          where: { categoryId },
          order: [["orderIndex", "DESC"]],
          paranoid: false,
        });
        finalOrderIndex = maxOrderProduct ? maxOrderProduct.orderIndex + 1 : 0;
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

      const uploadedThumbnail = req.files?.find(
        (f) => f.fieldname === "thumbnail"
      );
      let finalThumbnail = uploadedThumbnail
        ? "/uploads/" + uploadedThumbnail.filename
        : thumbnail;

      const product = await Product.create(
        {
          name,
          description,
          slug,
          shortDescription,
          thumbnail: finalThumbnail,
          hasVariants,
          orderIndex: finalOrderIndex,
          isActive,
          categoryId,
          brandId,
        },
        { transaction: t }
      );

      const generateSkuCode = async (prefix = "SKU") => {
        let code;
        let isExist = true;
        while (isExist) {
          const random = Math.floor(Math.random() * 900000) + 100000;
          code = `${prefix}-${random}`;
          isExist = await Sku.findOne({ where: { skuCode: code } });
        }
        return code;
      };

      const getFileType = (url) => {
        const ext = url.split(".").pop().toLowerCase();
        return ["mp4", "mov", "avi", "webm"].includes(ext) ? "video" : "image";
      };

      if (!hasVariants && skus?.length > 0) {
        const sku = skus[0];
        const newSKU = await Sku.create(
          {
            skuCode:
              sku.skuCode ||
              (await generateSkuCode(product.slug.toUpperCase())),
            originalPrice: sku.originalPrice,
            price: sku.price,
            stock: sku.stock,
            height: sku.height ?? 0,
            width: sku.width ?? 0,
            length: sku.length ?? 0,
            weight: sku.weight ?? 0,
            description: sku.description || null,
            isActive: true,
            productId: product.id,
          },
          { transaction: t }
        );

        for (const url of sku.mediaUrls || []) {
          await ProductMedia.create(
            
            {
              skuId: newSKU.id,
              mediaUrl: url,
              type: getFileType(url),
            },
            { transaction: t }
          );
        }
console.log("🧪 SKU mediaUrls:", sku.mediaUrls);

        for (const spec of [...(sku.specs || []), ...(specs || [])]) {
          if (spec.key && spec.value) {
            await ProductSpec.create(
              {
                skuId: newSKU.id,
                specKey: spec.key,
                specValue: spec.value,
                sortOrder: spec.sortOrder || 0,
              },
              { transaction: t }
            );
          }
        }
      }

      if (hasVariants) {
        for (const variant of variants) {
          await ProductVariant.findOrCreate({
            where: { productId: product.id, variantId: variant.id },
            defaults: { productId: product.id, variantId: variant.id },
            transaction: t,
          });
        }

        for (const sku of skus) {
          const createdSku = await Sku.create(
            {
              productId: product.id,
              skuCode:
                sku.skuCode ||
                (await generateSkuCode(product.slug.toUpperCase())),
              price: sku.price,
              originalPrice: sku.originalPrice,
              stock: sku.stock,
              height: sku.height || 0,
              width: sku.width || 0,
              length: sku.length || 0,
              weight: sku.weight || 0,
              description: sku.description || null,
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

          for (const valueId of sku.variantValueIds || []) {
            await SkuVariantValue.create(
              {
                skuId: createdSku.id,
                variantValueId: valueId,
              },
              { transaction: t }
            );
          }

          for (const spec of sku.specs || []) {
            if (spec.key && spec.value) {
              await ProductSpec.create(
                {
                  skuId: createdSku.id,
                  specKey: spec.key,
                  specValue: spec.value,
                  sortOrder: spec.sortOrder || 0,
                },
                { transaction: t }
              );
            }
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

      await t.commit();
      return res.status(201).json({
        message: "Thêm sản phẩm thành công",
        data: product,
      });
    } catch (error) {
      await t.rollback();
      console.error("Lỗi tạo sản phẩm:", error);
      return res
        .status(500)
        .json({ message: "Lỗi server", error: error.message });
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

      res.json({
        data: products,
        pagination: {
          totalItems,
          totalPages,
          currentPage: parseInt(page),
          limit: parseInt(limit),
        },
      });
    } catch (error) {
      console.error("❌ Lỗi getAll:", error); // CHỈ ĐOẠN NÀY
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
      console.error("❌ Lỗi lấy danh sách danh mục:", error);
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
      console.error("❌ Lỗi lấy danh sách thương hiệu:", error);
      res.status(500).json({ message: "Lỗi server", error: error.message });
    }
  }
  static async softDelete(req, res) {
    try {
      const { id } = req.params;
      const product = await Product.findByPk(id);
      if (!product)
        return res.status(404).json({ message: "Không tìm thấy sản phẩm" });

      await product.destroy(); // soft-delete vì có `paranoid: true`
      res.json({ message: "✅ Đã xóa sản phẩm tạm thời" });
    } catch (error) {
      res.status(500).json({ message: "❌ Lỗi server", error: error.message });
    }
  }
  // ✅ Cập nhật sản phẩm
  static async update(req, res) {
    const t = await Product.sequelize.transaction();
    try {
      const { id } = req.params;
      const {
        name,
        description,
        shortDescription,
        thumbnail,
        orderIndex,
        isActive,
        categoryId,
        brandId,
      } = req.body;

      const product = await Product.findByPk(id);
      if (!product) {
        return res.status(404).json({ message: "Không tìm thấy sản phẩm" });
      }

      // ✅ Nếu tên thay đổi → tạo slug mới
      let slug = product.slug;
      if (name && name !== product.name) {
        const baseSlug = slugify(name, { lower: true, strict: true });
        slug = baseSlug;
        let suffix = 1;
        while (
          await Product.findOne({ where: { slug, id: { [Op.ne]: id } } })
        ) {
          slug = `${baseSlug}-${suffix++}`;
        }
      }

      // ✅ Nếu orderIndex thay đổi, cập nhật các product khác
      if (
        orderIndex !== undefined &&
        orderIndex !== null &&
        orderIndex !== "" &&
        orderIndex !== product.orderIndex
      ) {
        if (orderIndex > product.orderIndex) {
          await Product.decrement("orderIndex", {
            by: 1,
            where: {
              orderIndex: {
                [Op.gt]: product.orderIndex,
                [Op.lte]: orderIndex,
              },
            },
            transaction: t,
          });
        } else {
          await Product.increment("orderIndex", {
            by: 1,
            where: {
              orderIndex: {
                [Op.gte]: orderIndex,
                [Op.lt]: product.orderIndex,
              },
            },
            transaction: t,
          });
        }
      }

      // ✅ Thumbnail mới (nếu có file upload)
      let finalThumbnail = product.thumbnail;
      if (req.files?.thumbnail?.[0]) {
        finalThumbnail = "/uploads/" + req.files.thumbnail[0].filename;
      } else if (thumbnail !== undefined) {
        finalThumbnail = thumbnail; // có thể cho phép sửa thumbnail thủ công
      }

      await product.update(
        {
          name,
          slug,
          description,
          shortDescription,
          thumbnail: finalThumbnail,
          orderIndex,
          isActive,
          categoryId,
          brandId,
        },
        { transaction: t }
      );

      await t.commit();
      res.json({ message: "✅ Đã cập nhật sản phẩm", data: product });
    } catch (error) {
      await t.rollback();
      console.error("❌ Lỗi cập nhật sản phẩm:", error);
      res.status(500).json({ message: "❌ Lỗi server", error: error.message });
    }
  }

  // ✅ Xoá mềm nhiều sản phẩm
  static async softDeleteMany(req, res) {
    try {
      const { ids = [] } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "Danh sách ID không hợp lệ" });
      }

      await Product.destroy({
        where: { id: ids },
      });

      res.json({ message: "✅ Đã xoá tạm thời các sản phẩm" });
    } catch (error) {
      res.status(500).json({ message: "❌ Lỗi server", error: error.message });
    }
  }

  // ✅ Khôi phục 1 sản phẩm
  static async restore(req, res) {
    try {
      const { id } = req.params;

      const product = await Product.findOne({
        where: { id },
        paranoid: false, // để tìm cả bị soft delete
      });

      if (!product || !product.deletedAt) {
        return res
          .status(404)
          .json({ message: "Không tìm thấy sản phẩm đã xoá" });
      }

      await product.restore();
      res.json({ message: "✅ Đã khôi phục sản phẩm" });
    } catch (error) {
      res.status(500).json({ message: "❌ Lỗi server", error: error.message });
    }
  }

  // ✅ Khôi phục nhiều sản phẩm
  static async restoreMany(req, res) {
    try {
      const { ids = [] } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "Danh sách ID không hợp lệ" });
      }

      await Product.restore({
        where: { id: ids },
      });

      res.json({ message: "✅ Đã khôi phục các sản phẩm" });
    } catch (error) {
      res.status(500).json({ message: "❌ Lỗi server", error: error.message });
    }
  }

  // ✅ Xoá vĩnh viễn 1 sản phẩm
  static async forceDelete(req, res) {
    try {
      const { id } = req.params;

      const product = await Product.findOne({
        where: { id },
        paranoid: false,
      });

      if (!product) {
        return res.status(404).json({ message: "Không tìm thấy sản phẩm" });
      }

      await product.destroy({ force: true });
      res.json({ message: "✅ Đã xoá vĩnh viễn sản phẩm" });
    } catch (error) {
      res.status(500).json({ message: "❌ Lỗi server", error: error.message });
    }
  }
  // ✅ Cập nhật thứ tự nhiều sản phẩm
  static async updateOrderIndexBulk(req, res) {
    const t = await Product.sequelize.transaction();
    try {
      const { items } = req.body;

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "Danh sách không hợp lệ" });
      }

      // Cập nhật thứ tự từng sản phẩm trong transaction
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
      console.error("❌ updateOrderIndexBulk LỖI:", error);
      return res
        .status(500)
        .json({ message: "Lỗi cập nhật thứ tự", error: error.message });
    }
  }
  static async getById(req, res) {
    try {
      const { id } = req.params;

      const product = await Product.findByPk(id, {
        include: [
          { model: ProductInfo, as: "productInfo", attributes: ["content"] },
          {
            model: Sku,
            as: "skus",
            include: [
              // SỬA THÀNH
          {
  model: ProductMedia,
  as: "ProductMedia", // ✅ phải trùng alias trong index.js
  attributes: ['mediaUrl', 'type'],
  required: false // ✅ đảm bảo luôn join kể cả không có dữ liệu
}
,
              {
                model: ProductSpec,
                as: "specs",
                attributes: ["specKey", "specValue", "sortOrder"],
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

      if (!product)
        return res.status(404).json({ message: "Không tìm thấy sản phẩm" });

      const infoContent = product.productInfo?.content || "";

  
      const skus = await Promise.all(
        (product.skus || []).map(async (sku) => {
          console.log("DEBUG Media:", sku.ProductMedia); // đặt trong vòng map async

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
            
            specs:
              sku.specs?.map((s) => ({
                key: s.specKey,
                value: s.specValue,
                sortOrder: s.sortOrder,
              })) || [],
            variantValueIds,
            selectedValues,
          };
        })
      );
console.log("DEBUG Media:", Sku.ProductMedia);


      const usedValueIds = new Set();
      for (const sku of skus) {
        for (const valId of sku.variantValueIds || []) {
          usedValueIds.add(valId);
        }
      }

      
      const variants =
        product.productVariants?.map((pv) => {
          const allValues = pv.variant?.values || [];
          const filteredValues = allValues.filter((v) =>
            usedValueIds.has(v.id)
          );
          return {
            id: pv.variant?.id,
            name: pv.variant?.name,
            values: filteredValues,
          };
        }) || [];

      return res.json({
        data: {
          id: product.id,
          name: product.name,
          slug: product.slug,
          description: product.description,
          shortDescription: product.shortDescription,
          thumbnail: product.thumbnail,
          orderIndex: product.orderIndex,
          isActive: product.isActive,
          hasVariants: product.hasVariants,
          categoryId: product.categoryId,
          brandId: product.brandId,
          infoContent,
          variants, 
          skus,
        },
      });
    } catch (error) {
      console.error("❌ Lỗi lấy chi tiết sản phẩm:", error);
      return res
        .status(500)
        .json({ message: "Lỗi server", error: error.message });
    }
  }
}

module.exports = ProductController;
