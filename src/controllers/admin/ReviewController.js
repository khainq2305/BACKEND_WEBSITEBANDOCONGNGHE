// src/controllers/admin/adminReviewController.js
const { Review, ReviewMedia, User, Sku, Product } = require("../../models");
const { Op } = require("sequelize");

class ReviewController {
  static async list(req, res) {
    try {
     const { page = 1, limit = 10, rating, status, search, fromDate, toDate } = req.query;
const offset = (page - 1) * limit;

const whereClause = {};
if (rating) whereClause.rating = { [Op.eq]: +rating }; // lọc số sao

if (status === "replied") whereClause.replyContent = { [Op.ne]: null };
if (status === "not_replied") whereClause.replyContent = null;

if (search) {
  whereClause.content = { [Op.like]: `%${search}%` };
}

if (fromDate && toDate) {
  whereClause.createdAt = {
    [Op.between]: [new Date(fromDate), new Date(toDate)]
  };
}


      const { rows, count } = await Review.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: User,
            as: "user",
            attributes: ["id", "fullName", "avatarUrl"],
          },
          { model: ReviewMedia, as: "media" },
          {
            model: Sku,
            as: "sku",
            include: [{ model: Product, as: "product", attributes: ["name"] }],
          },
        ],
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [["createdAt", "DESC"]],
      });

      return res.json({
        data: rows,
        pagination: {
          total: count,
          page: Number(page),
          totalPages: Math.ceil(count / limit),
        },
      });
    } catch (error) {
      console.error("AdminReviewController.list error:", error);
      return res
        .status(500)
        .json({ message: "Lỗi server khi lấy danh sách bình luận" });
    }
  }

  static async reply(req, res) {
    try {
      const { id } = req.params;
      const { reply, repliedBy } = req.body;

      if (!reply || !reply.trim()) {
        return res
          .status(400)
          .json({ message: "Nội dung phản hồi không được để trống" });
      }

      if (!repliedBy) {
        return res
          .status(400)
          .json({ message: "Thiếu thông tin người phản hồi" });
      }

      const review = await Review.findByPk(id);
      if (!review) {
        return res.status(404).json({ message: "Không tìm thấy bình luận" });
      }

      if (review.isReplied && review.replyContent) {
        return res.status(400).json({ message: "Bình luận đã được phản hồi" });
      }

      review.replyContent = reply;
      review.repliedBy = repliedBy;
      review.replyDate = new Date();
      review.isReplied = true;

      await review.save();

      return res.json({
        message: "Phản hồi thành công!",
        review,
      });
    } catch (error) {
      console.error("❌ Lỗi phản hồi bình luận:", error);
      return res.status(500).json({
        message:
          "Đã xảy ra lỗi trong quá trình phản hồi bình luận. Vui lòng thử lại sau.",
      });
    }
  }

  static async getCommentSummary(req, res) {
    try {

      const reviews = await Review.findAll({
        include: {
          model: Sku,
          as: "sku",
          include: { model: Product, as: "product", attributes: ["name"] },
        },
      });

      const summaryMap = {};

      reviews.forEach((review) => {
        const pid = review.sku?.productId;
        const pname = review.sku?.product?.name;

        if (!summaryMap[pid]) {
          summaryMap[pid] = {
            productId: pid,
            productName: pname,
            totalComments: 0,
            totalStars: 0,
          };
        }

        summaryMap[pid].totalComments += 1;
        summaryMap[pid].totalStars += review.rating;
      });

      const result = Object.values(summaryMap).map((item) => ({
        ...item,
        avgRating:
          item.totalComments > 0 ? item.totalStars / item.totalComments : null,
      }));

      return res.json({ data: result });
    } catch (error) {
      console.error("getCommentSummary error:", error);
      return res.status(500).json({ message: "Lỗi khi tổng hợp bình luận" });
    }
  }

  static async getByProductId(req, res) {
    const { productId } = req.params;
    try {
      const reviews = await Review.findAll({
        include: [
          {
            model: Sku,
            as: "sku",
            where: { productId: productId }, // join qua SKU để lọc theo productId
            include: [{ model: Product, as: "product", attributes: ["name"] }],
          },
          { model: ReviewMedia, as: "media" },
          {
            model: User,
            as: "user",
            attributes: ["id", "fullName", "avatarUrl"],
          },
        ],
        order: [["createdAt", "DESC"]],
      });

      return res.json(reviews);
    } catch (error) {
      console.error("getByProductId error:", error);
      return res
        .status(500)
        .json({ message: "Lỗi server khi lấy đánh giá theo sản phẩm" });
    }
  }

  static async getAll(req, res) {
  try {
    const reviews = await Review.findAll({
      include: [
        {
          model: Sku,
          as: 'sku',
          include: [
            {
              model: Product,
              as: 'product',
              attributes: ['id', 'name', 'thumbnail']
            }
          ]
        },
        { model: ReviewMedia, as: 'media' },
        {
          model: User,
          as: 'user',
          attributes: ['id', 'fullName', 'avatarUrl']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    return res.json({ data: reviews });
  } catch (error) {
    console.error('getAll reviews error:', error);
    return res.status(500).json({ message: 'Lỗi khi lấy tất cả bình luận' });
  }
}

}

module.exports = ReviewController;
