const { Product, Sku, Category, ProductMedia, Brand } = require('../../models');
const { Op } = require('sequelize');
const { generateWithGemini } = require('../../utils/geminiClient');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const rmDiacritics = (s = '') =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
const nrm = (s = '') => rmDiacritics(String(s).toLowerCase().trim());

const CATEGORY_ALIASES = {
    quat: ['quat', 'quat dung', 'quat treo', 'quat dieu hoa', 'quat hoi nuoc'],
    'tu lanh': ['tu lanh', 'tu mat'],
    'may loc nuoc': ['may loc nuoc', 'loc nuoc'],
    'may loc khong khi': ['may loc khong khi', 'loc khong khi', 'may loc bui'],
    'noi chien': ['noi chien', 'noi chien khong dau', 'airfryer'],
    'lo vi song': ['lo vi song', 'lo nuong vi song'],
    'noi com dien': ['noi com', 'noi com dien'],
    tivi: ['tivi', 'tv', 'smart tv'],
    'may lanh': ['may lanh', 'dieu hoa'],
    'may rua chen': ['may rua chen', 'may rua bat'],
    'robot hut bui': ['robot hut bui', 'robot lau nha'],
    'bep tu': ['bep tu', 'bep dien tu']
};

const GROUP_ALIASES = {
    'thiet bi nha bep / nau an': ['nha bep', 'nau an', 'bep', 'thiet bi nha bep', 'thiet bi nau an'],
    'thiet bi loc & suc khoe': ['thiet bi loc', 'suc khoe', 'thiet bi suc khoe', 'loc nuoc', 'loc khong khi'],
    'thiet bi cham soc ca nhan': ['cham soc ca nhan', 'ca nhan', 'lam dep'],
    'thiet bi dien lanh & dien may': ['dien lanh', 'dien may', 'dien lanh dien may']
};

const GROUP_CANONICALS = {
    'thiet bi nha bep / nau an': ['noi chien', 'lo vi song', 'noi com dien', 'bep tu'],
    'thiet bi loc & suc khoe': ['may loc nuoc', 'may loc khong khi'],
    'thiet bi cham soc ca nhan': [],
    'thiet bi dien lanh & dien may': ['quat', 'may lanh', 'tivi', 'tu lanh', 'may rua chen', 'robot hut bui']
};

function categoryLike(categoryName, userKeyword) {
    const c = nrm(categoryName);
    const k = nrm(userKeyword);
    if (c.includes(k) || k.includes(c)) return true;
    for (const [, list] of Object.entries(CATEGORY_ALIASES)) {
        if (list.some(a => c.includes(a)) && list.some(a => k.includes(a))) return true;
        if (list.some(a => k === a) && list.some(a => c.includes(a))) return true;
    }
    return false;
}

function detectCanonicalCategoryFromText(textN) {
    for (const [canonical, list] of Object.entries(CATEGORY_ALIASES)) {
        if (list.some(a => textN.includes(a))) return canonical;
    }
    return null;
}

function detectTopGroup(textN) {
    for (const [g, list] of Object.entries(GROUP_ALIASES)) {
        if (list.some(a => textN.includes(a))) return g;
    }
    return null;
}

function filterByCanonicals(products, canonicals = []) {
    if (!canonicals.length) return products;
    return products.filter(p => canonicals.some(canon => categoryLike(p.category || '', canon)));
}

const asText = (html, extra = {}) => ({
    type: 'text',
    content: html,
    isProductDetail: false,
    replyMessage: null,
    ...extra
});

const asGridOnly = (title, products, extra = {}) => ({
    type: 'product_grid_only',
    content: {
        title: title || 'Sản phẩm đề xuất',
        products: buildProductCards(products),
        noteAfterGrid: extra.noteAfterGrid || undefined
    },
    isProductDetail: false,
    replyMessage: extra.replyMessage || null
});

function buildProductCards(products) {
    return (products || []).map(p => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        image: p.image || null,
        price: typeof p.price === 'number' ? p.price : 0,
        oldPrice: (typeof p.originalPrice === 'number' && p.originalPrice > 0) ? p.originalPrice : null,
        discount: (typeof p.discount === 'number' && p.discount > 0) ? p.discount : null,
        inStock: (p.stock || 0) > 0,
        status: p.status || ((p.stock || 0) > 0 ? 'Còn hàng' : 'Hết hàng'),
        category: p.category || null,
        brand: p.brand || null,
        rating: p.rating || 5,
        soldCount: p.soldCount ?? 0,
        optionValues: [],
        badge: null,
        badgeImage: null,
        flashSaleInfo: undefined
    }));
}

class ChatboxController {
    async chat(req, res) {
        const { message } = req.body;
        if (!message || typeof message !== 'string' || !message.trim()) {
            return res.status(400).json({ message: 'Câu hỏi không hợp lệ hoặc trống.' });
        }
        try {
            await sleep(200);
            const payload = await this.createChatPrompt(message.trim());
            return res.status(200).json({ message: 'Thành công', data: payload });
        } catch (error) {
            return res.status(500).json({ message: 'Đã xảy ra lỗi khi xử lý câu hỏi.' });
        }
    }

    async createChatPrompt(message) {
        const lower = message.toLowerCase();
        const lowerN = nrm(lower);

        const hasBuyIntent = /(mua|muốn mua|tìm mua|mua ở đâu|giá bao nhiêu|bán|báo giá|cần mua)/i.test(lower);

        const productKeywords = [
            'quạt', 'quạt điều hoà', 'tủ lạnh', 'máy lọc nước', 'máy lọc không khí',
            'máy xay', 'máy sấy tóc', 'nồi chiên', 'lò vi sóng', 'nồi cơm điện',
            'máy pha cà phê', 'máy hút bụi', 'tivi', 'máy lạnh', 'máy rửa chén',
            'robot hút bụi', 'máy nước nóng', 'đèn sưởi', 'loa', 'bếp từ'
        ];

        const [productsRaw, categories, brands] = await Promise.all([
            this.fetchChatProducts({ limit: 120 }),
            Category.findAll({ where: { isActive: true }, attributes: ['id', 'name'] }),
            Brand.findAll({ where: { isActive: true }, attributes: ['name', 'description'] })
        ]);

        const msgCatCanonical = detectCanonicalCategoryFromText(lowerN);
        const msgTopGroup = detectTopGroup(lowerN);
        const products = msgTopGroup
            ? filterByCanonicals(productsRaw, GROUP_CANONICALS[msgTopGroup] || [])
            : productsRaw;

        if (hasBuyIntent) {
            for (const keyword of productKeywords) {
                const kN = nrm(keyword);
                if (lowerN.includes(kN)) {
                    const baseList = msgTopGroup
                        ? filterByCanonicals(products, GROUP_CANONICALS[msgTopGroup] || [])
                        : products;
                    const matched = baseList.filter(
                        p => nrm(p.name).includes(kN) || categoryLike(p.category || '', keyword)
                    );
                    return matched.length
                        ? asGridOnly(`Sản phẩm liên quan đến "${keyword}"`, matched)
                        : asText(`Chưa có sản phẩm liên quan đến "${keyword}".`);
                }
            }
        }

        // 3) PHỤ KIỆN
        if (/(phu kien|phụ kiện)/i.test(lower)) {
            let baseCat = msgCatCanonical;
            if (!baseCat) {
                if (lowerN.includes('tivi') || lowerN.includes('tv')) baseCat = 'tivi';
                else if (lowerN.includes('quat')) baseCat = 'quat';
                else if (lowerN.includes('tu lanh')) baseCat = 'tu lanh';
            }
            if (baseCat === 'tivi') {
                const acc = products.filter(p =>
                    (nrm(p.name).includes('dieu khien') || nrm(p.name).includes('remote') || nrm(p.name).includes('khung treo')) &&
                    (categoryLike(p.category || '', 'tivi') || nrm(p.category || '').includes('phu kien'))
                );
                return acc.length ? asGridOnly('Phụ kiện cho Tivi', acc) : asText('Hiện chưa có phụ kiện cho Tivi.');
            }
            if (baseCat === 'quat') {
                const acc = products.filter(p =>
                    (nrm(p.name).includes('luoi') || nrm(p.name).includes('canh') || nrm(p.name).includes('motor')) &&
                    (categoryLike(p.category || '', 'quat') || nrm(p.category || '').includes('phu kien'))
                );
                return acc.length ? asGridOnly('Phụ kiện cho Quạt', acc) : asText('Hiện chưa có phụ kiện cho Quạt.');
            }
        }

        // 4) KHỚP TRỰC TIẾP THEO TÊN
        const directNameHit = products.filter(p => {
            const nameN = nrm(p.name);
            const tokens = lowerN.split(/\s+/).filter(Boolean);
            const ok = tokens.every(t => nameN.includes(t));
            return ok || nameN.includes(lowerN) || lowerN.includes(nameN);
        });
        if (directNameHit.length > 0) {
            const mainCat = msgCatCanonical || directNameHit[0].category || '';
            const filtered = mainCat
                ? directNameHit.filter(p => categoryLike(p.category || '', mainCat) || nrm(p.category || '') === nrm(mainCat))
                : directNameHit;
            const title = mainCat ? `Kết quả của từ khóa ${mainCat}` : ``;
            return asGridOnly(title, filtered.length ? filtered : directNameHit);
        }

        // 5) BÁN CHẠY
        if (/(bestseller|ban chay|bán chạy|hot nhất|mua nhiều|được mua nhiều)/i.test(lower)) {
            const list = [...products].sort((a, b) => (b.soldCount ?? 0) - (a.soldCount ?? 0)).slice(0, 8);
            if (list.length) return asGridOnly(msgTopGroup ? `Sản phẩm bán chạy trong ${msgTopGroup}` : 'Sản phẩm bán chạy', list);
            return asGridOnly('Sản phẩm nổi bật', products.slice(0, 8));
        }

        // 6) THƯƠNG HIỆU NỔI BẬT
        if (/(thuong hieu nao noi bat|thương hiệu nào nổi bật|brand nổi bật|hãng nào tốt|hãng nào uy tín)/i.test(lower)) {
            const map = new Map();
            for (const p of products) {
                const b = (p.brand || 'Khác').trim();
                if (!map.has(b)) map.set(b, { brand: b, totalSold: 0, count: 0, items: [] });
                const obj = map.get(b);
                obj.totalSold += (p.soldCount ?? 0);
                obj.count += 1;
                if (obj.items.length < 12) obj.items.push(p);
            }
            const ranked = [...map.values()].sort((a, b) => (b.totalSold - a.totalSold) || (b.count - a.count));
            const topBrand = ranked[0];
            if (!topBrand || !topBrand.items.length) return asText('Chưa có dữ liệu nổi bật theo thương hiệu.');
            const brandDesc = brands.find(x => nrm(x.name) === nrm(topBrand.brand))?.description || '';
            const intro = `Thương hiệu nổi bật: ${topBrand.brand}. ${brandDesc}`;
            return asText(intro);
        }

        // 7) TỦ LẠNH THEO SỐ NGƯỜI
        const mPeople = lower.match(/(\d+)\s*(người|nguoi)/i);
        if (lower.includes('tủ lạnh') || lower.includes('tu lanh')) {
            if (mPeople) {
                const ppl = Math.max(1, parseInt(mPeople[1], 10));
                // guideline dung tích: 150L cho 1-2 người, +50L mỗi người thêm
                const minL = ppl <= 2 ? 150 : 150 + (ppl - 2) * 50;
                const maxL = minL + 100; // biên độ tham khảo
                const matched = products.filter(p => categoryLike(p.category || '', 'tu lanh'));
                return matched.length
                    ? asGridOnly(
                        `Tủ lạnh gợi ý cho ${ppl} người`,
                        matched,
                        { noteAfterGrid: `Gợi ý dung tích ~${minL}–${maxL}L cho gia đình ${ppl} người.` }
                    )
                    : asText(`Chưa có dữ liệu tủ lạnh phù hợp. Gợi ý dung tích ~${minL}–${maxL}L cho gia đình ${ppl} người.`);
            }
        }

        // 8) QUẠT ĐIỀU HOÀ / ĐIỀU HÒA THEO DIỆN TÍCH
        const mArea = lower.match(/(\d+)\s*(m2|m²)/i);
        if (lower.includes('quạt điều hoà') || lower.includes('quat dieu hoa') || lower.includes('điều hòa') || lower.includes('dieu hoa')) {
            if (mArea) {
                const area = Math.max(5, parseInt(mArea[1], 10));
                const btu = Math.round(area * 600); // tham khảo ~600 BTU/m²
                const matchedFan = products.filter(p =>
                    categoryLike(p.category || '', 'quat') || nrm(p.name).includes('quat dieu hoa')
                );
                return matchedFan.length
                    ? asGridOnly(
                        `Gợi ý cho phòng ~${area}m²`,
                        matchedFan,
                        { noteAfterGrid: `Phòng ${area}m²: tham khảo quạt điều hoà lưu lượng lớn; với điều hòa nên ~${btu.toLocaleString('vi-VN')} BTU.` }
                    )
                    : asText(`Phòng ${area}m²: nên chọn quạt điều hoà lưu lượng lớn; nếu lắp điều hòa, khoảng ~${btu.toLocaleString('vi-VN')} BTU.`);
            }
        }

        // 9) THÔNG TIN CHUNG / HỎI ĐÁP NHANH
        if (/(shop hoạt động bao lâu|mở từ khi nào|ra đời khi nào|shop có lâu chưa|shop mới mở hả)/i.test(lower))
            return asText('Cyberzone đã hoạt động hơn 5 năm trong lĩnh vực điện máy gia dụng.');
        if (/(ai đang tư vấn|bạn là ai|có nhân viên không|ai đang chat|gặp nhân viên thật|nói chuyện với người thật)/i.test(lower))
            return asText('Trợ lý ảo của Cyberzone. Cần hỗ trợ trực tiếp vui lòng gọi 1900 8922 hoặc nhắn fanpage.');
        if (/(khách hàng nói gì|feedback|đánh giá về shop|uy tín không|tin tưởng được không)/i.test(lower))
            return asText('Cyberzone nhận được nhiều đánh giá tích cực về sản phẩm và dịch vụ.');
        if (/(sau khi mua|hỗ trợ sau bán|chăm sóc khách hàng|liên hệ sau mua|bảo trì sản phẩm)/i.test(lower))
            return asText('Khi cần hỗ trợ kỹ thuật sau mua, vui lòng nhắn tại đây hoặc gọi 1900 8922.');
        if (/(so sánh|khác gì|nên chọn cái nào)/i.test(lower))
            return asText('Vui lòng nêu cụ thể hai hoặc nhiều sản phẩm bạn đang cân nhắc để được so sánh.');
        if (/(còn hàng không|có sẵn không|hết hàng chưa|có không vậy)/i.test(lower))
            return asText('Vui lòng cho biết tên sản phẩm cụ thể để kiểm tra tồn kho.');
        if (/(lắp đặt|gắn tận nơi|hướng dẫn dùng|xài sao|khó dùng quá)/i.test(lower))
            return asText('Có hỗ trợ hướng dẫn và lắp đặt tùy sản phẩm.');
        if (/(tôi có đặt chưa|đặt rồi mà|kiểm tra giúp đơn cũ|mua hồi trước|lịch sử mua hàng)/i.test(lower))
            return asText('Vui lòng cung cấp số điện thoại đặt hàng để kiểm tra lịch sử đơn.');
        if (/(gợi ý giúp|mua loại nào|giới thiệu sản phẩm|chọn giùm|giúp chọn|cần tư vấn mua)/i.test(lower))
            return asText('Vui lòng cho biết ngân sách, diện tích phòng, số người dùng để gợi ý chính xác.');
        if (/(tiết kiệm điện|hao điện không|xài có tốn điện không|eco không|công suất bao nhiêu)/i.test(lower))
            return asText('Nhiều sản phẩm có chế độ tiết kiệm điện như Inverter hoặc ECO. Hãy nêu model bạn quan tâm.');
        if (/(hóa đơn|xuất hóa đơn|vat|giấy tờ)/i.test(lower))
            return asText('Hỗ trợ xuất hóa đơn VAT khi có yêu cầu.');
        if (/(app|ứng dụng|theo dõi đơn|kiểm tra đơn|mã vận đơn)/i.test(lower))
            return asText('Có thể theo dõi đơn bằng cách đăng nhập website hoặc kiểm tra email/SMS.');
        if (/(shopee|lazada|tiki|mạng xã hội|mua ngoài sàn)/i.test(lower))
            return asText('Shop chỉ bán chính thức trên website này.');
        if (/(phòng nhỏ|nhà nhỏ|phòng trọ|diện tích nhỏ|nhà thuê)/i.test(lower))
            return asText('Có thể gợi ý thiết bị nhỏ gọn tiết kiệm diện tích. Hãy mô tả diện tích hoặc nhu cầu.');
        if (/(hủy đơn|đổi địa chỉ|sai địa chỉ|đặt nhầm|chuyển giúp đơn)/i.test(lower))
            return asText('Vui lòng cung cấp mã đơn hoặc số điện thoại đặt hàng để hỗ trợ điều chỉnh.');
        if (/(xem tất cả|xem hết|tất cả sản phẩm)/i.test(lower))
            return asGridOnly('Tất cả sản phẩm hiện có', products);
        if (/(thanh toán|trả tiền|cách thanh toán|quẹt thẻ)/i.test(lower))
            return asText('Hỗ trợ COD, chuyển khoản và quẹt thẻ tại cửa hàng.');
        if (/(chính hãng|hàng thật|giả|bảo đảm|bảo mật)/i.test(lower))
            return asText('Sản phẩm chính hãng, nguồn gốc rõ ràng, bảo hành đầy đủ.');
        if (/(nên mua|loại nào tốt|phù hợp|sản phẩm tốt nhất)/i.test(lower))
            return asText('Vui lòng mô tả nhu cầu sử dụng để tư vấn phù hợp.');
        if (/(kích hoạt bảo hành|bảo hành điện tử|cách kích hoạt|bảo hành online)/i.test(lower))
            return asText('Một số sản phẩm kích hoạt bảo hành tự động hoặc qua ứng dụng của hãng.');
        if (/(phụ kiện|tặng kèm|kèm theo|có gì trong hộp)/i.test(lower))
            return asText('Sản phẩm thường kèm phụ kiện tiêu chuẩn theo hãng. Hãy nêu model để kiểm tra chi tiết.');
        if (/(hàng mới|sản phẩm mới|về hàng chưa|sản phẩm hot)/i.test(lower))
            return asGridOnly('Sản phẩm mới', products.slice(0, 4));
        if (/(ưu đãi|thành viên|tích điểm|khách thân thiết)/i.test(lower))
            return asText('Đăng ký tài khoản để tích điểm và nhận ưu đãi thành viên.');
        if (/(khi nào nhận|bao lâu có hàng|thời gian nhận hàng|giao mấy ngày)/i.test(lower))
            return asText('Thời gian giao hàng trung bình 1–3 ngày tùy khu vực.');
        if (/(danh mục|nhóm hàng|loại sản phẩm|thiết bị nào)/i.test(lower)) {
            const items = categories
                .filter(c => !!c?.name)
                .map(c => ({
                    id: c.id,
                    name: c.name,
                    triggerMessage: c.name,   
                }));

            return {
                type: 'category_list',
                content: {
                    title: 'Danh mục sản phẩm',
                    items
                },
                isProductDetail: false,
                replyMessage: null
            };
        }

        // 10) THƯƠNG HIỆU CỤ THỂ + "NỔI BẬT"
        for (const brand of brands) {
            if (lower.includes(brand.name.toLowerCase()) && lower.includes('nổi bật')) {
                return asText(`${brand.name}: ${brand.description || ''}`);
            }
        }

        // 11) XEM CHI TIẾT SẢN PHẨM TỪ CÂU TỰ NHIÊN
        const viewDetail = lower.match(/(xem|chi tiết|thông tin).*sản phẩm (.+)/i);
        if (viewDetail) {
            const keyword = viewDetail[2].trim();
            const kN = nrm(keyword);
            const matched = products.filter(p => nrm(p.name).includes(kN));
            if (matched.length) {
                return asGridOnly(
                    `Sản phẩm khớp với "${keyword}"`,
                    matched.slice(0, 8),
                    { noteAfterGrid: 'Chọn một sản phẩm để xem chi tiết.' }
                );
            }
        }

        // 12) CÁC CÂU HỎI GIAO HÀNG / BẢO HÀNH / ĐỔI TRẢ / ĐỊA CHỈ / GIỜ LÀM
        if (/(giao hàng|vận chuyển|ship hàng|đặt hàng|mua online)/i.test(lower)) return asText('Giao hàng toàn quốc. Có thể đặt hàng trực tuyến tại website.');
        if (/(bảo hành|bảo trì)/i.test(lower)) return asText('Bảo hành chính hãng từ 6 đến 24 tháng tùy sản phẩm.');
        if (/(đổi trả|hoàn tiền|trả hàng)/i.test(lower)) return asText('Đổi trả trong 7 ngày nếu sản phẩm lỗi do nhà sản xuất.');
        if (/(shop ở đâu|địa chỉ|chi nhánh|cửa hàng)/i.test(lower)) return asText('Bán online toàn quốc. Liên hệ 1900 8922 hoặc fanpage để được hỗ trợ.');
        if (/(làm việc|giờ mở cửa|thời gian làm việc)/i.test(lower)) return asText('Hỗ trợ 8:00–21:00 mỗi ngày.');

        // 13) LỌC THEO THƯƠNG HIỆU TỪ CÂU TỰ NHIÊN
        const brandMatch = lower.match(/thương hiệu (.+)|của (.+)/i);
        if (brandMatch) {
            const brandKeyword = (brandMatch[1] || brandMatch[2]).trim();
            const bN = nrm(brandKeyword);
            const matched = products.filter(p => nrm(p.brand || '').includes(bN));
            return matched.length ? asGridOnly(`Sản phẩm của thương hiệu ${brandKeyword}`, matched) : asText(`Chưa có sản phẩm thuộc thương hiệu "${brandKeyword}".`);
        }

        // 14) LỌC THEO DANH MỤC ALIAS
        for (const [canonical, aliasList] of Object.entries(CATEGORY_ALIASES)) {
            if (aliasList.some(a => lowerN.includes(a))) {
                const matched = products.filter(p => categoryLike(p.category || '', canonical));
                return matched.length ? asGridOnly(`Sản phẩm thuộc danh mục ${canonical}`, matched) : asText(`Chưa có sản phẩm trong danh mục "${canonical}".`);
            }
        }

        // 15) CÁC CÂU TẮT THƯỜNG GẶP
        if (lower.includes('mua online')) return asText('Có thể mua online trên website. Giao hàng toàn quốc.');
        if (lower.includes('liên hệ') || lower.includes('cửa hàng')) return asText('Hotline 1900 8922 hoặc fanpage để được hỗ trợ.');
        if (lower.includes('uy tín') || lower.includes('đáng tin')) return asText('Sản phẩm chính hãng, bảo hành đầy đủ, đổi trả 7 ngày.');

        // 16) THỬ GHÉP TÊN SẢN PHẨM NẰM TRONG MESSAGE
        const matchedProducts = products.filter(p => lowerN.includes(nrm(p.name)));
        if (matchedProducts.length > 0) return asGridOnly('Sản phẩm phù hợp với yêu cầu', matchedProducts);

        // 17) FALLBACK: Gọi Gemini qua helper (ĐÃ GIỮ)
        try {
            const prompt = [
                'Bạn là trợ lý bán hàng điện máy của Cyberzone.',
                'Trả lời tiếng Việt, gọn, đúng trọng tâm, không dùng icon/emoji.',
                'Nếu câu hỏi mơ hồ, hãy hỏi lại 1–2 thông tin quan trọng (ngân sách, diện tích phòng, nhu cầu).',
                'Nếu có thể, gợi ý cách tìm sản phẩm trên website bằng từ khóa.',
                `Câu hỏi của khách: "${message}"`
            ].join('\n');

            const text = await generateWithGemini(prompt);
            if (text) return asText(text);
        } catch (e) {
            console.error('[Gemini fallback] error:', e);
        }
        // 18) FALLBACK CUỐI
        return asText(`Chưa tìm thấy sản phẩm khớp với yêu cầu "${message.trim()}". Vui lòng thử từ khóa khác.`);
    }


    async fetchChatProducts(params = {}) {
        const { search = '', category, limit = 50, minPrice, maxPrice, sortBy } = params;
        const where = { isActive: true, deletedAt: null };
        if (search) where.name = { [Op.iLike]: `%${search}%` };
        if (category) where.categoryId = category;

        const productInclude = [
            { model: Sku, as: 'skus', attributes: ['price', 'originalPrice', 'stock'], required: true, where: {} },
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
            const price = Number(sku.price || 0);
            const originalPrice = Number(sku.originalPrice || 0);
            const discount = originalPrice > price ? Math.round(100 - (price / originalPrice) * 100) : 0;
            return {
                id: p.id,
                name: p.name,
                slug: p.slug,
                image: p.thumbnail,
                price,
                originalPrice: originalPrice || null,
                discount,
                reviews: p.reviewCount || Math.floor(Math.random() * 1000) + 100,
                stock: Number(sku.stock || 0),
                status: (sku.stock || 0) > 0 ? 'Còn hàng' : 'Hết hàng',
                brand: p.brand || null,
                category: p.category?.name || 'Khác',
                soldCount: p.soldCount || 0,
                rating: p.rating || 5
            };
        });
    }
}


module.exports = new ChatboxController();
