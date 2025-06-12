const {
  Review,
  ReviewMedia,
  User,
  Sku,
  OrderItem,
  Order,
} = require("../../models");
const { Op } = require("sequelize");

class ReviewController {
  static async create(req, res) {
    try {
      const { rating, content, skuId } = req.body;
      const userId = req.user.id;

      const sku = await Sku.findByPk(skuId);
      if (!sku) return res.status(404).json({ message: "Không tìm thấy SKU" });

      const orderItem = await OrderItem.findOne({
        where: { skuId },
        include: [
          {
            model: Order,
            as: "order",
            where: { userId, status: "completed" },
          },
        ],
      });

      if (!orderItem) {
        return res.status(403).json({
          message:
            "Bạn chỉ được đánh giá sản phẩm sau khi đơn đã giao thành công!",
        });
      }

      const existingReview = await Review.findOne({
        where: {
          userId,
          skuId,
          orderItemId: orderItem.id,
        },
      });

      if (existingReview) {
        return res
          .status(400)
          .json({ message: "Bạn đã đánh giá sản phẩm này rồi!" });
      }

      const rawSlug = content?.substring(0, 60) || "review";
      const slugBase = rawSlug
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      let slug = slugBase;
      let count = 1;
      while (await Review.findOne({ where: { slug } })) {
        slug = `${slugBase}-${count++}`;
      }

      const review = await Review.create({
        userId,
        skuId,
        orderItemId: orderItem.id,
        content,
        rating,
        slug,
      });

      const allFiles = req.files || [];
      for (const file of allFiles) {
        await ReviewMedia.create({
          reviewId: review.id,
          url: file.path,
          type: "image",
        });
      }

      return res.status(201).json({ message: "Đánh giá thành công!", review });
    } catch (err) {
      console.error("Review create error:", err);
      return res.status(500).json({ message: "Lỗi server khi gửi đánh giá" });
    }
  }

  static async getBySkuId(req, res) {
    try {
      const { id } = req.params;
      const { hasMedia, purchased, star } = req.query;

      const sku = await Sku.findByPk(id);
      if (!sku) return res.status(404).json({ message: "Không tìm thấy SKU" });

      const whereClause = { skuId: id };

      if (star !== undefined && !isNaN(Number(star))) {
        whereClause.rating = Number(star);
      }

      if (purchased === "true") {
        whereClause.orderItemId = { [Op.ne]: null };
      }

      const include = [
        {
          model: ReviewMedia,
          as: "media",
          required: hasMedia === "true",
        },
        {
          model: User,
          as: "user",
          attributes: ["id", "fullName"],
        },
      ];

      const reviews = await Review.findAll({
        where: whereClause,
        include,
        order: [["createdAt", "DESC"]],
      });

      return res.status(200).json({ reviews });
    } catch (err) {
      console.error("Review fetch error:", err);
      return res.status(500).json({ message: "Lỗi server khi lấy đánh giá" });
    }
  }
}

module.exports = ReviewController;
