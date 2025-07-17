const {
    Product,
    Sku,
    Category,
    ProductMedia,
    Brand,
    FlashSaleItem,
    FlashSaleCategory,
    FlashSale,
    SkuVariantValue,
    VariantValue,
    Variant,
    OrderItem, // THÊM DÒNG NÀY VÀO
    Order,     // THÊM DÒNG NÀY VÀO
    Review,    // THÊM DÒNG NÀY VÀO
} = require("../../models");
const { Op, Sequelize } = require("sequelize");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { formatCurrencyVND } = require("../../utils/number");

const { processSkuPrices } = require('../../helpers/priceHelper');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

class ChatboxController {
    constructor() {
        this.allActiveFlashSaleItemsMap = new Map();
        this.allActiveCategoryDealsMap = new Map();
        this.flashSaleDataLoaded = false;
    }

    async loadFlashSaleData() {
        if (this.flashSaleDataLoaded) {
            return;
        }

        const now = new Date();
        const allActiveFlashSales = await FlashSale.findAll({
            where: {
                isActive: true,
                deletedAt: null,
                startTime: { [Op.lte]: now },
                endTime: { [Op.gte]: now },
            },
            include: [
                {
                    model: FlashSaleItem,
                    as: 'flashSaleItems',
                    required: false,
                    attributes: ['id', 'flashSaleId', 'skuId', 'salePrice', 'quantity', 'maxPerUser',
                        [
                            Sequelize.literal(`(
                                SELECT COALESCE(SUM(oi.quantity), 0)
                                FROM orderitems oi
                                INNER JOIN orders o ON oi.orderId = o.id
                                WHERE oi.flashSaleId = flashSaleItems.flashSaleId
                                AND oi.skuId = flashSaleItems.skuId
                                AND o.status IN ('completed', 'delivered')
                            )`),
                            'soldQuantityForFlashSaleItem'
                        ]
                    ],
                    include: [{
                        model: Sku,
                        as: 'sku',
                        attributes: ['id', 'skuCode', 'price', 'originalPrice', 'stock', 'productId'],
                        include: [
                            { model: Product, as: 'product', attributes: ['categoryId'] },
                        ]
                    }],
                },
                {
                    model: FlashSaleCategory,
                    as: 'categories',
                    required: false,
                    include: [{
                        model: FlashSale,
                        as: 'flashSale',
                        attributes: ['endTime'],
                        required: false
                    }]
                }
            ]
        });

        allActiveFlashSales.forEach(saleEvent => {
            const saleEndTime = saleEvent.endTime;
            const saleId = saleEvent.id;

            (saleEvent.flashSaleItems || []).forEach(fsi => {
                const sku = fsi.sku;
                if (!sku) return;

                const skuId = sku.id;
                const flashItemSalePrice = parseFloat(fsi.salePrice);
                const soldForThisItem = parseInt(fsi.dataValues.soldQuantityForFlashSaleItem || 0);
                const flashLimit = fsi.quantity;

                const isSoldOutForThisItem = flashLimit != null && soldForThisItem >= flashLimit;

                if (!isSoldOutForThisItem) {
                    if (!this.allActiveFlashSaleItemsMap.has(skuId) || flashItemSalePrice < this.allActiveFlashSaleItemsMap.get(skuId).salePrice) {
                        this.allActiveFlashSaleItemsMap.set(skuId, {
                            salePrice: flashItemSalePrice,
                            quantity: flashLimit,
                            soldQuantity: soldForThisItem,
                            maxPerUser: fsi.maxPerUser,
                            flashSaleId: saleId,
                            flashSaleEndTime: saleEndTime
                        });
                    }
                }
            });

            (saleEvent.categories || []).forEach(fsc => {
                const categoryId = fsc.categoryId;
                if (!this.allActiveCategoryDealsMap.has(categoryId)) {
                    this.allActiveCategoryDealsMap.set(categoryId, []);
                }
                this.allActiveCategoryDealsMap.get(categoryId).push({
                    discountType: fsc.discountType,
                    discountValue: fsc.discountValue,
                    priority: fsc.priority,
                    endTime: saleEndTime,
                    flashSaleId: saleId,
                    flashSaleCategoryId: fsc.id
                });
            });
        });
        this.flashSaleDataLoaded = true;
    }

    async chat(req, res) {
        const { message } = req.body;
        if (!message || typeof message !== "string" || !message.trim()) {
            return res.status(400).json({ message: "Câu hỏi không hợp lệ hoặc trống." });
        }

        try {
            await sleep(300);

            if (!this.flashSaleDataLoaded) {
                await this.loadFlashSaleData();
            }

            const { type, data, isProductDetail, message: replyMessage } = await this.processChatMessage(message.trim());

            return res.status(200).json({
                message: "Thành công",
                data: {
                    type,
                    content: data,
                    isProductDetail,
                    replyMessage
                },
            });
        } catch (error) {
            console.error("[Lỗi Chatbot]", error);
            return res.status(500).json({ message: "Đã xảy ra lỗi khi xử lý câu hỏi." });
        }
    }

    async processChatMessage(message) {
        const lower = message.toLowerCase();
        const productKeywords = [
            "quạt", "quạt điều hoà", "tủ lạnh", "máy lọc nước", "máy lọc không khí",
            "máy xay", "máy sấy tóc", "nồi chiên", "lò vi sóng", "nồi cơm điện",
            "máy pha cà phê", "máy hút bụi", "tivi", "máy lạnh", "máy rửa chén",
            "robot hút bụi", "máy nước nóng", "đèn sưởi", "loa", "bếp từ"
        ];

        const [products, categories, brands] = await Promise.all([
            this.fetchChatProducts({ limit: 50, allActiveFlashSaleItemsMap: this.allActiveFlashSaleItemsMap, allActiveCategoryDealsMap: this.allActiveCategoryDealsMap }),
            Category.findAll({ where: { isActive: true }, attributes: ['id', 'name'] }),
            Brand.findAll({ where: { isActive: true }, attributes: ['name', 'description'] })
        ]);

        for (const keyword of productKeywords) {
            if ((lower.includes('mua') || lower.includes('cần') || lower.includes('muốn') || lower.includes('xem')) &&
                lower.includes(keyword)) {
                const matched = products.filter(p =>
                    p.name.toLowerCase().includes(keyword) ||
                    p.category?.toLowerCase().includes(keyword)
                );
                if (matched.length) {
                    return {
                        type: 'product_grid',
                        data: {
                            title: `Các sản phẩm liên quan đến "${keyword}"`,
                            products: matched
                        },
                        isProductDetail: false
                    };
                } else {
                    return {
                        type: 'text',
                        data: `😔 Hiện tại chưa có sản phẩm nào liên quan đến "${keyword}".`,
                        isProductDetail: false
                    };
                }
            }
        }

        if (/(shop hoạt động bao lâu|mở từ khi nào|ra đời khi nào|shop có lâu chưa|shop mới mở hả)/.test(lower)) {
            return {
                type: 'text',
                data: `📅 **Home Power** đã hoạt động hơn 5 năm trong lĩnh vực điện máy gia dụng và luôn được khách hàng đánh giá cao về chất lượng dịch vụ và sản phẩm.`,
                isProductDetail: false
            };
        }
        if (/(ai đang tư vấn|bạn là ai|có nhân viên không|ai đang chat|gặp nhân viên thật|nói chuyện với người thật)/.test(lower)) {
            return {
                type: 'text',
                data: `🤖 Em là trợ lý ảo của **Home Power**. Nếu anh/chị cần hỗ trợ trực tiếp từ nhân viên, em có thể kết nối qua hotline **1900 8922** hoặc gửi tin nhắn fanpage ạ!`,
                isProductDetail: false
            };
        }
        if (/(khách hàng nói gì|feedback|đánh giá về shop|uy tín không|tin tưởng được không)/.test(lower)) {
            return {
                type: 'text',
                data: `🌟 **Home Power** nhận được hàng nghìn phản hồi tích cực từ khách hàng về chất lượng sản phẩm, tốc độ giao hàng và hỗ trợ sau bán. Anh/chị có thể tham khảo đánh giá trực tiếp trên từng sản phẩm ạ!`,
                isProductDetail: false
            };
        }
        if (/(sau khi mua|hỗ trợ sau bán|chăm sóc khách hàng|liên hệ sau mua|bảo trì sản phẩm)/.test(lower)) {
            return {
                type: 'text',
                data: `🙋‍♂️ Sau khi mua, nếu có bất kỳ thắc mắc nào về sản phẩm hoặc cần hỗ trợ kỹ thuật, anh/chị cứ nhắn với em hoặc gọi **1900 8922**. Đội ngũ kỹ thuật bên em luôn sẵn sàng hỗ trợ ạ!`,
                isProductDetail: false
            };
        }
        if (/(có đẹp trai không|có người yêu chưa|trợ lý ảo à|ai code mày|tán tao đi|đang rảnh không)/.test(lower)) {
            return {
                type: 'text',
                data: '😄 Em là trợ lý ảo chỉ giỏi bán hàng và hỗ trợ thôi ạ, còn tán tỉnh chắc cần update phiên bản mới rồi đó anh/chị!',
                isProductDetail: false
            };
        }
        if (/(bực quá|mất dạy|chậm quá|không hài lòng|dịch vụ tệ|hủy đơn đi|tôi không mua nữa)/.test(lower)) {
            return {
                type: 'text',
                data: '😥 Em rất xin lỗi nếu trải nghiệm chưa tốt. Anh/chị vui lòng để lại số điện thoại hoặc chi tiết, bên em sẽ gọi lại hỗ trợ ngay ạ!',
                isProductDetail: false
            };
        }
        if (/(so sánh|khác gì|cái nào ngon hơn|loại nào ngon hơn|nên chọn cái nào)/.test(lower)) {
            return {
                type: 'text',
                data: '🤔 Anh/chị vui lòng cho biết đang phân vân giữa những sản phẩm nào ạ? Em sẽ giúp so sánh chi tiết để dễ chọn hơn!',
                isProductDetail: false
            };
        }
        if (/(còn hàng không|có sẵn không|hết hàng chưa|có không vậy)/.test(lower)) {
            return {
                type: 'text',
                data: '📦 Anh/chị vui lòng cho em biết tên sản phẩm cụ thể, em kiểm tra tồn kho giúp liền ạ!',
                isProductDetail: false
            };
        }
        if (/(lắp đặt|gắn tận nơi|hướng dẫn dùng|xài sao|khó dùng quá)/.test(lower)) {
            return {
                type: 'text',
                data: '🔧 Bên em có hỗ trợ hướng dẫn sử dụng và lắp đặt tận nơi tùy sản phẩm. Anh/chị cần hỗ trợ dòng nào, em gửi hướng dẫn nhé!',
                isProductDetail: false
            };
        }
        if (/(cho mẹ xài|cho ba mẹ|người già dùng được không|bé dùng được không)/.test(lower)) {
            return {
                type: 'text',
                data: '👨‍👩‍👧 Em rất hiểu nhu cầu này ạ! Nếu anh/chị mô tả cụ thể hơn về người dùng và mục đích, em sẽ gợi ý sản phẩm phù hợp nhất!',
                isProductDetail: false
            };
        }
        if (/(tôi có đặt chưa|đặt rồi mà|kiểm tra giúp đơn cũ|mua hồi trước|lịch sử mua hàng)/.test(lower)) {
            return {
                type: 'text',
                data: '📄 Anh/chị vui lòng để lại số điện thoại đặt hàng, em sẽ kiểm tra lịch sử đơn giúp ngay nhé!',
                isProductDetail: false
            };
        }
        if (/(có người yêu chưa|tên gì|nam hay nữ|sống bao lâu|mày mấy tuổi|lương bao nhiêu)/.test(lower)) {
            return {
                type: 'text',
                data: '😄 Em là trợ lý ảo **Home Power**, sinh ra từ dòng code với trái tim yêu khách hàng. Lương em là nụ cười của anh/chị đó ạ!',
                isProductDetail: false
            };
        }
        if (/(gợi ý giúp|mua loại nào|giới thiệu sản phẩm|chọn giùm|giúp chọn|cần tư vấn mua)/.test(lower)) {
            return {
                type: 'text',
                data: '🤖 Anh/chị có thể nói rõ hơn về ngân sách, diện tích phòng, số người dùng,... để em lọc và giới thiệu sản phẩm phù hợp nhất ạ!',
                isProductDetail: false
            };
        }
        if (/(tiết kiệm điện|hao điện không|xài có tốn điện không|eco không|công suất bao nhiêu)/.test(lower)) {
            return {
                type: 'text',
                data: '⚡ Rất nhiều sản phẩm bên em có chế độ tiết kiệm điện (Inverter / ECO). Anh/chị cần em kiểm tra dòng nào cụ thể không ạ?',
            };
        }
        if (/(hóa đơn|xuất hóa đơn|VAT|giấy tờ|bảo hành giấy|giấy tờ mua hàng)/.test(lower)) {
            return {
                type: 'text',
                data: '📑 Dạ bên em hỗ trợ xuất hóa đơn VAT đầy đủ nếu anh/chị có yêu cầu. Vui lòng để lại thông tin doanh nghiệp nếu cần xuất nhé!',
                isProductDetail: false
            };
        }
        if (/(app|ứng dụng|tải app|theo dõi đơn|kiểm tra đơn|nhận được chưa|mã vận đơn)/.test(lower)) {
            return {
                type: 'text',
                data: '📲 Anh/chị có thể theo dõi đơn hàng bằng cách đăng nhập vào website hoặc kiểm tra qua email/sms. Nếu cần mã đơn, em tra giúp liền!',
                isProductDetail: false
            };
        }
        if (/(shopee|lazada|tiki|mạng xã hội|có trên|mua ngoài sàn|sàn thương mại)/.test(lower)) {
            return {
                type: 'text',
                data: '🛒 Hiện tại **Home Power** chỉ bán chính thức trên website này để đảm bảo chất lượng và hỗ trợ tốt nhất. Anh/chị đặt tại đây là yên tâm nhất ạ!',
                isProductDetail: false
            };
        }
        if (/(dễ vệ sinh|rửa được không|tiết kiệm điện|an toàn không|xài hao điện không)/.test(lower)) {
            return {
                type: 'text',
                data: '♻️ Sản phẩm bên em luôn được chọn lọc kỹ để đảm bảo an toàn, tiết kiệm điện và dễ sử dụng. Anh/chị cần dòng nào cụ thể, em gửi thông tin chi tiết ngay!',
                isProductDetail: false
            };
        }
        if (/(phòng nhỏ|nhà nhỏ|phòng trọ|diện tích nhỏ|nhà thuê)/.test(lower)) {
            return {
                type: 'text',
                data: '🏠 Dạ với không gian nhỏ, em có thể gợi ý sản phẩm nhỏ gọn, tiết kiệm diện tích và tiện lợi. Anh/chị mô tả kỹ hơn diện tích/phòng nào nhé!',
                isProductDetail: false
            };
        }
        if (/(hủy đơn|dừng lại|đổi địa chỉ|thay địa chỉ|sai địa chỉ|đặt nhầm|chuyển giúp đơn)/.test(lower)) {
            return {
                type: 'text',
                data: '⚠️ Anh/chị vui lòng nhắn mã đơn hoặc số điện thoại đặt hàng, em sẽ hỗ trợ hủy hoặc điều chỉnh đơn ngay nhé!',
                isProductDetail: false
            };
        }
        if (/(xem tất cả|xem hết|tất cả sản phẩm)/.test(lower)) {
            return {
                type: 'product_grid',
                data: {
                    title: 'Tất cả sản phẩm hiện có',
                    products: products
                },
                isProductDetail: false
            };
        }
        if (/(thanh toán|trả tiền|cách thanh toán|thanh toán như thế nào|quẹt thẻ)/.test(lower)) {
            return {
                type: 'text',
                data: '💳 Hiện tại bên em hỗ trợ thanh toán bằng tiền mặt khi nhận hàng (COD), chuyển khoản ngân hàng, và cả quẹt thẻ tại cửa hàng. Anh/chị yên tâm lựa chọn nhé!',
                isProductDetail: false
            };
        }
        if (/(chính hãng|hàng thật|giả|bảo đảm|bảo mật)/.test(lower)) {
            return {
                type: 'text',
                data: '🔒 **Home Power** cam kết 100% sản phẩm chính hãng, có nguồn gốc rõ ràng và hỗ trợ bảo hành đầy đủ. Quý khách có thể yên tâm mua sắm!',
                isProductDetail: false
            };
        }
        if (/(nên mua|loại nào tốt|phù hợp|gợi ý|hợp với tôi|chọn giúp|sản phẩm tốt nhất)/.test(lower)) {
            return {
                type: 'text',
                data: '🤖 Anh/chị có thể mô tả nhu cầu của mình như diện tích phòng, ngân sách, hay thói quen sử dụng. Em sẽ tư vấn chi tiết sản phẩm phù hợp nhất ạ!',
                isProductDetail: false
            };
        }
        if (/(kích hoạt bảo hành|bảo hành điện tử|cách kích hoạt|bảo hành online)/.test(lower)) {
            return {
                type: 'text',
                data: '📱 Sản phẩm bên em thường được kích hoạt bảo hành tự động hoặc qua app hãng. Nếu cần hỗ trợ, anh/chị gửi mã sản phẩm cho em kiểm tra ạ!',
                isProductDetail: false
            };
        }
        if (/(phụ kiện|tặng kèm|kèm theo|có gì trong hộp|trong hộp có gì)/.test(lower)) {
            return {
                type: 'text',
                data: '📦 Hầu hết sản phẩm đều đi kèm đầy đủ phụ kiện tiêu chuẩn từ hãng. Nếu anh/chị cần kiểm tra chi tiết, em có thể gửi thông tin cụ thể ạ!',
                isProductDetail: false
            };
        }
        if (/(hàng mới|sản phẩm mới|về hàng chưa|có hàng mới|sản phẩm hot)/.test(lower)) {
            return {
                type: 'product_grid',
                data: {
                    title: '🔔 Một số sản phẩm mới về',
                    products: products.slice(0, 4)
                },
                isProductDetail: false
            };
        }
        if (/(ưu đãi|thành viên|tích điểm|chương trình khách hàng|khách thân thiết)/.test(lower)) {
            return {
                type: 'text',
                data: '🎁 Anh/chị đăng ký tài khoản sẽ được tích điểm, nhận ưu đãi sinh nhật và các chương trình giảm giá dành riêng cho thành viên ạ!',
                isProductDetail: false
            };
        }
        if (/(khi nào nhận|bao lâu có hàng|thời gian nhận hàng|giao mấy ngày)/.test(lower)) {
            return {
                type: 'text',
                data: '🕒 Thời gian giao hàng trung bình từ 1-3 ngày tùy khu vực. Sau khi đặt hàng, bên em sẽ gọi xác nhận và báo thời gian cụ thể luôn ạ!',
                isProductDetail: false
            };
        }
        if (/(danh mục|nhóm hàng|loại sản phẩm|loại hàng|thiết bị nào)/.test(lower)) {
            const categoryListText = categories.map(c => `• ${c.name}`).join('\n');
            return {
                type: 'text',
                data: `<p>📂 Danh mục sản phẩm hiện có:</p><pre>${categoryListText}</pre>`,
                isProductDetail: false
            };
        }
        for (const brand of brands) {
            if (lower.includes(brand.name.toLowerCase()) && lower.includes('nổi bật')) {
                return {
                    type: 'text',
                    data: `📌 **${brand.name}**: ${brand.description || 'Chưa có mô tả chi tiết.'}`,
                    isProductDetail: false
                };
            }
        }
        const viewDetail = lower.match(/(xem|chi tiết|thông tin).*sản phẩm (.+)/);
        if (viewDetail) {
            const keyword = viewDetail[2].trim();
            const found = products.find(p => p.name.toLowerCase().includes(keyword));
            if (found) {
                // Truyền các Map Flash Sale đã tải vào fetchProductDetail
                const productDetailData = await this.fetchProductDetail(found.id, this.allActiveFlashSaleItemsMap, this.allActiveCategoryDealsMap);
                if (productDetailData) {
                    return { type: 'product_detail', data: productDetailData, isProductDetail: true };
                } else {
                    return { type: 'text', data: `Không tìm thấy chi tiết sản phẩm này.`, isProductDetail: false };
                }
            } else {
                return {
                    type: 'text', data: `Không tìm thấy sản phẩm "${keyword}".`,
                    isProductDetail: false
                };
            }
        }
        if (/(giao hàng|vận chuyển|ship hàng|đặt hàng|mua online)/.test(lower)) {
            return {
                type: 'text',
                data: '🚚 Dạ bên em hỗ trợ giao hàng toàn quốc, nhanh chóng và an toàn. Anh/chị chỉ cần đặt hàng trên website hoặc nhắn với em để được hỗ trợ nhé!',
                isProductDetail: false
            };
        }

        if (/(bảo hành|bảo trì)/.test(lower)) {
            return {
                type: 'text',
                data: '🛠️ Tất cả sản phẩm đều được bảo hành chính hãng từ 6-24 tháng tùy loại. Anh/chị yên tâm khi mua sắm tại **Home Power** ạ!',
                isProductDetail: false
            };
        }

        if (/(đổi trả|hoàn tiền|trả hàng)/.test(lower)) {
            return {
                type: 'text',
                data: '🔄 Dạ bên em hỗ trợ đổi trả trong vòng 7 ngày nếu sản phẩm có lỗi từ nhà sản xuất. Anh/chị nhớ giữ hóa đơn và bao bì đầy đủ nhé!',
                isProductDetail: false
            };
        }

        if (/(shop ở đâu|địa chỉ|chi nhánh|cửa hàng)/.test(lower)) {
            return {
                type: 'text',
                data: '🏬 Hiện tại bên em đang bán hàng online toàn quốc. Nếu cần hỗ trợ trực tiếp, anh/chị có thể liên hệ hotline **1900 8922** hoặc fanpage nhé!',
                isProductDetail: false
            };
        }

        if (/(làm việc|giờ mở cửa|thời gian làm việc)/.test(lower)) {
            return {
                type: 'text',
                data: '⏰ Dạ bên em hỗ trợ từ 8:00 đến 21:00 mỗi ngày, kể cả cuối tuần và ngày lễ. Anh/chị cần hỗ trợ lúc nào cũng có nhân viên online ạ!',
                isProductDetail: false
            };
        }
        if (/(chào|xin chào|tư vấn|giúp|mua gì|bắt đầu)/.test(lower)) {
            return {
                type: 'product_grid',
                replyMessage: `<p>👋 Xin chào! Em là trợ lý ảo của **Home Power**. Anh/chị cần tư vấn sản phẩm nào ạ?</p>`,
                data: {
                    title: 'Một số sản phẩm nổi bật',
                    products: products.slice(0, 6)
                },
                isProductDetail: false
            };
        }

        if (/giảm giá|khuyến mãi/.test(lower)) {
            const saleItems = products.filter(p => p.discount && p.discount >= 1);
            return {
                type: 'product_grid',
                data: {
                    title: 'Sản phẩm đang giảm giá',
                    products: saleItems
                },
                isProductDetail: false
            };
        }
        function normalizeVN(str) {
            return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        }

        const brandMatch = lower.match(/thương hiệu (.+)|của (.+)/);
        if (brandMatch) {
            const brandKeyword = (brandMatch[1] || brandMatch[2]).trim();
            const matched = products.filter(p => p.brand?.toLowerCase().includes(brandKeyword));
            if (matched.length) {
                return {
                    type: 'product_grid',
                    data: {
                        title: `Sản phẩm của thương hiệu ${brandKeyword}`,
                        products: matched
                    },
                    isProductDetail: false
                };
            } else {
                return {
                    type: 'text',
                    data: `😔 Xin lỗi, hiện chưa có sản phẩm nào thuộc thương hiệu "${brandKeyword}".`,
                    isProductDetail: false
                };
            }
        }


        if (lower.includes('mua online')) {
            return {
                type: 'text',
                data: '✅ Anh/chị hoàn toàn có thể mua hàng online trên website. Chúng tôi giao hàng tận nơi toàn quốc!',
                isProductDetail: false
            };
        }

        if (lower.includes('liên hệ') || lower.includes('cửa hàng')) {
            return {
                type: 'text',
                data: '📞 Anh/chị có thể gọi hotline **1900 8922** hoặc nhắn tin qua fanpage để được hỗ trợ.',
            };
        }

        if (lower.includes('uy tín') || lower.includes('đáng tin')) {
            return {
                type: 'text',
                data: '🌟 Chúng tôi cam kết cung cấp sản phẩm chính hãng 100%, có nguồn gốc rõ ràng và hỗ trợ bảo hành đầy đủ. Quý khách có thể yên tâm mua sắm!',
                isProductDetail: false
            };
        }
        for (const cat of categories) {
            if (normalizeVN(lower).includes(normalizeVN(cat.name))) {
                const matched = products.filter(
                    p => normalizeVN(p.category)?.includes(normalizeVN(cat.name))
                );
                if (matched.length) {
                    return {
                        type: 'product_grid',
                        data: {
                            title: `Sản phẩm thuộc danh mục "${cat.name}"`,
                            products: matched
                        },
                        isProductDetail: false
                    };
                } else {
                    return {
                        type: 'text',
                        data: `😔 Hiện chưa có sản phẩm nào trong danh mục "${cat.name}" cả ạ.`,
                        isProductDetail: false
                    };
                }
            }
        }


        const matchedProducts = products.filter(p => lower.includes(p.name.toLowerCase()));

        if (matchedProducts.length > 0) {
            return {
                type: 'product_grid',
                data: {
                    title: 'Sản phẩm phù hợp với yêu cầu',
                    products: matchedProducts
                },
                isProductDetail: false
            };
        } else {
            if (genAI) {
                try {
                    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
                    const result = await model.generateContent(message);
                    const aiResponse = result.text();
                    return { type: 'text', data: aiResponse, isProductDetail: false };
                } catch (aiError) {
                    console.error("Gemini AI error:", aiError);
                    return {
                        type: 'text',
                        data: `😔 Xin lỗi, hiện tại em chưa hiểu rõ câu hỏi. Anh/Chị vui lòng thử lại.`,
                        isProductDetail: false
                    };
                }
            } else {
                return {
                    type: 'text',
                    data: `😔 Xin lỗi, hiện tại em chưa hiểu rõ câu hỏi. Anh/Chị vui lòng thử lại.`,
                    isProductDetail: false
                };
            }
        }
    }

    async fetchChatProducts({ limit = 50, allActiveFlashSaleItemsMap, allActiveCategoryDealsMap } = {}) {
        const products = await Product.findAll({
            where: { isActive: true, deletedAt: null },
            include: [
                {
                    model: Sku,
                    as: "skus",
                    required: true,
                    attributes: ["id", "price", "originalPrice", "stock"],
                    include: [
                        {
                            model: SkuVariantValue,
                            as: "variantValues",
                            include: [
                                {
                                    model: VariantValue,
                                    as: "variantValue",
                                    include: [{ model: Variant, as: "variant" }]
                                }
                            ]
                        },
                        { model: ProductMedia, as: "ProductMedia", attributes: ["mediaUrl"] },
                        { // Thêm OrderItem để tính soldCount
                            model: OrderItem,
                            as: 'OrderItems',
                            attributes: ['quantity'],
                            required: false,
                            include: [{
                                model: Order,
                                as: 'order',
                                attributes: [],
                                where: { status: { [Op.in]: ['delivered', 'completed'] } },
                                required: true
                            }]
                        },
                        { // Thêm Review để tính averageRating
                            model: Review,
                            as: 'reviews',
                            attributes: ['rating'],
                            required: false
                        }
                    ],
                },
                {
                    model: Category,
                    as: "category",
                    attributes: ["id", "name"],
                },
                { model: Brand, as: "brand", attributes: ["name"] },
            ],
            limit,
            order: [["createdAt", "DESC"]],
        });

        const result = products.map(p => {
            let bestSku = null;
            let minPrice = Infinity;

            // Tính soldCount và averageRating ở cấp độ sản phẩm
            let totalSold = 0;
            let totalRating = 0;
            let reviewCount = 0;

            p.skus.forEach(sku => {
                const skuData = sku.toJSON();
                skuData.Product = { category: { id: p.category?.id } };

                const { price: finalPrice, originalPrice, discount, hasDeal, flashSaleInfo } = processSkuPrices(skuData, allActiveFlashSaleItemsMap, allActiveCategoryDealsMap);

                const optionNames = sku.variantValues?.map(
                    vv => vv.variantValue?.value
                ).join(", ") || "";
                const optionValuesData = sku.variantValues?.map(vv => ({
                    type: vv.variantValue?.variant?.type,
                    value: vv.variantValue?.value,
                    colorCode: vv.variantValue?.colorCode
                })) || [];

                // Tính soldCount cho sản phẩm
                totalSold += (sku.OrderItems?.reduce((s, oi) => s + (oi.quantity || 0), 0) || 0);

                // Tính averageRating cho sản phẩm
                sku.reviews?.forEach(review => {
                    const r = Number(review.rating);
                    if (r > 0) {
                        totalRating += r;
                        reviewCount += 1;
                    }
                });


                if (finalPrice > 0 && finalPrice < minPrice && (hasDeal || !flashSaleInfo)) {
                    bestSku = {
                        skuId: sku.id,
                        optionNames,
                        optionValues: optionValuesData,
                        price: finalPrice,
                        originalPrice: originalPrice,
                        discount: discount,
                        stock: sku.stock,
                        ProductMedia: sku.ProductMedia,
                        flashSaleInfo: flashSaleInfo,
                        hasDeal: hasDeal
                    };
                    minPrice = finalPrice;
                } else if (finalPrice > 0 && minPrice === Infinity) {
                    bestSku = {
                        skuId: sku.id,
                        optionNames,
                        optionValues: optionValuesData,
                        price: finalPrice,
                        originalPrice: originalPrice,
                        discount: discount,
                        stock: sku.stock,
                        ProductMedia: sku.ProductMedia,
                        flashSaleInfo: flashSaleInfo,
                        hasDeal: hasDeal
                    };
                    minPrice = finalPrice;
                }
            });

            const primary = bestSku || {
                price: 0,
                originalPrice: null,
                discount: null,
                stock: 0,
                ProductMedia: [],
                optionNames: "",
                optionValues: []
            };

            const imageUrl = p.thumbnail || primary.ProductMedia?.[0]?.mediaUrl;

            // Tính toán averageRating cuối cùng
            const averageRating = reviewCount > 0 ? parseFloat((totalRating / reviewCount).toFixed(1)) : 0;


            return {
                id: p.id,
                name: primary.optionNames ? `${p.name} (${primary.optionNames})` : p.name,
                slug: p.slug,
                image: imageUrl,
                price: primary.price,
                oldPrice: primary.originalPrice,
                discount: primary.discount,
                inStock: primary.stock > 0, // THÊM inStock DẠNG BOOLEAN
                status: primary.stock > 0 ? "Còn hàng" : "Hết hàng",
                category: p.category?.name || "Khác",
                brand: p.brand?.name || null,
                optionValues: primary.optionValues,
                rating: averageRating, // Sử dụng averageRating đã tính toán
                soldCount: totalSold, // Sử dụng totalSold đã tính toán
                quantity: primary.stock,
                badge: p.badge || null,
                badgeImage: p.badgeImage || null,
                flashSaleInfo: primary.flashSaleInfo
            };
        });

        return result;
    }

    async fetchProductDetail(productId, allActiveFlashSaleItemsMap, allActiveCategoryDealsMap) {
        const product = await Product.findByPk(productId, {
            include: [
                {
                    model: Sku,
                    as: "skus",
                    required: true,
                    attributes: ["id", "skuCode", "price", "originalPrice", "stock"],
                    include: [
                        { model: SkuVariantValue, as: "variantValues", include: [{ model: VariantValue, as: "variantValue", include: [{ model: Variant, as: "variant" }] }] },
                        { model: ProductMedia, as: "ProductMedia", attributes: ["mediaUrl", "type", "sortOrder"] },
                        { // Thêm OrderItem để tính soldCount cho chi tiết sản phẩm
                            model: OrderItem,
                            as: 'OrderItems',
                            attributes: ['quantity'],
                            required: false,
                            include: [{
                                model: Order,
                                as: 'order',
                                attributes: [],
                                where: { status: { [Op.in]: ['delivered', 'completed'] } },
                                required: true
                            }]
                        },
                        { // Thêm Review để tính averageRating cho chi tiết sản phẩm
                            model: Review,
                            as: 'reviews',
                            attributes: ['rating'],
                            required: false
                        }
                    ],
                },
                { model: Category, as: "category", attributes: ["id", "name", "slug"] },
                { model: Brand, as: "brand", attributes: ["name", "description"] },
            ],
        });

        if (!product) {
            return null;
        }

        const productData = product.toJSON();

        let totalRatingForProductDetail = 0;
        let reviewCountForProductDetail = 0;
        let totalSoldForProductDetail = 0;

        productData.skus = (productData.skus || []).map(sku => {
            const skuData = sku;
            skuData.Product = { category: { id: productData.categoryId } };

            const priceResults = processSkuPrices(skuData, allActiveFlashSaleItemsMap, allActiveCategoryDealsMap);

            // Tính soldCount cho từng SKU và tổng hợp lại cho sản phẩm
            totalSoldForProductDetail += (sku.OrderItems?.reduce((s, oi) => s + (oi.quantity || 0), 0) || 0);

            // Tính averageRating cho từng SKU và tổng hợp lại cho sản phẩm
            sku.reviews?.forEach(review => {
                const r = Number(review.rating);
                if (r > 0) {
                    totalRatingForProductDetail += r;
                    reviewCountForProductDetail += 1;
                }
            });

            return {
                ...skuData,
                price: priceResults.price,
                originalPrice: priceResults.originalPrice,
                flashSaleInfo: priceResults.flashSaleInfo,
                discount: priceResults.discount,
                hasDeal: priceResults.hasDeal
            };
        });

        productData.skus.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
        productData.defaultSku = productData.skus.length > 0 ? productData.skus[0] : null;

        const averageRatingForProductDetail = reviewCountForProductDetail > 0 ? parseFloat((totalRatingForProductDetail / reviewCountForProductDetail).toFixed(1)) : 0;

        return {
            id: productData.id,
            name: productData.name,
            slug: productData.slug,
            thumbnail: productData.thumbnail,
            brand: productData.brand?.name,
            category: productData.category?.name,
            skus: productData.skus,
            defaultSku: productData.defaultSku,
            rating: averageRatingForProductDetail, // Thêm averageRating cho chi tiết sản phẩm
            soldCount: totalSoldForProductDetail,  // Thêm soldCount cho chi tiết sản phẩm
            // Các trường khác bạn muốn hiển thị trong chi tiết sản phẩm
        };
    }

}

module.exports = new ChatboxController();