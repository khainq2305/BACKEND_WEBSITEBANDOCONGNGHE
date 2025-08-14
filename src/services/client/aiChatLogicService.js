const { Op } = require('sequelize');
const Product = require('../../models/product.model');

// RULES - Tách theo logic, dễ mở rộng
const rules = [
  {
    match: (msg) => /tủ lạnh/i.test(msg),
    handler: async () => {
      const products = await Product.findAll({
        where: { name: { [Op.like]: '%tủ lạnh%' } },
        limit: 5,
      });

      const mapped = products.map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        originalPrice: p.originalPrice,
        image: p.thumbnail,
        slug: p.slug,
      }));

      return {
        replyMessage: 'Dưới đây là một số tủ lạnh phù hợp với bạn:',
        type: 'product_grid',
        content: {
          descriptionTop: 'Bảng so sánh các tủ lạnh nổi bật:',
          table: {
            headers: ['Tên sản phẩm', 'Giá hiện tại', 'Giá gốc'],
            rows: mapped.map((p) => [
              p.name,
              p.price.toLocaleString('vi-VN') + '₫',
              p.originalPrice.toLocaleString('vi-VN') + '₫',
            ]),
          },
          title: 'Tủ lạnh gợi ý',
          products: mapped,
          noteAfterGrid: 'Bạn có thể nhấn vào sản phẩm để xem chi tiết nhé!',
        },
      };
    },
  },
  {
    match: (msg) => /giảm giá|sale|khuyến mãi/i.test(msg),
    handler: async () => ({
      replyMessage: 'Dưới đây là các khuyến mãi đang diễn ra:',
      type: 'text',
      content: '🎁 <a href="/khuyen-mai">Xem danh sách sản phẩm giảm giá</a>',
    }),
  },
  {
    match: (msg) => /máy lọc nước/i.test(msg),
    handler: async () => ({
      replyMessage: 'Một số máy lọc nước đáng chú ý:',
      type: 'text',
      content: 'Bạn có thể xem tại <a href="/may-loc-nuoc">trang này</a>.',
    }),
  },
  {
    match: (msg) => /online|mua online|mua trực tuyến/i.test(msg),
    handler: async () => ({
      replyMessage: 'Bạn hoàn toàn có thể mua hàng online!',
      type: 'text',
      content: 'Chỉ cần chọn sản phẩm và nhấn "Mua ngay" là xong ạ.',
    }),
  },
  {
    match: (msg) => /liên hệ|địa chỉ|cửa hàng|số điện thoại/i.test(msg),
    handler: async () => ({
      replyMessage: 'Thông tin liên hệ của chúng tôi:',
      type: 'text',
      content: `
        📍 Địa chỉ: 123 Đường ABC, TP. HCM<br/>
        📞 Hotline: <a href="tel:0123456789">0123 456 789</a><br/>
        ✉️ Email: support@homepower.vn
      `,
    }),
  },
  {
    match: (msg) => /sunhouse/i.test(msg),
    handler: async () => ({
      replyMessage: 'Sunhouse là thương hiệu được nhiều người tin dùng.',
      type: 'text',
      content: 'Bạn có thể xem các sản phẩm Sunhouse tại <a href="/thuong-hieu/sunhouse">đây</a>.',
    }),
  },
];

// HÀM XỬ LÝ CHÍNH
exports.handleChatLogic = async (message) => {
  const rule = rules.find((r) => r.match(message));
  if (rule) {
    return await rule.handler(message);
  }

  // Default fallback
  return {
    replyMessage: 'Em chưa có thông tin cụ thể về yêu cầu đó.',
    type: 'text',
    content: 'Anh/Chị có thể đặt câu hỏi cụ thể hơn được không ạ?',
  };
};
