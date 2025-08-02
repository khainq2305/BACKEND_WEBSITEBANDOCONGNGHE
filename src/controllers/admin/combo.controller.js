const { Combo, ComboSku, Sku, Product } = require("../../models");

class ComboController {
  static async getAll(req, res) {
    try {
      const combos = await Combo.findAll({
        paranoid: false, // ✅ để lấy combo bị xoá mềm
        order: [["createdAt", "DESC"]], // ✅ sửa lỗi không có orderIndex
      });
      return res.json(combos);
    } catch (err) {
      console.error("Lỗi getAll combos:", err);
      return res.status(500).json({ message: "Lỗi lấy danh sách combo" });
    }
  }
  static async getBySlug(req, res) {
    try {
      const combo = await Combo.findOne({
        where: { slug: req.params.slug },
        include: [
          {
            model: ComboSku,
            as: "comboSkus",
            include: [{ model: Sku, as: "sku" }],
          },
        ],
      });
      if (!combo)
        return res.status(404).json({ message: "Combo không tồn tại" });
      res.json(combo);
    } catch (err) {
      console.error("getBySlug Combo error:", err);
      res.status(500).json({ message: "Lỗi server khi lấy combo" });
    }
  }
  static async create(req, res) {
    try {
      const {
        name,
        slug,
        description,
        price,
        originalPrice,
        expiredAt,
        weight,
        width,
        height,
        length,
        isActive,
        isFeatured,
        quantity,
        sold,
        startAt,
      } = req.body;

      // ✅ Lấy thumbnail từ Cloudinary nếu có
      const thumbnailUrl = req.file?.path || null;

      // ✅ Parse comboSkus từ JSON string nếu có
      let comboSkus = [];
      if (req.body.comboSkus) {
        try {
          comboSkus = JSON.parse(req.body.comboSkus);
          if (!Array.isArray(comboSkus)) comboSkus = [];
        } catch (e) {
          console.error("❌ Parse comboSkus error:", e);
          comboSkus = [];
        }
      }

      // ✅ Tạo combo chính
      const combo = await Combo.create({
        name,
        slug,
        description,
        thumbnail: thumbnailUrl,
        price: parseFloat(price),
        originalPrice: originalPrice ? parseFloat(originalPrice) : null,
        expiredAt: expiredAt || null,
        weight: weight ? parseFloat(weight) : null,
        width: width ? parseFloat(width) : null,
        height: height ? parseFloat(height) : null,
        length: length ? parseFloat(length) : null,
        startAt: startAt || null,
        isActive: isActive === "true" || isActive === true,
        isFeatured: isFeatured === "true" || isFeatured === true,
        quantity: quantity ? parseInt(quantity) : 0,
        sold: sold ? parseInt(sold) : 0,
      });

      // ✅ Tạo các dòng ComboSku liên kết
      if (comboSkus.length > 0) {
        const comboSkuRecords = comboSkus.map((item) => ({
          comboId: combo.id,
          skuId: item.skuId,
          quantity: item.quantity || 1,
        }));
        await ComboSku.bulkCreate(comboSkuRecords);
      }

      return res
        .status(201)
        .json({ message: "Tạo combo thành công", data: combo });
    } catch (err) {
      console.error("[❌ CREATE COMBO ERROR]", err);
      res.status(500).json({ message: "Lỗi tạo combo" });
    }
  }

  static async update(req, res) {
    try {
      const { slug } = req.params;
      console.log("👉 Params slug:", slug);

      const combo = await Combo.findOne({ where: { slug } });
      if (!combo) {
        console.log("❌ Combo không tìm thấy với slug:", slug);
        return res.status(404).json({ message: "Không tìm thấy combo" });
      }

      console.log("👉 req.body nhận được:", req.body);

      let {
        name,
        description,
        price,
        originalPrice,
        expiredAt,
        weight,
        width,
        height,
        length,
        thumbnail,
        isActive,
        isFeatured,
        quantity,
        sold,
        startAt,
        comboSkus = [],
      } = req.body;

      // Nếu comboSkus là string (do gửi từ formdata), parse lại JSON
      if (typeof comboSkus === "string") {
        try {
          comboSkus = JSON.parse(comboSkus);
          console.log("✅ comboSkus sau khi parse JSON:", comboSkus);
        } catch (parseErr) {
          console.error("❌ Lỗi parse comboSkus:", parseErr);
          comboSkus = [];
        }
      } else {
        console.log("✅ comboSkus đã là array:", comboSkus);
      }

      await combo.update({
        name,
        description,
        price: parseFloat(price),
        originalPrice: parseFloat(originalPrice) || null,
        expiredAt: expiredAt || null,
        weight: parseFloat(weight) || null,
        width: parseFloat(width) || null,
        height: parseFloat(height) || null,
        length: parseFloat(length) || null,
        startAt: startAt || null,
        thumbnail,
        isActive,
        isFeatured,
        quantity: quantity === "" ? null : parseInt(quantity, 10),
        sold: sold === "" ? null : parseInt(sold, 10),
      });

      await ComboSku.destroy({ where: { comboId: combo.id } });

      const allSkuIds = comboSkus.map((i) => i.skuId);
      const validSkus = await Sku.findAll({ where: { id: allSkuIds } });
      const validSkuIds = validSkus.map((s) => s.id);

      const validItems = comboSkus.filter((i) => validSkuIds.includes(i.skuId));

      if (validItems.length > 0) {
        const comboSkuRecords = validItems.map((item) => ({
          comboId: combo.id,
          skuId: item.skuId,
          quantity: item.quantity || 1,
        }));
        await ComboSku.bulkCreate(comboSkuRecords);
      }

      return res
        .status(200)
        .json({ message: "Cập nhật combo thành công", data: combo });
    } catch (err) {
      console.error("❌ [UPDATE COMBO ERROR]", err.message, err.stack);
      res.status(500).json({ message: "Lỗi cập nhật combo" });
    }
  }

  static async softDelete(req, res) {
    try {
      const id = req.params.id;
      const combo = await Combo.findByPk(id);
      if (!combo)
        return res.status(404).json({ message: "Combo không tồn tại" });

      // ✅ Xoá mềm rõ ràng
      await combo.destroy({ force: false });

      res.json({ message: "Xoá combo thành công" });
    } catch (err) {
      console.error("softDelete Combo error:", err);
      res.status(500).json({ message: "Lỗi xoá combo" });
    }
  }
  static async delete(req, res) {
    try {
      const id = req.params.id;
      const combo = await Combo.findByPk(id, { paranoid: false });

      if (!combo) {
        return res.status(404).json({ message: "Combo không tồn tại" });
      }

      await ComboSku.destroy({ where: { comboId: id } });
      await combo.destroy({ force: true });

      res.json({ message: "Đã xoá combo và các item SKU vĩnh viễn" });
    } catch (err) {
      console.error("[❌ DELETE COMBO ERROR]", err.message);
      res.status(500).json({ message: "Lỗi xoá combo vĩnh viễn" });
    }
  }
  static async restore(req, res) {
    try {
      const { id } = req.params;
      const combo = await Combo.findByPk(id, { paranoid: false });
      if (!combo || !combo.deletedAt) {
        return res
          .status(404)
          .json({ message: "Combo không tồn tại hoặc chưa bị xoá" });
      }
      await combo.restore();
      return res.json({ message: "Khôi phục combo thành công" });
    } catch (err) {
      console.error("[❌ RESTORE COMBO ERROR]", err.message);
      res.status(500).json({ message: "Lỗi khôi phục combo" });
    }
  }
  static async softDeleteMany(req, res) {
    try {
      console.log("📥 [softDeleteMany] Nhận được body:", req.body);
      const { ids } = req.body;

      if (!Array.isArray(ids) || ids.length === 0) {
        console.log("❌ Danh sách ID không hợp lệ");
        return res.status(400).json({ message: "Danh sách ID không hợp lệ" });
      }

      const foundCombos = await Combo.findAll({ where: { id: ids } });
      console.log(
        "🔎 Combo tìm thấy:",
        foundCombos.map((c) => c.id)
      );

      if (foundCombos.length !== ids.length) {
        console.log("❌ Một số combo không tồn tại!");
        return res.status(404).json({ message: "Combo không tồn tại" });
      }

      await Combo.update({ deletedAt: new Date() }, { where: { id: ids } });

      console.log("✅ Đã xoá mềm các combo:", ids);
      return res.json({ message: "Xoá mềm combo thành công" });
    } catch (error) {
      console.error("❌ Lỗi khi xoá mềm nhiều combo:", error);
      return res.status(500).json({ message: "Lỗi server khi xoá combo" });
    }
  }
  static async getAllSkus(req, res) {
    console.log("📥 [GET /admin/combos/skus] Yêu cầu lấy danh sách SKU");

    try {
      const skus = await Sku.findAll({
        include: [
          {
            model: Product,
            as: "product", // ✅ Dùng đúng alias
            attributes: ["name", "thumbnail"],
          },
        ],
        attributes: ["id", "skuCode", "price", "originalPrice", "stock"],
      });

      console.log("✅ Số lượng SKU tìm thấy:", skus.length);

      if (skus.length > 0) {
        skus.forEach((sku, index) => {
          console.log(`🔹 SKU #${index + 1}:`, {
            id: sku.id,
            code: sku.skuCode,
            price: sku.price,
            originalPrice: sku.originalPrice,
            stock: sku.stock,
            productName: sku?.Product?.name,
          });
        });
      }

      return res.status(200).json(skus);
    } catch (error) {
      console.error("❌ Lỗi lấy danh sách SKU:", error.message, error.stack);
      return res
        .status(500)
        .json({ message: "Lỗi server khi lấy danh sách SKU" });
    }
  }
}

module.exports = ComboController;
