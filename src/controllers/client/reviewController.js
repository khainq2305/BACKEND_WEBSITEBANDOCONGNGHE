const {
  Review,
  ReviewMedia,
  User,
  Sku,
  OrderItem,
  Order,
  VariantValue,
  Variant,
  SkuVariantValue,
} = require("../../models");
const { Op } = require("sequelize");

class ReviewController {
  static async create(req, res) {
    try {
      const { rating, content, skuId } = req.body;
      const userId = req.user.id;

      const sku = await Sku.findByPk(skuId);
      if (!sku) {
        return res.status(404).json({ message: "Không tìm thấy SKU" });
      }

      const orderItems = await OrderItem.findAll({
        where: { skuId },
        include: [
          {
            model: Order,
            as: "order",
            where: {
              userId,
              status: { [Op.in]: ["completed", "delivered"] },
            },
          },
        ],
      });

      if (!orderItems.length) {
        return res.status(403).json({
          message:
            "Bạn chỉ được đánh giá sản phẩm sau khi đơn đã giao thành công!",
        });
      }

      const reviewed = await Review.findAll({
        where: { userId, skuId },
        attributes: ["orderItemId"],
      });
      const reviewedIds = reviewed.map((r) => r.orderItemId);

      // Tìm orderItem chưa đánh giá
      const orderItemToReview = orderItems.find(
        (oi) => !reviewedIds.includes(oi.id)
      );
      if (!orderItemToReview) {
        return res.status(400).json({
          message: "Bạn đã đánh giá hết các đơn hàng có sản phẩm này!",
        });
      }

      // Tạo slug duy nhất
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
        orderItemId: orderItemToReview.id,
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

      const skuList = await Sku.findAll({
        where: { productId: sku.productId },
        attributes: ["id"],
      });
      const skuIds = skuList.map((s) => s.id);

      const whereClause = {
        skuId: { [Op.in]: skuIds },
      };

      if (star !== undefined && !isNaN(Number(star))) {
        whereClause.rating = Number(star);
      }

      if (purchased === "true") {
        whereClause.orderItemId = { [Op.ne]: null };
      }

      const reviews = await Review.findAll({
        where: whereClause,
        include: [
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
          {
            model: Sku,
            as: "sku",
            include: [
              {
                model: SkuVariantValue,
                as: "variantValues",
                include: [
                  {
                    model: VariantValue,
                    as: "variantValue",
                    include: [{ model: Variant, as: "variant" }],
                  },
                ],
              },
            ],
          },
        ],
        order: [["createdAt", "DESC"]],
      });

      return res.status(200).json({ reviews });
    } catch (err) {
      console.error("Review fetch error:", err);
      return res.status(500).json({ message: "Lỗi server khi lấy đánh giá" });
    }
  }

  static async checkCanReview(req, res) {
    try {
      const { skuId } = req.params;
      const userId = req.user.id;

      // Lấy tất cả OrderItem chứa SKU đó của người dùng đã hoàn tất
      const orderItems = await OrderItem.findAll({
        where: { skuId },
        include: [
          {
            model: Order,
            as: "order",
            where: {
              userId,
              status: { [Op.in]: ["completed", "delivered"] }, // ✅ fix ở đây
            },
            attributes: [],
          },
        ],
      });

      if (!orderItems.length) {
        return res.status(200).json({ canReview: false });
      }

      // Lấy tất cả review đã gửi cho SKU đó (loại bỏ orderItemId null)
      const existingReviews = await Review.findAll({
        where: {
          userId,
          skuId,
          orderItemId: { [Op.ne]: null },
        },
        attributes: ["orderItemId"],
      });

      const reviewedIds = existingReviews.map((r) => r.orderItemId);

      // Nếu còn đơn hàng nào chưa được đánh giá => được đánh giá
      const canReview = orderItems.some((oi) => !reviewedIds.includes(oi.id));

      return res.status(200).json({ canReview });
    } catch (err) {
      console.error("checkCanReview error:", err);
      return res
        .status(500)
        .json({ message: "Lỗi server khi kiểm tra quyền đánh giá" });
    }
  }

  static async checkCanEdit(req, res) {
    try {
      const review = await Review.findByPk(req.params.id);
      if (!review)
        return res.status(404).json({ message: "Không tìm thấy đánh giá" });

      if (review.userId !== req.user.id)
        return res
          .status(403)
          .json({ message: "Không có quyền sửa đánh giá này" });

      const createdAt = new Date(review.createdAt);
      const now = new Date();
      const daysPassed = (now - createdAt) / (1000 * 60 * 60 * 24);

      const canEdit = daysPassed <= 7 && !review.replyContent;
      return res.status(200).json({ canEdit });
    } catch (err) {
      console.error("checkCanEdit error:", err);
      return res.status(500).json({ message: "Lỗi server" });
    }
  }

  static async update(req, res) {
    try {
      const { id } = req.params;
      const { content, rating } = req.body;
      const userId = req.user.id;

      const review = await Review.findByPk(id, {
        include: [{ model: ReviewMedia, as: "media" }],
      });

      if (!review)
        return res.status(404).json({ message: "Không tìm thấy đánh giá" });

      if (review.userId !== userId)
        return res.status(403).json({ message: "Không có quyền" });

      const createdAt = new Date(review.createdAt);
      const now = new Date();
      const daysPassed = (now - createdAt) / (1000 * 60 * 60 * 24);

      if (daysPassed > 7)
        return res
          .status(400)
          .json({ message: "Đã quá 7 ngày, không thể sửa." });

      if (review.replyContent)
        return res
          .status(400)
          .json({ message: "Đánh giá đã được phản hồi, không thể sửa." });

      // Cập nhật nội dung và sao
      review.content = content;
      review.rating = rating;
      await review.save();

      // Nếu có media mới được upload
      const newFiles = req.files || [];
      if (newFiles.length > 0) {
        // Xoá media cũ
        await ReviewMedia.destroy({ where: { reviewId: review.id } });

        // Tạo media mới
        for (const file of newFiles) {
          await ReviewMedia.create({
            reviewId: review.id,
            url: file.path,
            type: "image",
          });
        }
      }

      return res.status(200).json({ message: "Cập nhật thành công", review });
    } catch (err) {
      console.error("Update review error:", err);
      return res.status(500).json({ message: "Lỗi server" });
    }
  }
}

module.exports = ReviewController;
