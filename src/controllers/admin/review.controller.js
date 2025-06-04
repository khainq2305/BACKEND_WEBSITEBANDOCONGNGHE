const Sequelize = require('sequelize');
const { Review, Sku, User, Product, ReviewMedia } = require('../../models');
const { validateReply } = require('../../validations/reviewValidator');
const { Op } = Sequelize;

class ReviewController {
  
  static async getGroupedByProduct(req, res) {
    try {
      const { page = 1, limit = 5, sort = 'default' } = req.query;
      const offset = (parseInt(page) - 1) * parseInt(limit);

      let order = [];
      if (sort === 'highest-rating') {
        order = [[Sequelize.literal('avgRating'), 'DESC']];
      } else if (sort === 'lowest-rating') {
        order = [[Sequelize.literal('avgRating'), 'ASC']];
      } else if (sort === 'most-commented') {
        order = [[Sequelize.literal('totalComments'), 'DESC']];
      } else if (sort === 'az') {
        order = [[{ model: Sku, as: 'sku' }, { model: Product, as: 'product' }, 'name', 'ASC']];
      } else if (sort === 'za') {
        order = [[{ model: Sku, as: 'sku' }, { model: Product, as: 'product' }, 'name', 'DESC']];
      }

      const rows = await Review.findAll({
        attributes: [
          'skuId',
          [Sequelize.fn('COUNT', Sequelize.col('Review.id')), 'totalComments'],
          [Sequelize.fn('AVG', Sequelize.col('rating')), 'avgRating']
        ],
        include: [
          {
            model: Sku,
            as: 'sku',
            attributes: ['id', 'skuCode', 'productId'],
            include: [
              {
                model: Product,
                as: 'product',
                attributes: ['id', 'name', 'thumbnail'],
                where: { deletedAt: null }
              }
            ]
          }
        ],
        group: ['skuId', 'sku.id', 'sku.product.id'],
        order,
        limit: parseInt(limit),
        offset,
        subQuery: false
      });

     
      const totalResult = await Review.findAll({
        attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('skuId')), 'skuId']],
        raw: true
      });

      return res.json({ success: true, data: rows, total: totalResult.length });
    } catch (error) {
      console.error('Lỗi lấy danh sách review theo SKU:', error);
      res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  }

  
  static async getBySku(req, res) {4
    try {
      const skuId = parseInt(req.params.skuId);
      const { search = '', rating, replied } = req.query;

      const where = { skuId };

      
      if (search.trim() !== '') {
        where.content = { [Op.like]: `%${search}%` };
      }

      
      if (rating) {
        where.rating = parseInt(rating);
      }

      
      if (replied !== undefined) {
        where.isReplied = replied === 'true'; 
      }

      const reviews = await Review.findAll({
        where,
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['id', 'fullName', 'avatarUrl']
          },
          {
            model: Sku,
            as: 'sku',
            attributes: ['id', 'skuCode'],
            include: [
              {
                model: Product,
                as: 'product',
                attributes: ['id', 'name']
              }
            ]
          },
        {
          model: ReviewMedia,
          as: 'medias',
          attributes: ['id', 'type', 'url']
        }
        ],
        order: [['createdAt', 'DESC']]
      });

      return res.json({ success: true, data: reviews });
    } catch (error) {
      console.error('Lỗi lấy review theo SKU:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  }


static async replyToReview(req, res) {
  try {
    const { id } = req.params;
    const { replyContent, responderId } = req.body;

    const review = await Review.findByPk(id);

    if (!review) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đánh giá' });
    }

    const alreadyHasReply = !!review.replyContent?.trim();
    const isFirstReply = !alreadyHasReply;

    const timeDiff = Math.abs(review.updatedAt.getTime() - review.createdAt.getTime());
    const isFirstEdit = alreadyHasReply && timeDiff < 1000;
    const isSecondEdit = alreadyHasReply && timeDiff >= 1000;

    if (isFirstReply) {
      review.replyContent = replyContent;
      review.responderId = responderId;
      review.isReplied = true;
      await review.save();
      return res.json({ success: true, message: 'Phản hồi thành công' });
    }

    if (isSecondEdit) {
      return res.status(400).json({
        success: false,
        message: 'Phản hồi này không thể thay đổi thêm.'
      });
    }

    return res.status(400).json({
      success: false,
      message: 'Nội dung phản hồi không thay đổi.'
    });

  } catch (error) {
    console.error('Lỗi phản hồi review:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
}



static async getAll(req, res) {
  try {
    const { search = '', rating, replied } = req.query;

    const where = {};

   
    if (search.trim() !== '') {
      where.content = { [Op.like]: `%${search.trim()}%` };
    }

    if (rating) {
      where.rating = parseInt(rating);
    }

   
    if (replied === 'true') {
  where.isReplied = true;
} else if (replied === 'false') {
  where.isReplied = false;
}


    const reviews = await Review.findAll({
      where,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'fullName', 'avatarUrl']
        },
        {
          model: Sku,
          as: 'sku',
          attributes: ['id', 'skuCode'],
          include: [
            {
              model: Product,
              as: 'product',
              attributes: ['id', 'name', 'thumbnail']
            }
          ]
        },
        {
          model: ReviewMedia,
          as: 'medias',
          attributes: ['id', 'type', 'url']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    return res.json({ success: true, data: reviews });
  } catch (err) {
    console.error('Lỗi lấy tất cả review:', err);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
}



}

module.exports = ReviewController;
