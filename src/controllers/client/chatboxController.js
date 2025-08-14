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
    OrderItem,
    Order,
    Review,
} = require("../../models");
const { Op, Sequelize } = require("sequelize");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { formatCurrencyVND } = require("../../utils/number");
const { processSkuPrices } = require('../../helpers/priceHelper');
const { askLLMStructured } = require("../ai/aiStructured");
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
function normalizeVN(str = '') {
    return str
        .toString()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
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

            const { type, data, isProductDetail, replyMessage } =
                await this.processChatMessage(message.trim());

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
        const msgNorm = normalizeVN(lower);
        const tokens = msgNorm.split(/[^\p{L}\p{N}]+/u).filter(t => t.length >= 2);

        // Score liên quan cho product
        function relevanceScore(p) {
            const nameNorm = normalizeVN(p.name || '');
            const brandNorm = normalizeVN(p.brand || '');
            const catNorm = normalizeVN(p.category || '');
            let score = 0;

            for (const t of tokens) {
                const inBrand = brandNorm.includes(t);
                const inName = nameNorm.includes(t);
                const inCat = catNorm.includes(t);

                if (inBrand) score += 10;   // ưu tiên brand
                if (inName) score += 6;
                if (inCat) score += 3;

                // bonus nếu bắt đầu bằng từ khóa
                if (brandNorm.startsWith(t)) score += 3;
                if (nameNorm.startsWith(t)) score += 2;

                // bonus match nguyên cụm (vd: "mitsubishi electric")
                const phrase = tokens.join(' ');
                if (phrase.length >= 2) {
                    if (brandNorm.includes(phrase)) score += 4;
                    if (nameNorm.includes(phrase)) score += 2;
                }
            }
            return score;
        }

        // Thông điệp và regex chặn off-topic
        const OFFTOPIC_MSG =
            '🙏 Xin lỗi, em chỉ hỗ trợ các câu hỏi liên quan đến sản phẩm, đơn hàng, giao hàng, bảo hành của cửa hàng ạ. Anh/chị vui lòng cho em biết nhu cầu hoặc tên sản phẩm nhé!';

        const RE_OFFTOPIC_HARD =
            /(bóng\s*đá|world\s*cup|euro\s*\d{2,4}|bóng rổ|game|liên quân|free\s*fire|pubg|tiktok|idol|chính trị|bầu cử|người yêu|tán tỉnh|ai code mày|lập trình|viết code|hack|crack)/i;

        // Intent thương mại dùng cho whitelist
        const RE = {
            greet: /(chào|xin chào|hello|hi|tư vấn|giúp|mua gì|bắt đầu)/i,
            discount: /(giảm giá|khuyến mãi|sale|flash\s*sale)/i,
            shipping: /(giao hàng|vận chuyển|ship hàng|đặt hàng|mua online)/i,
            warranty: /(bảo hành|bảo trì)/i,
            returnRefund: /(đổi trả|hoàn tiền|trả hàng)/i,
            contact: /(liên hệ|cửa hàng|shop ở đâu|địa chỉ|chi nhánh)/i,
            worktime: /(làm việc|giờ mở cửa|thời gian làm việc)/i,
            payment: /(thanh toán|trả tiền|cách thanh toán|quẹt thẻ)/i,
            trust: /(uy tín|đáng tin|chính hãng|hàng thật|giả|bảo đảm|bảo mật)/i,
            compare: /(so sánh|khác gì|cái nào ngon hơn|loại nào ngon hơn|nên chọn cái nào)/i,
            stock: /(còn hàng không|có sẵn không|hết hàng chưa|có không vậy)/i,
            install: /(lắp đặt|gắn tận nơi|hướng dẫn dùng|xài sao|khó dùng quá)/i,
            family: /(cho mẹ xài|cho ba mẹ|người già dùng được không|bé dùng được không)/i,
            orderHistory: /(tôi có đặt chưa|đặt rồi mà|kiểm tra giúp đơn cũ|mua hồi trước|lịch sử mua hàng)/i,
            fun: /(có đẹp trai không|có người yêu chưa|trợ lý ảo à|ai code mày|tán tao đi|đang rảnh không|mày mấy tuổi|lương bao nhiêu)/i,
            angry: /(bực quá|mất dạy|chậm quá|không hài lòng|dịch vụ tệ|hủy đơn đi|tôi không mua nữa)/i,
            energy: /(tiết kiệm điện|hao điện không|xài có tốn điện không|eco|công suất bao nhiêu)/i,
            invoice: /(hóa đơn|xuất hóa đơn|vat|giấy tờ|bảo hành giấy|giấy tờ mua hàng)/i,
            app: /(app|ứng dụng|tải app|theo dõi đơn|kiểm tra đơn|nhận được chưa|mã vận đơn)/i,
            social: /(shopee|lazada|tiki|mạng xã hội|mua ngoài sàn|sàn thương mại)/i,
            smallRoom: /(phòng nhỏ|nhà nhỏ|phòng trọ|diện tích nhỏ|nhà thuê)/i,
            cancelOrChange: /(hủy đơn|dừng lại|đổi địa chỉ|thay địa chỉ|sai địa chỉ|đặt nhầm|chuyển giúp đơn)/i,
            allProducts: /(xem tất cả|xem hết|tất cả sản phẩm)/i,
            newArrivals: /(hàng mới|sản phẩm mới|về hàng chưa|có hàng mới|sản phẩm hot)/i,
            loyal: /(ưu đãi|thành viên|tích điểm|chương trình khách hàng|khách thân thiết)/i,
            deliveryTime: /(khi nào nhận|bao lâu có hàng|thời gian nhận hàng|giao mấy ngày)/i,
            categoriesAsk: /(danh mục|nhóm hàng|loại sản phẩm|loại hàng|thiết bị nào)/i,
            detail: /(xem|chi tiết|thông tin).*sản phẩm\s+(.+)/i,
            brandIntent: /(?:thuong\s*hieu|thuong-hieu|thuonghieu|thương\s*hiệu)\s+(.+)|(?:cua|của)\s+(.+)/i,
        };

        const RE_COMMERCE_INTENTS = [
            RE.greet, RE.discount, RE.shipping, RE.warranty, RE.returnRefund, RE.contact,
            RE.worktime, RE.payment, RE.trust, RE.compare, RE.stock, RE.install, RE.family,
            RE.orderHistory, RE.energy, RE.invoice, RE.app, RE.social, RE.smallRoom,
            RE.cancelOrChange, RE.allProducts, RE.newArrivals, RE.loyal, RE.deliveryTime,
            RE.categoriesAsk, RE.detail, RE.brandIntent
        ];

        // 1) Off-topic cứng -> từ chối ngay
        if (RE_OFFTOPIC_HARD.test(lower)) {
            return { type: 'text', data: OFFTOPIC_MSG, isProductDetail: false };
        }

        // 2) Lấy dữ liệu TRƯỚC khi dùng (tránh dùng biến trước khi khởi tạo)
        const [products, categories, brands] = await Promise.all([
            this.fetchChatProducts({
                limit: 50,
                allActiveFlashSaleItemsMap: this.allActiveFlashSaleItemsMap,
                allActiveCategoryDealsMap: this.allActiveCategoryDealsMap
            }),
            Category.findAll({ where: { isActive: true }, attributes: ['id', 'name'] }),
            Brand.findAll({ where: { isActive: true }, attributes: ['name', 'description'] })
        ]);

        // 3) Guard: nếu không có intent thương mại và không “đụng” dữ liệu cửa hàng -> chặn
        const brandSet = new Set(brands.map(b => normalizeVN(b.name || '')));
        const catSet = new Set(categories.map(c => normalizeVN(c.name || '')));

        let hitsFromData = 0;
        for (const t of tokens) { if (brandSet.has(t)) { hitsFromData = 1; break; } }
        if (!hitsFromData) {
            for (const t of tokens) { if (catSet.has(t)) { hitsFromData = 1; break; } }
        }
        if (!hitsFromData) {
            for (const p of products) {
                const nm = normalizeVN(p.name || '');
                if (tokens.some(t => nm.includes(t))) { hitsFromData = 1; break; }
            }
        }

        const hasCommerceIntent = RE_COMMERCE_INTENTS.some(re => re.test(lower));
        if (!hasCommerceIntent && !hitsFromData) {
            return { type: 'text', data: OFFTOPIC_MSG, isProductDetail: false };
        }

        // ====== Các nhánh intent bình thường ======
        if (RE.greet.test(lower)) {
            return {
                type: 'product_grid',
                replyMessage: `<p>👋 Xin chào! Em là trợ lý ảo của <b>Home Power</b>. Anh/chị cần tư vấn sản phẩm nào ạ?</p>`,
                data: { title: 'Một số sản phẩm nổi bật', products: products.slice(0, 6) },
                isProductDetail: false
            };
        }

        if (RE.discount.test(lower)) {
            const saleItems = products.filter(p => p.discount && p.discount >= 1);
            const tableRows = saleItems.slice(0, 5).map(p => [
                `<a href='/product/${p.slug}' class='text-blue-600 underline'>${p.name}</a>`,
                `${formatCurrencyVND(p.price)}`,
                p.soldCount > 999 ? `${Math.floor(p.soldCount / 1000)}k+` : `${p.soldCount}`
            ]);
            return {
                type: 'product_grid',
                data: {
                    title: 'Sản phẩm đang giảm giá',
                    descriptionTop: '🔥 Dưới đây là các sản phẩm đang khuyến mãi nổi bật:',
                    table: { headers: ['Tên sản phẩm', 'Giá (VNĐ)', 'Đã bán'], rows: tableRows },
                    products: saleItems,
                    noteAfterGrid: '💡 Giá khuyến mãi chỉ áp dụng trong thời gian có hạn – nhanh tay kẻo lỡ!'
                },
                isProductDetail: false
            };
        }

        if (RE.shipping.test(lower)) {
            return { type: 'text', data: '🚚 Bên em giao hàng toàn quốc, nhanh chóng và an toàn. Anh/chị đặt trực tiếp trên website hoặc nhắn với em nhé!', isProductDetail: false };
        }
        if (RE.payment.test(lower)) {
            return { type: 'text', data: '💳 Hỗ trợ COD, chuyển khoản ngân hàng, và quẹt thẻ tại cửa hàng. Anh/chị chọn phương thức tiện nhất nhé!', isProductDetail: false };
        }
        if (RE.warranty.test(lower)) {
            return { type: 'text', data: '🛠️ Tất cả sản phẩm bảo hành chính hãng 6–24 tháng (tuỳ loại). Anh/chị yên tâm mua sắm tại <b>ZYBERZONE</b> ạ!', isProductDetail: false };
        }
        if (RE.returnRefund.test(lower)) {
            return { type: 'text', data: '🔄 Đổi trả trong 7 ngày nếu sản phẩm lỗi do NSX. Nhớ giữ hoá đơn/bao bì đầy đủ giúp em nha!', isProductDetail: false };
        }
        if (RE.contact.test(lower)) {
            return { type: 'text', data: '🏬 Mình đang bán online toàn quốc. Cần hỗ trợ trực tiếp, gọi hotline <b>1900 8922</b> hoặc nhắn fanpage nhé!', isProductDetail: false };
        }
        if (RE.worktime.test(lower)) {
            return { type: 'text', data: '⏰ Hỗ trợ 8:00–21:00 mỗi ngày, kể cả cuối tuần & ngày lễ.', isProductDetail: false };
        }
        if (RE.trust.test(lower) && !RE.discount.test(lower)) {
            return { type: 'text', data: '🔒 <b>ZYBERZONE</b> cam kết 100% chính hãng, nguồn gốc rõ ràng, bảo hành đầy đủ. Mua là yên tâm!', isProductDetail: false };
        }
        if (RE.compare.test(lower)) {
            return { type: 'text', data: '🤔 Anh/chị cho em biết đang phân vân giữa những sản phẩm nào nhé, em so sánh chi tiết ngay!', isProductDetail: false };
        }
        if (RE.stock.test(lower)) {
            return { type: 'text', data: '📦 Anh/chị cho em xin tên sản phẩm cụ thể, em kiểm tra tồn kho giúp liền ạ!', isProductDetail: false };
        }
        if (RE.install.test(lower)) {
            return { type: 'text', data: '🔧 Bên em hỗ trợ hướng dẫn sử dụng và lắp đặt (tuỳ sản phẩm). Anh/chị cần dòng nào em gửi hướng dẫn ngay!', isProductDetail: false };
        }
        if (RE.family.test(lower)) {
            return { type: 'text', data: '👨‍👩‍👧 Nếu anh/chị mô tả cụ thể người dùng/mục đích, em sẽ gợi ý đúng nhu cầu hơn ạ!', isProductDetail: false };
        }
        if (RE.orderHistory.test(lower)) {
            return { type: 'text', data: '📄 Anh/chị để lại số điện thoại đặt hàng, em kiểm tra lịch sử đơn ngay nhé!', isProductDetail: false };
        }
        if (RE.fun.test(lower)) {
            // Off-topic mềm -> điều hướng
            return { type: 'text', data: OFFTOPIC_MSG, isProductDetail: false };
        }
        if (RE.angry.test(lower)) {
            return { type: 'text', data: '😥 Em xin lỗi nếu trải nghiệm chưa tốt. Anh/chị để lại số ĐT hoặc chi tiết, bên em sẽ gọi hỗ trợ ngay ạ!', isProductDetail: false };
        }
        if (RE.energy.test(lower)) {
            return { type: 'text', data: '⚡ Nhiều sản phẩm có Inverter/ECO tiết kiệm điện. Anh/chị cần dòng nào em kiểm tra cụ thể nhé!', isProductDetail: false };
        }
        if (RE.invoice.test(lower)) {
            return { type: 'text', data: '📑 Bên em xuất hoá đơn VAT đầy đủ khi anh/chị yêu cầu. Cho em xin thông tin DN nếu cần nhé!', isProductDetail: false };
        }
        if (RE.app.test(lower)) {
            return { type: 'text', data: '📲 Theo dõi đơn bằng cách đăng nhập website, hoặc kiểm tra email/SMS. Cần mã đơn? Em tra ngay!', isProductDetail: false };
        }
        if (RE.social.test(lower)) {
            return { type: 'text', data: '🛒 Hiện <b>ZYBERZONE</b> chỉ bán chính thức trên website để đảm bảo dịch vụ & bảo hành tốt nhất ạ!', isProductDetail: false };
        }
        if (RE.smallRoom.test(lower)) {
            return { type: 'text', data: '🏠 Không gian nhỏ nên chọn sản phẩm gọn, tiết kiệm diện tích. Anh/chị mô tả diện tích/phòng để em tư vấn ạ!', isProductDetail: false };
        }
        if (RE.cancelOrChange.test(lower)) {
            return { type: 'text', data: '⚠️ Anh/chị gửi mã đơn hoặc số ĐT đặt hàng, em hỗ trợ hủy/chỉnh sửa ngay nhé!', isProductDetail: false };
        }
        if (RE.allProducts.test(lower)) {
            return { type: 'product_grid', data: { title: 'Tất cả sản phẩm hiện có', products }, isProductDetail: false };
        }
        if (RE.newArrivals.test(lower)) {
            return { type: 'product_grid', data: { title: '🔔 Sản phẩm mới về', products: products.slice(0, 4) }, isProductDetail: false };
        }
        if (RE.loyal.test(lower)) {
            return { type: 'text', data: '🎁 Đăng ký tài khoản để tích điểm, nhận ưu đãi sinh nhật và khuyến mãi riêng cho thành viên nhé!', isProductDetail: false };
        }
        if (RE.deliveryTime.test(lower)) {
            return { type: 'text', data: '🕒 Giao hàng trung bình 1–3 ngày (tuỳ khu vực). Sau khi đặt, bên em sẽ gọi xác nhận & báo thời gian cụ thể.', isProductDetail: false };
        }
        if (RE.categoriesAsk.test(lower)) {
            const categoryListText = categories.map(c => `• ${c.name}`).join('\n');
            return { type: 'text', data: `<p>📂 Danh mục sản phẩm hiện có:</p><pre>${categoryListText}</pre>`, isProductDetail: false };
        }

        // 6) Intent: "thương hiệu X" / "của X"
        const brandIntent = msgNorm.match(/(?:thuong\s*hieu|thuong-hieu|thuonghieu|thương\s*hiệu)\s+(.+)|(?:cua|của)\s+(.+)/);
        if (brandIntent) {
            const kw = (brandIntent[1] || brandIntent[2] || '').replace(/[?.!,;:]+$/, '').trim();
            const kwTokens = kw.split(/[^\p{L}\p{N}]+/u).filter(t => t.length >= 2);

            const matched = products
                .map(p => {
                    const oldTokens = tokens.slice();
                    tokens.length = 0; tokens.push(...kwTokens);
                    const s = relevanceScore(p);
                    tokens.length = 0; tokens.push(...oldTokens);
                    return { p, s };
                })
                .filter(x => x.s > 0)
                .sort((a, b) => b.s - a.s || (b.p.soldCount || 0) - (a.p.soldCount || 0))
                .map(x => x.p);

            if (matched.length) {
                return { type: 'product_grid', data: { title: `Sản phẩm của thương hiệu ${kw}`, products: matched.slice(0, 50) }, isProductDetail: false };
            }
            return { type: 'text', data: `😔 Xin lỗi, hiện chưa có sản phẩm nào thuộc thương hiệu "${kw}".`, isProductDetail: false };
        }

        // 7) Intent: danh mục (match theo tên category không dấu)
        for (const cat of categories) {
            const catNorm = normalizeVN(cat.name || '');
            if (catNorm && msgNorm.includes(catNorm)) {
                const matched = products.filter(p => normalizeVN(p.category || '').includes(catNorm));
                if (matched.length) {
                    return { type: 'product_grid', data: { title: `Sản phẩm thuộc danh mục "${cat.name}"`, products: matched }, isProductDetail: false };
                }
                return { type: 'text', data: `😔 Hiện chưa có sản phẩm nào trong danh mục "${cat.name}" cả ạ.`, isProductDetail: false };
            }
        }

        // 8) Intent: xem chi tiết "xem/chi tiết/thông tin sản phẩm XXX"
        const mDetail = lower.match(RE.detail);
        if (mDetail) {
            const keyword = (mDetail[2] || '').trim();
            const found = products.find(p => normalizeVN(p.name).includes(normalizeVN(keyword)));
            if (found) {
                const productDetailData = await this.fetchProductDetail(
                    found.id,
                    this.allActiveFlashSaleItemsMap,
                    this.allActiveCategoryDealsMap
                );
                if (productDetailData) {
                    return { type: 'product_detail', data: productDetailData, isProductDetail: true };
                }
                return { type: 'text', data: `Không tìm thấy chi tiết sản phẩm này.`, isProductDetail: false };
            }
            return { type: 'text', data: `Không tìm thấy sản phẩm "${keyword}".`, isProductDetail: false };
        }

        // 9) Tìm theo token (tên/brand/category) – linh hoạt cho mọi câu tự do
        const matchedProducts = products
            .map(p => ({ p, s: relevanceScore(p) }))
            .filter(x => x.s > 0)
            .sort((a, b) => b.s - a.s || (b.p.soldCount || 0) - (a.p.soldCount || 0))
            .map(x => x.p);

        if (matchedProducts.length > 0) {
            return {
                type: 'product_grid',
                data: { title: `Kết quả cho: "${message}"`, products: matchedProducts.slice(0, 50) },
                isProductDetail: false
            };
        }

        // 10) Nếu vẫn không ra -> hỏi LLM có schema
        if (process.env.GEMINI_API_KEY) {
            try {
                const structured = await askLLMStructured(message);
                if (structured.type === 'product_detail') {
                    return {
                        type: 'text',
                        data: '<p>Em đã tìm thấy chi tiết sản phẩm. Anh/Chị bấm vào sản phẩm trong danh sách để xem thêm nhé!</p>',
                        isProductDetail: false
                    };
                }
                return {
                    type: structured.type,
                    data: structured.content,
                    isProductDetail: structured.isProductDetail,
                    replyMessage: structured.replyMessage || undefined
                };
            } catch (aiError) {
                console.error("Gemini structured error:", aiError);
                return { type: 'text', data: '😔 Xin lỗi, hiện tại em chưa hiểu rõ câu hỏi. Anh/Chị vui lòng thử lại.', isProductDetail: false };
            }
        }

        return { type: 'text', data: '😔 Xin lỗi, hiện tại em chưa hiểu rõ câu hỏi. Anh/Chị vui lòng thử lại.', isProductDetail: false };
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
            rating: averageRatingForProductDetail,
            soldCount: totalSoldForProductDetail,

        };
    }

}

module.exports = new ChatboxController();