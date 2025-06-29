const { Product, Sku, Category, ProductMedia, Brand } = require('../../models');
const { Op } = require('sequelize');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { formatCurrencyVND } = require("../../utils/number");
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class ChatboxController {
  async chat(req, res) {
    const { message } = req.body;
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ message: 'Câu hỏi không hợp lệ hoặc trống.' });
    }

    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      await sleep(500);

      const { response, isProductDetail } = await this.createChatPrompt(message.trim());
      return res.status(200).json({
        message: 'Thành công',
        data: { reply: response, isProductDetail }
      });
    } catch (error) {
      console.error('[Lỗi ChatBot]', error);
      return res.status(500).json({ message: 'Đã xảy ra lỗi khi xử lý câu hỏi.' });
    }
  }

  async createChatPrompt(message) {
    const lower = message.toLowerCase();
    const productKeywords = [
      'quạt', 'quạt điều hoà', 'tủ lạnh', 'máy lọc nước', 'máy lọc không khí',
      'máy xay', 'máy sấy tóc', 'nồi chiên', 'lò vi sóng', 'nồi cơm điện',
      'máy pha cà phê', 'máy hút bụi', 'tivi', 'máy lạnh', 'máy rửa chén',
      'robot hút bụi', 'máy nước nóng', 'đèn sưởi', 'loa', 'bếp từ'
    ];

    const [products, categories] = await Promise.all([
      this.fetchChatProducts({ limit: 50 }),
      Category.findAll({ where: { isActive: true }, attributes: ['id', 'name'] })
    ]);
    const brands = await Brand.findAll({ where: { isActive: true }, attributes: ['name', 'description'] });

    for (const keyword of productKeywords) {
      if (
        (lower.includes('mua') || lower.includes('cần') || lower.includes('muốn') || lower.includes('xem')) &&
        lower.includes(keyword)
      ) {
        const matched = products.filter(p =>
          p.name.toLowerCase().includes(keyword) ||
          p.category?.toLowerCase().includes(keyword)
        );
        if (matched.length) {
          return {
            response: this.generateProductGrid(matched, `Các sản phẩm liên quan đến "${keyword}"`),
            isProductDetail: false
          };
        } else {
          return {
            response: `😔 Hiện tại chưa có sản phẩm nào liên quan đến "${keyword}".`,
            isProductDetail: false
          };
        }
      }
    }
    if (/(shop hoạt động bao lâu|mở từ khi nào|ra đời khi nào|shop có lâu chưa|shop mới mở hả)/.test(lower)) {
      return {
        response: `📅 Home Power đã hoạt động hơn 5 năm trong lĩnh vực điện máy gia dụng và luôn được khách hàng đánh giá cao về chất lượng dịch vụ và sản phẩm.`,
        isProductDetail: false
      };
    }
    if (/(ai đang tư vấn|bạn là ai|có nhân viên không|ai đang chat|gặp nhân viên thật|nói chuyện với người thật)/.test(lower)) {
      return {
        response: `🤖 Em là trợ lý ảo của Home Power. Nếu anh/chị cần hỗ trợ trực tiếp từ nhân viên, em có thể kết nối qua hotline <strong>1900 8922</strong> hoặc gửi tin nhắn fanpage ạ!`,
        isProductDetail: false
      };
    }
    if (/(khách hàng nói gì|feedback|đánh giá về shop|uy tín không|tin tưởng được không)/.test(lower)) {
      return {
        response: `🌟 Home Power nhận được hàng nghìn phản hồi tích cực từ khách hàng về chất lượng sản phẩm, tốc độ giao hàng và hỗ trợ sau bán. Anh/chị có thể tham khảo đánh giá trực tiếp trên từng sản phẩm ạ!`,
        isProductDetail: false
      };
    }
    if (/(sau khi mua|hỗ trợ sau bán|chăm sóc khách hàng|liên hệ sau mua|bảo trì sản phẩm)/.test(lower)) {
      return {
        response: `🙋‍♂️ Sau khi mua, nếu có bất kỳ thắc mắc nào về sản phẩm hoặc cần hỗ trợ kỹ thuật, anh/chị cứ nhắn với em hoặc gọi <strong>1900 8922</strong>. Đội ngũ kỹ thuật bên em luôn sẵn sàng hỗ trợ ạ!`,
        isProductDetail: false
      };
    }
    if (/(có đẹp trai không|có người yêu chưa|trợ lý ảo à|ai code mày|tán tao đi|đang rảnh không)/.test(lower)) {
      return {
        response: '😄 Em là trợ lý ảo chỉ giỏi bán hàng và hỗ trợ thôi ạ, còn tán tỉnh chắc cần update phiên bản mới rồi đó anh/chị!',
        isProductDetail: false
      };
    }
    if (/(bực quá|mất dạy|chậm quá|không hài lòng|dịch vụ tệ|hủy đơn đi|tôi không mua nữa)/.test(lower)) {
      return {
        response: '😥 Em rất xin lỗi nếu trải nghiệm chưa tốt. Anh/chị vui lòng để lại số điện thoại hoặc chi tiết, bên em sẽ gọi lại hỗ trợ ngay ạ!',
        isProductDetail: false
      };
    }
    if (/(so sánh|khác gì|cái nào ngon hơn|loại nào ngon hơn|nên chọn cái nào)/.test(lower)) {
      return {
        response: '🤔 Anh/chị vui lòng cho biết đang phân vân giữa những sản phẩm nào ạ? Em sẽ giúp so sánh chi tiết để dễ chọn hơn!',
        isProductDetail: false
      };
    }
    if (/(còn hàng không|có sẵn không|hết hàng chưa|có không vậy)/.test(lower)) {
      return {
        response: '📦 Anh/chị vui lòng cho em biết tên sản phẩm cụ thể, em kiểm tra tồn kho giúp liền ạ!',
        isProductDetail: false
      };
    }
    if (/(lắp đặt|gắn tận nơi|hướng dẫn dùng|xài sao|khó dùng quá)/.test(lower)) {
      return {
        response: '🔧 Bên em có hỗ trợ hướng dẫn sử dụng và lắp đặt tận nơi tùy sản phẩm. Anh/chị cần hỗ trợ dòng nào, em gửi hướng dẫn nhé!',
        isProductDetail: false
      };
    }
    if (/(cho mẹ xài|cho ba mẹ|người già dùng được không|bé dùng được không)/.test(lower)) {
      return {
        response: '👨‍👩‍👧 Em rất hiểu nhu cầu này ạ! Nếu anh/chị mô tả cụ thể hơn về người dùng và mục đích, em sẽ gợi ý sản phẩm phù hợp nhất!',
        isProductDetail: false
      };
    }
    if (/(tôi có đặt chưa|đặt rồi mà|kiểm tra giúp đơn cũ|mua hồi trước|lịch sử mua hàng)/.test(lower)) {
      return {
        response: '📄 Anh/chị vui lòng để lại số điện thoại đặt hàng, em sẽ kiểm tra lịch sử đơn giúp ngay nhé!',
        isProductDetail: false
      };
    }
    if (/(có người yêu chưa|tên gì|nam hay nữ|sống bao lâu|mày mấy tuổi|lương bao nhiêu)/.test(lower)) {
      return {
        response: '😄 Em là trợ lý ảo Home Power, sinh ra từ dòng code với trái tim yêu khách hàng. Lương em là nụ cười của anh/chị đó ạ!',
        isProductDetail: false
      };
    }
    if (/(gợi ý giúp|mua loại nào|giới thiệu sản phẩm|chọn giùm|giúp chọn|cần tư vấn mua)/.test(lower)) {
      return {
        response: '🤖 Anh/chị có thể nói rõ hơn về ngân sách, diện tích phòng, số người dùng,... để em lọc và giới thiệu sản phẩm phù hợp nhất ạ!',
        isProductDetail: false
      };
    }
    if (/(tiết kiệm điện|hao điện không|xài có tốn điện không|eco không|công suất bao nhiêu)/.test(lower)) {
      return {
        response: '⚡ Rất nhiều sản phẩm bên em có chế độ tiết kiệm điện (Inverter / ECO). Anh/chị cần em kiểm tra dòng nào cụ thể không ạ?',
        isProductDetail: false
      };
    }
    if (/(hóa đơn|xuất hóa đơn|VAT|giấy tờ|bảo hành giấy|giấy tờ mua hàng)/.test(lower)) {
      return {
        response: '📑 Dạ bên em hỗ trợ xuất hóa đơn VAT đầy đủ nếu anh/chị có yêu cầu. Vui lòng để lại thông tin doanh nghiệp nếu cần xuất nhé!',
        isProductDetail: false
      };
    }
    if (/(app|ứng dụng|tải app|theo dõi đơn|kiểm tra đơn|check đơn|nhận được chưa|mã vận đơn)/.test(lower)) {
      return {
        response: '📲 Anh/chị có thể theo dõi đơn hàng bằng cách đăng nhập vào website hoặc kiểm tra qua email/sms. Nếu cần mã đơn, em tra giúp liền!',
        isProductDetail: false
      };
    }
    if (/(shopee|lazada|tiki|mạng xã hội|có trên|mua ngoài sàn|sàn thương mại)/.test(lower)) {
      return {
        response: '🛒 Hiện tại Home Power chỉ bán chính thức trên website này để đảm bảo chất lượng và hỗ trợ tốt nhất. Anh/chị đặt tại đây là yên tâm nhất ạ!',
        isProductDetail: false
      };
    }
    if (/(dễ vệ sinh|rửa được không|tiết kiệm điện|an toàn không|xài hao điện không)/.test(lower)) {
      return {
        response: '♻️ Sản phẩm bên em luôn được chọn lọc kỹ để đảm bảo an toàn, tiết kiệm điện và dễ sử dụng. Anh/chị cần dòng nào cụ thể, em gửi thông tin chi tiết ngay!',
        isProductDetail: false
      };
    }
    if (/(phòng nhỏ|nhà nhỏ|phòng trọ|diện tích nhỏ|nhà thuê)/.test(lower)) {
      return {
        response: '🏠 Dạ với không gian nhỏ, em có thể gợi ý sản phẩm nhỏ gọn, tiết kiệm diện tích và tiện lợi. Anh/chị mô tả kỹ hơn diện tích/phòng nào nhé!',
        isProductDetail: false
      };
    }
    if (/(hủy đơn|dừng lại|đổi địa chỉ|thay địa chỉ|sai địa chỉ|đặt nhầm|chuyển giúp đơn)/.test(lower)) {
      return {
        response: '⚠️ Anh/chị vui lòng nhắn mã đơn hoặc số điện thoại đặt hàng, em sẽ hỗ trợ hủy hoặc điều chỉnh đơn ngay nhé!',
        isProductDetail: false
      };
    }
    if (/(xem tất cả|xem hết|tất cả sản phẩm)/.test(lower)) {
      return {
        response: this.generateProductGrid(products, 'Tất cả sản phẩm hiện có'),
        isProductDetail: false
      };
    }
    if (/(thanh toán|trả tiền|cách thanh toán|thanh toán như thế nào|quẹt thẻ)/.test(lower)) {
      return {
        response: '💳 Hiện tại bên em hỗ trợ thanh toán bằng tiền mặt khi nhận hàng (COD), chuyển khoản ngân hàng, và cả quẹt thẻ tại cửa hàng. Anh/chị yên tâm lựa chọn nhé!',
        isProductDetail: false
      };
    }
    if (/(chính hãng|hàng thật|giả|bảo đảm|bảo mật)/.test(lower)) {
      return {
        response: '🔒 Home Power cam kết 100% sản phẩm chính hãng, có nguồn gốc rõ ràng và hỗ trợ bảo hành đầy đủ. Quý khách có thể yên tâm mua sắm!',
        isProductDetail: false
      };
    }
    if (/(nên mua|loại nào tốt|phù hợp|gợi ý|hợp với tôi|chọn giúp|sản phẩm tốt nhất)/.test(lower)) {
      return {
        response: '🤖 Anh/chị có thể mô tả nhu cầu của mình như diện tích phòng, ngân sách, hay thói quen sử dụng. Em sẽ tư vấn chi tiết sản phẩm phù hợp ạ!',
        isProductDetail: false
      };
    }
    if (/(kích hoạt bảo hành|bảo hành điện tử|cách kích hoạt|bảo hành online)/.test(lower)) {
      return {
        response: '📱 Sản phẩm bên em thường được kích hoạt bảo hành tự động hoặc qua app hãng. Nếu cần hỗ trợ, anh/chị gửi mã sản phẩm cho em kiểm tra ạ!',
        isProductDetail: false
      };
    }
    if (/(phụ kiện|tặng kèm|kèm theo|có gì trong hộp|trong hộp có gì)/.test(lower)) {
      return {
        response: '📦 Hầu hết sản phẩm đều đi kèm đầy đủ phụ kiện tiêu chuẩn từ hãng. Nếu anh/chị cần kiểm tra chi tiết, em có thể gửi thông tin cụ thể ạ!',
        isProductDetail: false
      };
    }
    if (/(hàng mới|sản phẩm mới|về hàng chưa|có hàng mới|sản phẩm hot)/.test(lower)) {
      return {
        response: this.generateProductGrid(products.slice(0, 4), '🔔 Một số sản phẩm mới về'),
        isProductDetail: false
      };
    }
    if (/(ưu đãi|thành viên|tích điểm|chương trình khách hàng|khách thân thiết)/.test(lower)) {
      return {
        response: '🎁 Anh/chị đăng ký tài khoản sẽ được tích điểm, nhận ưu đãi sinh nhật và các chương trình giảm giá dành riêng cho thành viên ạ!',
        isProductDetail: false
      };
    }
    if (/(khi nào nhận|bao lâu có hàng|thời gian nhận hàng|giao mấy ngày)/.test(lower)) {
      return {
        response: '🕒 Thời gian giao hàng trung bình từ 1-3 ngày tùy khu vực. Sau khi đặt hàng, bên em sẽ gọi xác nhận và báo thời gian cụ thể luôn ạ!',
        isProductDetail: false
      };
    }
    if (/(danh mục|nhóm hàng|loại sản phẩm|loại hàng|thiết bị nào)/.test(lower)) {
      const categoryListHtml = categories.map(c => `<li class="hover:underline text-blue-600 cursor-pointer">${c.name}</li>`).join('');
      return {
        response: `<p>📂 Danh mục sản phẩm hiện có:</p><ul class="list-disc pl-4">${categoryListHtml}</ul>`,
        isProductDetail: false
      };
    }
    for (const brand of brands) {
      if (lower.includes(brand.name.toLowerCase()) && lower.includes('nổi bật')) {
        return {
          response: `📌 <strong>${brand.name}</strong>: ${brand.description || 'Chưa có mô tả chi tiết.'}`,
          isProductDetail: false
        };
      }
    }
    const viewDetail = lower.match(/(xem|chi tiết|thông tin).*sản phẩm (.+)/);
    if (viewDetail) {
      const keyword = viewDetail[2].trim();
      const found = products.find(p => p.name.toLowerCase().includes(keyword));
      if (found) {
        const html = await this.generateProductDetailView(found.id);
        return { response: html, isProductDetail: true };
      }
    }
    if (/(giao hàng|vận chuyển|ship hàng|đặt hàng|mua online)/.test(lower)) {
      return {
        response: '🚚 Dạ bên em hỗ trợ giao hàng toàn quốc, nhanh chóng và an toàn. Anh/chị chỉ cần đặt hàng trên website hoặc nhắn với em để được hỗ trợ nhé!',
        isProductDetail: false
      };
    }

    if (/(bảo hành|bảo trì)/.test(lower)) {
      return {
        response: '🛠️ Tất cả sản phẩm đều được bảo hành chính hãng từ 6-24 tháng tùy loại. Anh/chị yên tâm khi mua sắm tại Home Power ạ!',
        isProductDetail: false
      };
    }

    if (/(đổi trả|hoàn tiền|trả hàng)/.test(lower)) {
      return {
        response: '🔄 Dạ bên em hỗ trợ đổi trả trong vòng 7 ngày nếu sản phẩm có lỗi từ nhà sản xuất. Anh/chị nhớ giữ hóa đơn và bao bì đầy đủ nhé!',
        isProductDetail: false
      };
    }

    if (/(shop ở đâu|địa chỉ|chi nhánh|cửa hàng)/.test(lower)) {
      return {
        response: '🏬 Hiện tại bên em đang bán hàng online toàn quốc. Nếu cần hỗ trợ trực tiếp, anh/chị có thể liên hệ hotline <strong>1900 8922</strong> hoặc fanpage nhé!',
        isProductDetail: false
      };
    }

    if (/(làm việc|giờ mở cửa|thời gian làm việc)/.test(lower)) {
      return {
        response: '⏰ Dạ bên em hỗ trợ từ 8:00 đến 21:00 mỗi ngày, kể cả cuối tuần và ngày lễ. Anh/chị cần hỗ trợ lúc nào cũng có nhân viên online ạ!',
        isProductDetail: false
      };
    }
    if (/(chào|xin chào|tư vấn|giúp|mua gì|bắt đầu)/.test(lower)) {
      return {
        response: `<p>👋 Xin chào! Em là trợ lý ảo của Home Power. Anh/chị cần tư vấn sản phẩm nào ạ?</p>${this.generateProductGrid(products.slice(0, 6), 'Một số sản phẩm nổi bật')}`,
        isProductDetail: false
      };
    }

    if (/giảm giá|khuyến mãi/.test(lower)) {
      const saleItems = products.filter(p => p.discount >= 10);
      return {
        response: this.generateProductGrid(saleItems, 'Sản phẩm đang giảm giá'),
        isProductDetail: false
      };
    }

    const brandMatch = lower.match(/thương hiệu (.+)|của (.+)/);
    if (brandMatch) {
      const brandKeyword = (brandMatch[1] || brandMatch[2]).trim();
      const matched = products.filter(p => p.brand?.toLowerCase().includes(brandKeyword));
      if (matched.length) {
        return {
          response: this.generateProductGrid(matched, `Sản phẩm của thương hiệu ${brandKeyword}`),
          isProductDetail: false
        };
      }
      if (!matched.length) {
        return {
          response: `😔 Xin lỗi, hiện chưa có sản phẩm nào thuộc thương hiệu "${brandKeyword}".`,
          isProductDetail: false
        };
      }

    }

    const categoryMap = {
      'quạt': 'Quạt đứng / Quạt treo',
      'quạt điều hoà': 'Quạt đứng / Quạt treo',
      'tủ lạnh': 'Tủ lạnh',
      'máy lọc nước': 'Máy lọc nước',
      'máy lọc không khí': 'Máy lọc không khí'
    };
    for (const keyword in categoryMap) {
      if (lower.includes(keyword)) {
        const matched = products.filter(p => p.category === categoryMap[keyword]);
        if (matched.length) {
          return {
            response: this.generateProductGrid(matched, `Sản phẩm thuộc danh mục ${categoryMap[keyword]}`),
            isProductDetail: false
          };
        } else {
          return {
            response: `😔 Hiện chưa có sản phẩm nào trong danh mục "${categoryMap[keyword]}" cả ạ.`,
            isProductDetail: false
          };
        }
      }
    }


    if (lower.includes('mua online')) {
      return {
        response: '✅ Anh/chị hoàn toàn có thể mua hàng online trên website. Chúng tôi giao hàng tận nơi toàn quốc!',
        isProductDetail: false
      };
    }

    if (lower.includes('liên hệ') || lower.includes('cửa hàng')) {
      return {
        response: '📞 Anh/chị có thể gọi hotline <strong>1900 8922</strong> hoặc nhắn tin qua fanpage để được hỗ trợ.',
        isProductDetail: false
      };
    }

    if (lower.includes('uy tín') || lower.includes('đáng tin')) {
      return {
        response: '🌟 Chúng tôi cam kết cung cấp sản phẩm chính hãng 100%, bảo hành chính hãng và hỗ trợ đổi trả trong 7 ngày.',
        isProductDetail: false
      };
    }

    const matchedProducts = products.filter(p => lower.includes(p.name.toLowerCase()));

    if (matchedProducts.length > 0) {
      return {
        response: this.generateProductGrid(matchedProducts, 'Sản phẩm phù hợp với yêu cầu'),
        isProductDetail: false
      };
    } else {
      return {
        response: `😔 Xin lỗi, hiện tại em chưa tìm thấy sản phẩm nào khớp với yêu cầu "${message.trim()}". Anh/chị có thể thử lại với từ khóa khác nhé!`,
        isProductDetail: false
      };
    }
  }

  async fetchChatProducts(params = {}) {
    const { search = '', category, limit = 50, minPrice, maxPrice, sortBy } = params;
    const where = { isActive: true, deletedAt: null };
    if (search) where.name = { [Op.iLike]: `%${search}%` };
    if (category) where.categoryId = category;

    const productInclude = [
      {
        model: Sku,
        as: 'skus',
        attributes: ['price', 'originalPrice', 'stock'],
        required: true,
        where: {}
      },
      { model: Category, as: 'category', attributes: ['id', 'name'] }
    ];

    if (minPrice || maxPrice) {
      productInclude[0].where.price = {};
      if (minPrice) productInclude[0].where.price[Op.gte] = minPrice;
      if (maxPrice) productInclude[0].where.price[Op.lte] = maxPrice;
    }

    let order = [];
    if (sortBy === 'price-asc') order = [[{ model: Sku, as: 'skus' }, 'price', 'ASC']];
    else if (sortBy === 'price-desc') order = [[{ model: Sku, as: 'skus' }, 'price', 'DESC']];
    else if (sortBy === 'popular') order = [['soldCount', 'DESC']];
    else order = [['createdAt', 'DESC']];

    const products = await Product.findAll({ where, include: productInclude, order, limit });

    return products.map(p => {
      const sku = p.skus?.[0] || {};
      const price = sku.price || 0;
      const originalPrice = sku.originalPrice || 0;
      const discount = originalPrice > price ? Math.round(100 - (price / originalPrice) * 100) : 0;

      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        image: p.thumbnail,
        price: formatCurrencyVND(price),
        originalPrice: originalPrice ? formatCurrencyVND(originalPrice) : null,
        discount,
        reviews: p.reviewCount || Math.floor(Math.random() * 1000) + 100,
        stock: sku.stock || 0,
        status: sku.stock > 0 ? 'Còn hàng' : 'Hết hàng',
        brand: p.brand || null,
        category: p.category?.name || 'Khác',
        soldCount: p.soldCount || 0
      };
    });
  }
  generateProductGrid(products, title = '') {
    if (!products.length) {
      return '<div class="text-center text-gray-500 italic py-8">Không có sản phẩm phù hợp</div>';
    }

    const rows = [];
    for (let i = 0; i < products.length; i += 2) {
      const items = [products[i], products[i + 1]].filter(Boolean).map(p => {
        const price = typeof p.price === 'number'
          ? formatCurrencyVND(p.price)
          : (p.price || 'Đang cập nhật');

        const originalPrice = typeof p.originalPrice === 'number'
          ? formatCurrencyVND(p.originalPrice)
          : '';

        const rating = p.rating ? Math.round(p.rating) : 5;
        const reviewsCount = p.reviews ? p.reviews.toLocaleString('vi-VN') : '0';

        return `
<a href="/product/${p.slug}" class="group block bg-white rounded-md border border-gray-200 shadow-sm overflow-hidden transition hover:shadow-md hover:-translate-y-1 flex flex-col h-[320px] w-full">
  <div class="h-52 w-full flex items-center justify-center bg-gray-50 p-3 overflow-hidden">
    <img src="${p.image}" alt="${p.name}" class="object-contain h-full transition-transform duration-300 group-hover:scale-105" onerror="this.src='/images/default-product.jpg'">
  </div>
  <div class="p-2 text-gray-800 flex flex-col gap-1 text-xs flex-grow">
    <p class="font-medium line-clamp-2 h-[36px]">${p.name}</p>
    <div>
      <span class="text-base font-semibold text-red-600">${price}</span>
      ${originalPrice ? `<span class="text-xs text-gray-400 line-through ml-1">${originalPrice}</span>` : ''}
    </div>
    <div class="flex items-center gap-1 text-yellow-500 text-xs">
      <span>${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}</span>
      <span class="text-gray-500">(${reviewsCount})</span>
    </div>
    <div class="text-[11px] text-gray-600">Trạng thái: <span class="font-medium text-green-600">${p.status || 'Đang cập nhật'}</span></div>
  </div>
</a>
`;
      }).join('');

      rows.push(`<div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">${items}</div>`);
    }

    return `
    ${title ? `<h3 class="text-base font-semibold text-gray-800 mb-3 border-b pb-2">${title}</h3>` : ''}
    <div>${rows.join('')}</div>
  `;
  }

  async generateProductDetailView(productId) {
    const product = await Product.findOne({
      where: { id: productId },
      include: [
        {
          model: Sku,
          as: 'skus',
          include: [{ model: ProductMedia, as: 'ProductMedia', attributes: ['mediaUrl'] }]
        },
        { model: Category, as: 'category' }
      ]
    });

    if (!product) {
      return `
    <div class="flex flex-col items-center justify-center p-6 bg-white rounded-xl shadow-lg max-w-md mx-auto my-10 text-center">
      <svg class="w-16 h-16 text-red-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
      </svg>
      <p class="text-xl font-bold text-gray-800 mb-1">Sản phẩm không tồn tại</p>
      <p class="text-sm text-gray-600">Xin lỗi, chúng tôi không tìm thấy sản phẩm bạn đang tìm kiếm.</p>
    </div>`;
    }

    const sku = product.skus[0] || {};
    const images = (sku.ProductMedia?.map(m => m.mediaUrl) || [product.image]).filter(Boolean);
    const mainImageUrl = images[0] || '/placeholder-product.jpg';
    const price = formatCurrencyVND(sku.price || 0);
    const originalPrice = formatCurrencyVND(sku.originalPrice || 0);

    const hasDiscount = originalPrice > price && originalPrice > 0;

    const imageGallery = images.map((img, idx) => `
    <img src="${img}" alt="Thumbnail ${idx + 1}"
      class="w-14 h-14 md:w-16 md:h-16 object-cover rounded-md border-2 border-gray-200 cursor-pointer 
             transition-all duration-300 ease-in-out transform hover:scale-105 hover:border-blue-500
             ${idx === 0 ? 'border-blue-500 shadow-sm' : ''}"
      onclick="document.getElementById('mainProductImage').src='${img}'; 
               Array.from(this.parentNode.children).forEach(el => el.classList.remove('border-blue-500', 'shadow-sm')); 
               this.classList.add('border-blue-500', 'shadow-sm');">`).join('');

    const rating = product.rating ? Math.round(product.rating) : 5;
    const reviewsCount = product.reviews ? product.reviews.toLocaleString('vi-VN') : '0';
    const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);

    return `
  <div class="p-4 sm:p-5 lg:p-6 bg-white rounded-xl shadow-lg space-y-6 max-w-5xl mx-auto my-8 font-sans">
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10">
      <div class="flex flex-col items-center lg:sticky lg:top-6 lg:self-start">
        <div class="w-full h-72 sm:h-80 md:h-[400px] lg:h-[480px] bg-gray-50 rounded-lg overflow-hidden flex justify-center items-center 
                     border border-gray-100 shadow-sm mb-5 p-2"> <img id="mainProductImage" src="${mainImageUrl}" 
               class="max-w-full max-h-full object-contain rounded-lg" 
               alt="${product.name}" />
        </div>
        <div class="flex flex-nowrap gap-2 justify-center max-w-full overflow-x-auto pb-1 hide-scrollbar">
          ${imageGallery}
        </div>
      </div>

      <div class="flex flex-col justify-start">
        <h1 class="text-2xl sm:text-3xl font-extrabold text-gray-900 mb-2 leading-tight">${product.name}</h1>
        
        <div class="flex flex-col items-start mb-4 sm:mb-5">
<span class="text-3xl sm:text-4xl font-bold text-red-600">
  ${price}
</span>
          ${hasDiscount ? `
            <div class="flex items-center gap-2 mt-1">
              <span class="inline-flex items-center justify-center w-auto px-2 py-1 rounded-full bg-green-500 text-white text-xs font-semibold shrink-0">
                -${Math.round(((originalPrice - price) / originalPrice) * 100)}%
              </span>
             <span class="text-base sm:text-lg text-gray-500 line-through leading-none">
  ${originalPrice}
</span>

            </div>
          ` : ''}
        </div>

        <div class="flex items-center flex-wrap gap-x-4 gap-y-1 mb-4 sm:mb-5">
          ${product.category ? `<p class="text-sm text-gray-600">Danh mục: 
            <span class="font-semibold text-blue-700 hover:underline cursor-pointer">${product.category.name}</span></p>` : ''}
          <div class="text-sm text-yellow-500 flex items-center gap-1">
            <span>${stars}</span>
            <span class="text-gray-500 text-xs">(${reviewsCount} đánh giá)</span>
          </div>
        </div>

        <p class="text-gray-700 leading-relaxed mb-6 sm:mb-8 text-sm max-h-48 overflow-y-auto custom-scrollbar">
          ${product.description || 'Sản phẩm này hiện chưa có mô tả chi tiết. Vui lòng liên hệ để được tư vấn thêm.'}
        </p>

        <div class="mt-auto pt-5 border-t border-gray-200 text-xs text-gray-600 space-y-0.5">
          <p><strong>Mã sản phẩm:</strong> <span class="font-medium text-gray-800">${product.id}</span></p>
          <p><strong>Tình trạng:</strong> <span class="font-semibold text-green-600">Còn hàng</span></p>
          <p class="mt-2 text-blue-700 text-sm font-medium">Liên hệ để đặt hàng hoặc tư vấn chi tiết!</p>
        </div>
      </div>
    </div>
  </div>`;
  }
}

module.exports = new ChatboxController();
