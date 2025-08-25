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
const { processSkuPrices } = require("../../helpers/priceHelper");
const { askLLMStructured } = require("../ai/aiStructured");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

const STORE_NAME = "ZYBERZONE";

/* ========== Utils ========== */
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function normalizeVN(str = "") {
    return str
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "D")
        .toLowerCase();
}
const norm = (x) => normalizeVN(x || "");
const STOPWORDS = new Set([
    "khong", "không", "co", "có", "ko", "k", "la", "là", "o", "ở", "dau", "đâu", "gi", "gì",
    "nnao", "nao", "nào", "cai", "cái", "va", "và", "hay", "hoac", "hoặc", "voi", "với",
    "là", "thi", "thì", "làm", "làm", "toi", "tôi", "ban", "bạn", "anh", "chi", "chị",
    "em", "toi", "tao", "may", "mày", "minh", "mình", "biet", "biết", "khac", "khác",
    "nua", "nữa", "vay", "vậy", "de", "để", "cho", "cần", "muon", "muốn"
]);

/* ========== Use-case patterns (để map gợi ý) ========== */
const USE_CASE_PATTERNS = {
    kitchen: ["nha bep", "bep", "nau an", "noi", "chao", "noi com", "dao", "thot", "muong", "dua", "lo vi song", "noi chien", "may xay", "am sieu toc", "hop dung thuc pham"],
    haircut: ["cat toc", "keo cat toc", "ton g do", "may cat toc", "may cao rau", "tao kieu toc", "u on toc", "gay uon"],
    decor: ["trang tri", "decor", "den led", "den treo tuong", "den ngu", "den trang tri", "khung anh", "de ban", "binh hoa", "giay dan tuong", "ke trang tri", "cay gia"],
    cleaning: ["ve sinh", "lau nha", "may hut bui", "cay lau nha", "bot giat", "nuoc lau", "robot hut bui"],
    office: ["van phong", "ban lam viec", "ghe van phong", "ke sach", "hop but", "den ban", "ke file"],
    gaming: ["gaming", "ban phim", "chuot choi game", "tai nghe gaming", "tay cam", "ban gaming", "ghe gaming", "led rgb"],
    lighting: ["chieu sang", "den", "den bulp", "den thong minh", "den op tran", "den chum", "den soi"],
    audio: ["loa", "tai nghe", "soundbar", "am li", "micro", "bluetooth speaker", "loa keo"],
    travel: ["du lich", "vali", "tui du lich", "binh giu nhiet", "goi co", "o sac du phong"],
    baby: ["tre em", "em be", "sua", "binh sua", "ta", "xe day", "giuong cui", "do choi tre em"],
    beauty: ["lam dep", "may rua mat", "may tri mun", "may tri lieu", "may hut mun", "may say toc", "may dau goi"],
    pet: ["thu cung", "cho meo", "hat cho meo", "long vuot", "nha thu cung", "tui van chuyen"],
    car: ["o to", "xe hoi", "phu kien xe", "cam hanh trinh", "nuoc hoa xe", "de dien thoai xe"],
    sport: ["the thao", "tap gym", "tap yoga", "tham tap", "ta tay", "day khang luc", "xe dap"],
    study: ["hoc tap", "hoc sinh", "den hoc", "but chi", "so vo", "hop mau", "bang viet"],
};

/* ========== Fun rules (ý nhị) ========== */
const FUN_RULES = [
    { regex: /(dep trai|xinh gai|dep hon|ngoai hinh|lam dep|groom|make ?up)/i, label: "Làm đẹp & Grooming", useCases: ["beauty", "haircut"], witty: "Đẹp trai hơn mỗi ngày thì phải có phụ kiện đi kèm 😎 Xem thử mấy món này:" },
    { regex: /(tan tinh|hen ho|qua tang|romance|tinh yeu)/i, label: "Quà tặng & Lãng mạn", useCases: ["decor", "lighting", "audio", "beauty"], witty: "Chuyện tình cảm để vũ trụ lo ✨ Quà cáp thì để ZYBERZONE lo!" },
    { regex: /(vui|haha|hehe|memes?|troll|chat cho vui|xam|nham nhi)/i, label: "Đồ vui vẻ & giải trí", useCases: ["decor", "lighting", "audio", "gaming"], witty: "😂 Vui là chính, thử nghía vài món tăng dopamine nè:" }
];
const detectFunSubintent = (t = "") => FUN_RULES.find(r => r.regex.test(t)) || null;

function pickProductsByUseCases(products = [], keys = [], limit = 12) {
    const filtered = products.filter(p => Array.isArray(p.useCases) && p.useCases.some(tag => keys.includes(tag)));
    if (filtered.length) return filtered.slice(0, limit);
    const sale = products.filter(p => p.discount && p.discount >= 1);
    if (sale.length) return sale.slice(0, limit);
    return products.slice(0, limit);
}
function classifyUseCasesByText(name = "", categoryName = "") {
    const text = `${norm(name)} ${norm(categoryName)}`;
    const tags = []; for (const [k, pats] of Object.entries(USE_CASE_PATTERNS)) if (pats.some(kw => text.includes(kw))) tags.push(k);
    return tags;
}

/* ========== Regex tổng & hàm lọc nhanh ========== */
const RE_DETAIL_WITH = /(xem|chi tiết|thông tin).*sản phẩm\s+(.+)/i;
const RE_DETAIL_NO = /(xem|chi\s*tiet|thong\s*tin).*(san\s*pham)\s+(.+)/i;
const RE_CATEGORIES_UD = /(danh muc|nhom hang|loai san pham|loai hang|thiet bi nao)/i;
const RE_THIS_NOACCENT = /(tu\s*van|xem|chi\s*tiet|thong\s*tin).*(san\s*pham)\s*(nay|do)?\b/i;

/* --- Bộ lọc off-topic & special intents --- */
const RE_OFFTOPIC_HARD =
    /(bong\s*da|bóng\s*đá|euro(\s*\d{2,4})?|world\s*cup|đội\s*tuyển|cầu\s*thủ|bóng\s*rổ|idol|chính\s*trị|bầu\s*cử|ai\s*code\s*mày|mày\s*là\s*trai\s*hay\s*gái|giới\s*tính|hack|crack|địt|lồn|cặc|má\s*mày|đụ\s*má|đéo|fuck|shit|bitch|dm|con\s*(đỉ|đĩ|cặc|cac)|cc)/i;
const RE_CODE = /(giải\s*code|viết\s*code|code\s+này|code\s*mẫu|lập\s*trình|program|script|thuật\s*toán|hàm\s+code|debug|chạy\s*code)/i;
const RE_LOVE = /(người\s*yêu|nguoi\s*yeu|ny\b|crush|bồ|có\s*bồ|yêu\s*đương|yeu\s*duong|tình\s*yêu|tinh\s*yeu|hẹn\s*hò|hen\s*ho|romance|tán\s*tỉnh|tan\s*tinh|kết\s*hôn|ket\s*hon|đám\s*cưới|dam\s*cuoi|ghen|tỏ\s*tình|to\s*tinh)/i;
const RE_BAKING = /(làm\s*bánh|lam\s*banh|học\s*làm\s*bánh|hoc\s*lam\s*banh|công\s*thức\s*bánh|cong\s*thuc\s*banh|bánh\s*kem|banh\s*mi|bánh\s*mì|cookie|cupcake|bánh\s*ngọt|bánh\s*bông\s*lan|lò\s*nướng|lo\s*nuong|máy\s*trộn|may\s*tron|máy\s*đánh\s*trứng|may\s*danh\s*trung|khuôn\s*bánh|bot\s*mi|bột\s*mì|whipping\s*cream|socola|sô\s*cola|bơ|đường|duong|vani|sữa\s*đặc|sua\s*dac)/i;

function isOffTopicHard(t = "") { return RE_OFFTOPIC_HARD.test(t.toLowerCase()); }
function isCodeQuestion(t = "") { return RE_CODE.test(t.toLowerCase()); }
function isLoveQuestion(t = "") { return RE_LOVE.test(t.toLowerCase()); }
function isBakingQuestion(t = "") { return RE_BAKING.test(t.toLowerCase()); }

/* ========== Privacy Guard: chặn tìm thông tin người khác (PII) ========== */
// PII patterns
const RE_PHONE = /\b(?:0|\+?84)\d{8,11}\b/;
const RE_EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const RE_ID = /\b(?:cmnd|cccd|căn\s*cước|chứng\s*minh|passport|hộ\s*chiếu)\b.*?\b\d{6,12}\b/i;
const RE_ADDRESS = /\b(địa\s*chỉ|address|số\s*nhà|phường|quận|tỉnh|thành\s*phố)\b/i;
const RE_SOCIAL = /\b(zalo|facebook|fb|messenger|instagram|ig|tiktok)\b/i;
// Ý định tra cứu người khác
const RE_PEOPLE_SEARCH_INTENT = new RegExp([
  "(tim|tra\\s*c\\u1ee9u|tra\\s*thong\\s*tin|xem)\\s+(thong\\s*tin|profile|tai\\s*khoan|dia\\s*chi|sdt|so\\s*dien\\s*thoai|facebook|zalo)",
  "(thong\\s*tin)\\s+(nguoi|khach|khach\\s*hang|ban\\s*be|ban)\\b",
  "(so\\s*dien\\s*thoai|sdt|email|cccd|cmnd)\\s+(cua)\\s+(ai|nguoi\\s*khac|ban\\s*ay|anh\\s*ay|chi\\s*ay)",
  "(ai\\s+ten|nguoi\\s+ten)\\s+[a-zA-Z\\p{L}]{2,}(\\s+[a-zA-Z\\p{L}]{2,})*"
].join("|"), "iu");
// Heuristic tên riêng
const RE_POSSIBLE_NAME = /\b([A-ZÀ-Ỵ][a-zà-ỹ]{1,})(?:\s+[A-ZÀ-Ỵ][a-zà-ỹ]{1,}){0,3}\b/u;
// Cho phép hẹp “của tôi”
const RE_SELF_CONTEXT = /\b(của\s*tôi|cua\s*toi|tôi|toi|mình|minh|tài\s*khoản\s*của\s*tôi|account\s*của\s*tôi|đơn\s*hàng\s*của\s*tôi|don\s*hang\s*cua\s*toi)\b/iu;

function isPeopleSearch(msg = "") {
    const m = msg.toLowerCase();
    if (RE_PEOPLE_SEARCH_INTENT.test(m)) return true;
    if (RE_PHONE.test(m) || RE_EMAIL.test(m) || RE_ID.test(m)) return true;
    if (RE_ADDRESS.test(m) || RE_SOCIAL.test(m)) return true;
    if (/(thong\s*tin|tra\s*cứu|tra\s*cuu|tim)\s+/i.test(m) && RE_POSSIBLE_NAME.test(msg)) return true;
    return false;
}
function isSelfScoped(msg = "") { return RE_SELF_CONTEXT.test(msg); }

/* ========== Query INTENTS (lọc cứng theo ngành hàng) ========== */
const QUERY_INTENTS = [
    {
        key: "may_giat",
        patterns: [/(\bm[áa]y?\s*gi[ạa]t\b)/i, /\bwashing\s*machine/i],
        includeCats: ["máy giặt", "máy giặt sấy", "điện lạnh", "đồ gia dụng"],
        mustAny: ["may giat", "giat say"],
        excludeCats: ["máy lạnh", "điều hòa", "làm đẹp", "máy hút bụi"],
        excludeTokens: ["may say toc", "lam sach long", "chan de", "gia do", "quat", "dieu hoa"]
    },
    {
        key: "may_say_thong_hoi",
        patterns: [/m[áa]y?\s*s[áa]y\s*th[ôo]ng\s*h[ơo]i/i, /\bvent(ed)?\s*dryer/i],
        includeCats: ["máy sấy quần áo", "điện lạnh", "đồ gia dụng"],
        mustAny: ["may say", "say quan ao", "thong hoi", "vented"],
        excludeCats: ["máy sấy tóc", "làm đẹp", "chăm sóc cá nhân"],
        excludeTokens: ["toc", "hair", "lam dep", "chan de", "gia do"]
    },
    {
        key: "may_loc_nuoc",
        patterns: [/m[áa]y?\s*l[ọo]c\s*n[ươu]ớc/i, /\bwater\s*purif(ier|y)/i, /\bro\s*(system)?\b/i],
        includeCats: ["máy lọc nước", "điện gia dụng", "đồ gia dụng"],
        mustAny: ["may loc nuoc", "loc nuoc", "ro", "nano", "uf"],
        excludeCats: ["máy lạnh", "quạt", "máy bơm", "phụ kiện điều hòa", "chăm sóc cá nhân"],
        excludeTokens: ["chan de", "gia do", "ong dan", "may lanh", "dieu hoa", "quat"]
    },
    /* NEW: Tủ lạnh */
    {
        key: "tu_lanh",
        patterns: [/t[ủu]\s*l[ạa]nh/i, /\b(refrigerator|fridge)\b/i],
        includeCats: ["tủ lạnh", "điện lạnh", "đồ gia dụng"],
        mustAny: ["tu lanh", "refrigerator", "fridge"],
        excludeCats: ["máy lạnh", "điều hòa", "làm đẹp"],
        excludeTokens: ["dieu hoa", "may lanh"]
    },
];

/** Trả về intent khớp đầu tiên theo câu hỏi */
function getQueryIntent(q = "") {
    for (const it of QUERY_INTENTS) {
        if (it.patterns.some(re => re.test(q))) return it;
    }
    return null;
}

/** Lọc danh sách product theo intent: include/must/exclude */
function filterByIntent(products = [], intent) {
    if (!intent) return products;

    const inclCats = intent.includeCats.map(norm);
    const mustAny = (intent.mustAny || []).map(norm);
    const exclCats = (intent.excludeCats || []).map(norm);
    const exclTok = (intent.excludeTokens || []).map(norm);

    const filtered = products.filter(p => {
        const n = norm(p.name);
        const c = norm(p.category);
        const hasInclCat = inclCats.length ? inclCats.some(t => c.includes(t)) : true;
        const hasMust = mustAny.length ? mustAny.some(t => n.includes(t) || c.includes(t)) : true;
        const hitExCat = exclCats.some(t => c.includes(t));
        const hitExTok = exclTok.some(t => n.includes(t) || c.includes(t));
        return hasInclCat && hasMust && !hitExCat && !hitExTok;
    });

    return filtered;
}

/* ===== Helpers: danh mục cha/con ===== */
function buildChildrenMap(categories = []) {
    const map = new Map();
    for (const c of categories) {
        const pid = c.parentId ?? null;
        if (!map.has(pid)) map.set(pid, []);
        map.get(pid).push(c);
    }
    return map;
}
function collectDescendantIds(categories, rootId) {
    const childrenMap = buildChildrenMap(categories);
    const out = new Set([rootId]);
    const stack = [rootId];
    while (stack.length) {
        const cur = stack.pop();
        const kids = childrenMap.get(cur) || [];
        for (const k of kids) {
            if (!out.has(k.id)) {
                out.add(k.id);
                stack.push(k.id);
            }
        }
    }
    return out; // Set<number>
}

/* ===== UI helper: bảng tóm tắt & khối grid ===== */
function buildSummaryTableRows(products = [], limit = 5) {
    return products.slice(0, limit).map((p) => [
        `<a href='/product/${p.slug}' class='text-blue-600 underline'>${p.name}</a>`,
        `${formatCurrencyVND(p.price)}`,
        p.soldCount > 999 ? `${Math.floor(p.soldCount / 1000)}k+` : `${p.soldCount}`,
    ]);
}
function buildGridResponse({ title, products, descriptionTop, noteAfterGrid }) {
    return {
        type: "product_grid",
        data: {
            title,
            descriptionTop: descriptionTop || undefined,
            table: { headers: ["Tên sản phẩm", "Giá (VNĐ)", "Đã bán"], rows: buildSummaryTableRows(products, 5) },
            products,
            noteAfterGrid: noteAfterGrid || undefined,
        },
        isProductDetail: false,
    };
}

/* ===== Controller ===== */
class ChatboxController {
    constructor() {
        this.allActiveFlashSaleItemsMap = new Map();
        this.allActiveCategoryDealsMap = new Map();
        this.flashSaleDataLoaded = false;
    }

    async loadFlashSaleData() {
        if (this.flashSaleDataLoaded) return;
        try {
            this.allActiveFlashSaleItemsMap.clear();
            this.allActiveCategoryDealsMap.clear();

            const now = new Date();
            const allActiveFlashSales = await FlashSale.findAll({
                where: { isActive: true, deletedAt: null, startTime: { [Op.lte]: now }, endTime: { [Op.gte]: now } },
                include: [
                    {
                        model: FlashSaleItem,
                        as: "flashSaleItems",
                        required: false,
                        attributes: [
                            "id", "flashSaleId", "skuId", "salePrice", "quantity", "maxPerUser",
                            [
                                Sequelize.literal(`(
                  SELECT COALESCE(SUM(oi.quantity),0)
                  FROM orderitems oi
                  INNER JOIN orders o ON oi.orderId=o.id
                  WHERE oi.flashSaleId=flashSaleItems.flashSaleId
                    AND oi.skuId=flashSaleItems.skuId
                    AND o.status IN ('completed','delivered')
                )`),
                                "soldQuantityForFlashSaleItem",
                            ],
                        ],
                        include: [{
                            model: Sku,
                            as: "sku",
                            attributes: ["id", "skuCode", "price", "originalPrice", "stock", "productId"],
                            include: [{ model: Product, as: "product", attributes: ["categoryId"] }],
                        }],
                    },
                    {
                        model: FlashSaleCategory,
                        as: "categories",
                        required: false,
                        include: [{ model: FlashSale, as: "flashSale", attributes: ["endTime"], required: false }],
                    },
                ],
            });

            allActiveFlashSales.forEach((saleEvent) => {
                const saleEndTime = saleEvent.endTime;
                const saleId = saleEvent.id;

                (saleEvent.flashSaleItems || []).forEach((fsi) => {
                    const sku = fsi.sku; if (!sku) return;
                    const skuId = sku.id;
                    const flashItemSalePrice = parseFloat(fsi.salePrice);
                    const soldForThisItem = parseInt(fsi.dataValues.soldQuantityForFlashSaleItem || 0, 10);
                    const flashLimit = fsi.quantity;
                    const isSoldOutForThisItem = flashLimit != null && soldForThisItem >= flashLimit;
                    if (!isSoldOutForThisItem) {
                        const exist = this.allActiveFlashSaleItemsMap.get(skuId);
                        if (!exist || flashItemSalePrice < exist.salePrice) {
                            this.allActiveFlashSaleItemsMap.set(skuId, {
                                salePrice: flashItemSalePrice,
                                quantity: flashLimit,
                                soldQuantity: soldForThisItem,
                                maxPerUser: fsi.maxPerUser,
                                flashSaleId: saleId,
                                flashSaleEndTime: saleEndTime,
                            });
                        }
                    }
                });

                (saleEvent.categories || []).forEach((fsc) => {
                    const categoryId = fsc.categoryId;
                    if (!this.allActiveCategoryDealsMap.has(categoryId)) this.allActiveCategoryDealsMap.set(categoryId, []);
                    this.allActiveCategoryDealsMap.get(categoryId).push({
                        discountType: fsc.discountType,
                        discountValue: fsc.discountValue,
                        priority: fsc.priority,
                        endTime: saleEvent.endTime,
                        flashSaleId: saleId,
                        flashSaleCategoryId: fsc.id,
                    });
                });
            });

            this.flashSaleDataLoaded = true;
        } catch (err) {
            console.error("[FlashSaleData] Load error:", err);
            this.flashSaleDataLoaded = true;
        }
    }

    async chat(req, res) {
        const { message, context = {} } = req.body || {};
        if (!message || typeof message !== "string" || !message.trim()) {
            return res.status(400).json({ message: "Câu hỏi không hợp lệ hoặc trống." });
        }

        try {
            await sleep(300);
            if (!this.flashSaleDataLoaded) await this.loadFlashSaleData();

            const { type, data, isProductDetail, replyMessage } =
                await this.processChatMessage(message.trim(), context);

            return res.status(200).json({
                message: "Thành công",
                data: { type, content: data, isProductDetail, replyMessage },
            });
        } catch (error) {
            console.error("[Lỗi Chatbot]", error);
            return res.status(500).json({ message: "Đã xảy ra lỗi khi xử lý câu hỏi." });
        }
    }

    async processChatMessage(message, context = {}) {
        const lower = message.toLowerCase();
        const msgNorm = norm(lower);
        const tokens = msgNorm.split(/[^\p{L}\p{N}]+/u).filter(t => t.length >= 2);
        const meaningfulTokens = tokens.filter(t => !STOPWORDS.has(t));

        const OFFTOPIC_MSG =
            "Xin lỗi, em chỉ hỗ trợ các câu hỏi liên quan đến sản phẩm, đơn hàng, giao hàng, bảo hành của cửa hàng ạ. Anh/chị vui lòng cho em biết nhu cầu hoặc tên sản phẩm nhé!";
        if (isOffTopicHard(message)) return { type: "text", data: OFFTOPIC_MSG, isProductDetail: false };
        if (isCodeQuestion(message)) return { type: "text", data: "Xin lỗi, em không hỗ trợ giải code hay lập trình. Em chỉ hỗ trợ sản phẩm & dịch vụ ZYBERZONE.", isProductDetail: false };

        if (isPeopleSearch(message) && !isSelfScoped(message)) {
            return {
                type: "text",
                isProductDetail: false,
                data:
                    "Xin lỗi, em không thể hỗ trợ tra cứu/thông tin cá nhân của người khác (số điện thoại, địa chỉ, mạng xã hội, giấy tờ tuỳ thân...). " +
                    "Nếu anh/chị cần hỗ trợ về tài khoản/đơn hàng của **chính mình**, vui lòng đăng nhập và cung cấp mã đơn hoặc thông tin tài khoản."
            };
        }
       
        if (RE_THIS_NOACCENT.test(msgNorm)) {
            const { productSlug, productId } = context || {};
            let targetId = null;
            if (productSlug) {
                const prod = await Product.findOne({ where: { slug: productSlug, isActive: true, deletedAt: null }, attributes: ["id"] });
                if (prod) targetId = prod.id;
            } else if (productId) {
                targetId = Number(productId) || null;
            }
            if (targetId) {
                const productDetailData = await this.fetchProductDetail(
                    targetId, this.allActiveFlashSaleItemsMap, this.allActiveCategoryDealsMap
                );
                if (productDetailData) return { type: "product_detail", data: productDetailData, isProductDetail: true };
                return { type: "text", data: "Không tìm thấy chi tiết sản phẩm này.", isProductDetail: false };
            } else {
                // Fallback khi thiếu context
                return { type: "text", data: "Anh/chị cho em xin tên hoặc mã sản phẩm để xem chi tiết ạ.", isProductDetail: false };
            }
        }

        /* 2) Lấy dữ liệu */
        const [products, categories, brands] = await Promise.all([
            this.fetchChatProducts({
                limit: 50,
                allActiveFlashSaleItemsMap: this.allActiveFlashSaleItemsMap,
                allActiveCategoryDealsMap: this.allActiveCategoryDealsMap,
            }),
            Category.findAll({ where: { isActive: true }, attributes: ["id", "name", "parentId"] }),
            Brand.findAll({ where: { isActive: true }, attributes: ["name", "description"] }),
        ]);

        /* 3) FUN sub-intent */
        const funRule = detectFunSubintent(lower);
        if (funRule) {
            const picks = pickProductsByUseCases(products, funRule.useCases, 12);
            return {
                type: "product_grid",
                replyMessage: `<p>${funRule.witty}</p>`,
                data: {
                    title: funRule.label,
                    descriptionTop: `Đề xuất dựa trên nhu cầu: ${funRule.label}`,
                    table: { headers: ["Tên sản phẩm", "Giá (VNĐ)", "Đã bán"], rows: buildSummaryTableRows(picks, 5) },
                    products: picks
                },
                isProductDetail: false
            };
        }

        /* 3.1) Intent ngành hàng cứng */
        const intent = getQueryIntent(msgNorm);
        if (intent) {
            const filtered = filterByIntent(products, intent);
            if (filtered.length) {
                const top = filtered
                    .sort((a, b) => (a.price - b.price) || ((b.soldCount || 0) - (a.soldCount || 0)))
                    .slice(0, 50);
                const intentTitle = {
                    may_giat: "Máy giặt",
                    may_say_thong_hoi: "Máy sấy thông hơi (Vented dryer)",
                    may_loc_nuoc: "Máy lọc nước",
                    tu_lanh: "Tủ lạnh",
                }[intent.key] || "Kết quả phù hợp";

                return buildGridResponse({
                    title: intentTitle,
                    products: top,
                    descriptionTop: `Dưới đây là các sản phẩm thuộc nhóm “${intentTitle}”:`,
                    noteAfterGrid: "Giá và tồn kho có thể thay đổi theo biến thể/SKU."
                });
            }
            return { type: "text", data: "Hiện chưa có sản phẩm đúng với tìm kiếm này còn hàng. Anh/chị thử từ khoá gần nghĩa hoặc quay lại sau giúp em nhé!", isProductDetail: false };
        }

        /* 4) Love/Baking mapping */
        if (isLoveQuestion(message)) {
            const picks = pickProductsByUseCases(products, ["decor", "lighting", "audio", "beauty"], 12);
            return buildGridResponse({
                title: "Quà tặng & Lãng mạn",
                products: picks,
                descriptionTop: "Quà tặng lãng mạn cho crush nè:"
            });
        }
        if (isBakingQuestion(message)) {
            const picks = pickProductsByUseCases(products, ["kitchen"], 12);
            return buildGridResponse({
                title: "Dụng cụ & Thiết bị làm bánh",
                products: picks,
                descriptionTop: "Thiết bị & dụng cụ làm bánh anh/chị có thể cần:"
            });
        }

        /* ===== Chuẩn bị regex/ý định thương mại ===== */
        const RE = {
            greet: /(?:\bchào\b|\bxin chào\b|\bhello\b|\bhi\b|tư vấn|giúp|mua gì|\bbắt đầu\b)/iu,
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
            detailWith: RE_DETAIL_WITH,
            detailNo: RE_DETAIL_NO,
            useCaseAsk: /(dung|dành cho|cho)\s+(nha bep|bep|nau an|cat toc|keo cat toc|trang tri|decor|ve sinh|lau nha|van phong|gaming|chieu sang|den|am thanh|loa|du lich|tre em|em be|lam dep|thu cung|o to|xe hoi|the thao|hoc tap)/i,
            brandIntent: /(?:thuong\s*hieu|thuong-hieu|thuonghieu|thương\s*hiệu)\s+([a-z0-9\s\-]+)|(?:cua|của)\s+([a-z0-9\s\-]{2,30})/i,
        };

        const RE_COMMERCE_INTENTS = [
            /mua/i, /giá/i, /bao nhiêu/i, /ở đâu/i,
            RE.greet, RE.discount, RE.shipping, RE.warranty, RE.returnRefund, RE.contact,
            RE.worktime, RE.payment, RE.trust, RE.compare, RE.stock, RE.install, RE.family,
            RE.orderHistory, RE.energy, RE.invoice, RE.app, RE.social, RE.smallRoom,
            RE.cancelOrChange, RE.allProducts, RE.newArrivals, RE.loyal, RE.deliveryTime,
            RE.categoriesAsk, RE.detailWith, RE.detailNo, RE.useCaseAsk, RE.brandIntent
        ];

        /* 5) Off-topic mềm */
        let hitsFromData = 0;
        const brandSet = new Set(brands.map(b => norm(b.name)));
        const catSet = new Set(categories.map(c => norm(c.name)));

        for (const t of meaningfulTokens) { if (brandSet.has(t)) { hitsFromData = 1; break; } }
        if (!hitsFromData) for (const t of meaningfulTokens) { if (catSet.has(t)) { hitsFromData = 1; break; } }
        if (!hitsFromData) {
            for (const p of products) {
                const nm = norm(p.name || "");
                if (meaningfulTokens.some(t => nm.includes(t))) { hitsFromData = 1; break; }
            }
        }

        const hasCommerceIntent =
            RE_COMMERCE_INTENTS.some(re => re.test(lower)) || RE_CATEGORIES_UD.test(msgNorm);

        if (!hasCommerceIntent && !hitsFromData) {
            return { type: "text", data: OFFTOPIC_MSG, isProductDetail: false };
        }

        /* 6) Intent phổ biến (trả lời nhanh) */
        if (RE.greet.test(lower)) {
            return {
                type: "product_grid",
                replyMessage: `<p>Xin chào! Em là trợ lý ảo của <b>${STORE_NAME}</b>. Anh/chị cần tư vấn sản phẩm nào ạ?</p>`,
                data: {
                    title: "Một số sản phẩm nổi bật",
                    table: { headers: ["Tên sản phẩm", "Giá (VNĐ)", "Đã bán"], rows: buildSummaryTableRows(products.slice(0, 6), 5) },
                    products: products.slice(0, 6)
                },
                isProductDetail: false,
            };
        }
        if (RE.discount.test(lower)) {
            const saleItems = products.filter((p) => p.discount && p.discount >= 1);
            const tableRows = buildSummaryTableRows(saleItems, 5);
            return {
                type: "product_grid",
                data: {
                    title: "Sản phẩm đang giảm giá",
                    descriptionTop: "Dưới đây là các sản phẩm đang khuyến mãi nổi bật:",
                    table: { headers: ["Tên sản phẩm", "Giá (VNĐ)", "Đã bán"], rows: tableRows },
                    products: saleItems,
                    noteAfterGrid: "💡 Giá khuyến mãi chỉ áp dụng trong thời gian có hạn – nhanh tay kẻo lỡ!",
                },
                isProductDetail: false,
            };
        }
        if (RE.shipping.test(lower)) return { type: "text", data: "Bên em giao hàng toàn quốc, nhanh chóng và an toàn. Anh/chị đặt trực tiếp trên website hoặc nhắn với em nhé!", isProductDetail: false };
        if (RE.payment.test(lower)) return { type: "text", data: "Hỗ trợ COD, chuyển khoản ngân hàng, và quẹt thẻ tại cửa hàng. Anh/chị chọn phương thức tiện nhất nhé!", isProductDetail: false };
        if (RE.warranty.test(lower)) return { type: "text", data: `Tất cả sản phẩm bảo hành chính hãng 6–24 tháng (tuỳ loại). Anh/chị yên tâm mua sắm tại <b>${STORE_NAME}</b> ạ!`, isProductDetail: false };
        if (RE.returnRefund.test(lower)) return { type: "text", data: "Đổi trả trong 7 ngày nếu sản phẩm lỗi do NSX. Nhớ giữ hoá đơn/bao bì đầy đủ giúp em nha!", isProductDetail: false };
        if (RE.contact.test(lower)) return { type: "text", data: "Mình đang bán online toàn quốc. Cần hỗ trợ trực tiếp, gọi hotline <b>1900 8922</b> hoặc nhắn fanpage nhé!", isProductDetail: false };
        if (RE.worktime.test(lower)) return { type: "text", data: "Hỗ trợ 8:00–21:00 mỗi ngày, kể cả cuối tuần & ngày lễ.", isProductDetail: false };
        if (RE.trust.test(lower) && !RE.discount.test(lower)) return { type: "text", data: `<b>${STORE_NAME}</b> cam kết 100% chính hãng, nguồn gốc rõ ràng, bảo hành đầy đủ. Mua là yên tâm!`, isProductDetail: false };
        if (RE.compare.test(lower)) return { type: "text", data: "Anh/chị cho em biết đang phân vân giữa những sản phẩm nào nhé, em so sánh chi tiết ngay!", isProductDetail: false };
        if (RE.stock.test(lower)) return { type: "text", data: "Anh/chị cho em xin tên sản phẩm cụ thể, em kiểm tra tồn kho giúp liền ạ!", isProductDetail: false };
        if (RE.install.test(lower)) return { type: "text", data: "Bên em hỗ trợ hướng dẫn sử dụng và lắp đặt (tuỳ sản phẩm). Anh/chị cần dòng nào em gửi hướng dẫn ngay!", isProductDetail: false };
        if (RE.family.test(lower)) return { type: "text", data: "Nếu anh/chị mô tả cụ thể người dùng/mục đích, em sẽ gợi ý đúng nhu cầu hơn ạ!", isProductDetail: false };
        if (RE.orderHistory.test(lower)) return { type: "text", data: "Anh/chị để lại số điện thoại đặt hàng, em kiểm tra lịch sử đơn ngay nhé!", isProductDetail: false };
        if (RE.angry.test(lower)) return { type: "text", data: "Em xin lỗi nếu trải nghiệm chưa tốt. Anh/chị để lại số ĐT hoặc chi tiết, bên em sẽ gọi hỗ trợ ngay ạ!", isProductDetail: false };
        if (RE.energy.test(lower)) return { type: "text", data: "Nhiều sản phẩm có Inverter/ECO tiết kiệm điện. Anh/chị cần dòng nào em kiểm tra cụ thể nhé!", isProductDetail: false };
        if (RE.invoice.test(lower)) return { type: "text", data: "Bên em xuất hoá đơn VAT đầy đủ khi anh/chị yêu cầu. Cho em xin thông tin DN nếu cần nhé!", isProductDetail: false };
        if (RE.app.test(lower)) return { type: "text", data: "Theo dõi đơn bằng cách đăng nhập website, hoặc kiểm tra email/SMS. Cần mã đơn? Em tra ngay!", isProductDetail: false };
        if (RE.social.test(lower)) return { type: "text", data: `Hiện <b>${STORE_NAME}</b> chỉ bán chính thức trên website để đảm bảo dịch vụ & bảo hành tốt nhất ạ!`, isProductDetail: false };
        if (RE.smallRoom.test(lower)) return { type: "text", data: "Không gian nhỏ nên chọn sản phẩm gọn, tiết kiệm diện tích. Anh/chị mô tả diện tích/phòng để em tư vấn ạ!", isProductDetail: false };
        if (RE.cancelOrChange.test(lower)) return { type: "text", data: "Anh/chị gửi mã đơn hoặc số ĐT đặt hàng, em hỗ trợ hủy/chỉnh sửa ngay nhé!", isProductDetail: false };
        if (RE.allProducts.test(lower)) return buildGridResponse({ title: "Tất cả sản phẩm hiện có", products, descriptionTop: "Danh sách tổng hợp:" });
        if (RE.newArrivals.test(lower)) {
            const newest = products.slice(0, 4);
            return buildGridResponse({ title: "Sản phẩm mới về", products: newest, descriptionTop: "Các sản phẩm vừa cập nhật:" });
        }
        if (RE.loyal.test(lower)) return { type: "text", data: "Đăng ký tài khoản để tích điểm, nhận ưu đãi sinh nhật và khuyến mãi riêng cho thành viên nhé!", isProductDetail: false };
        if (RE.deliveryTime.test(lower)) return { type: "text", data: "Giao hàng trung bình 1–3 ngày (tuỳ khu vực). Sau khi đặt, bên em sẽ gọi xác nhận & báo thời gian cụ thể.", isProductDetail: false };

        /* Danh mục: trả dạng grid + bảng */
        if (RE.categoriesAsk.test(lower) || RE_CATEGORIES_UD.test(msgNorm)) {
            return {
                type: "category_list",
                data: {
                    title: "Danh mục sản phẩm hiện có:",
                    items: categories.map((c) => ({ id: c.id, name: c.name, triggerMessage: c.name })),
                },
                isProductDetail: false,
            };
        }

        /* 7) Hỏi theo mục đích sử dụng */
        if (RE.useCaseAsk.test(msgNorm)) {
            const m = msgNorm.match(RE.useCaseAsk); const phrase = (m?.[2] || "").trim();
            const USECASE_ALIAS = new Map([
                ["nha bep", "kitchen"], ["bep", "kitchen"], ["nau an", "kitchen"],
                ["cat toc", "haircut"], ["keo cat toc", "haircut"],
                ["trang tri", "decor"], ["decor", "decor"],
                ["ve sinh", "cleaning"], ["lau nha", "cleaning"],
                ["van phong", "office"], ["gaming", "gaming"],
                ["chieu sang", "lighting"], ["den", "lighting"],
                ["am thanh", "audio"], ["loa", "audio"],
                ["du lich", "travel"],
                ["tre em", "baby"], ["em be", "baby"],
                ["lam dep", "beauty"],
                ["thu cung", "pet"],
                ["o to", "car"], ["xe hoi", "car"],
                ["the thao", "sport"],
                ["hoc tap", "study"],
            ]);
            const key = USECASE_ALIAS.get(phrase);
            if (key) {
                const byUseCase = products.filter(p => (p.useCases || []).includes(key));
                if (byUseCase.length) {
                    return buildGridResponse({
                        title: `Sản phẩm dành cho ${m[2]}`,
                        products: byUseCase.slice(0, 50),
                        descriptionTop: `Gợi ý cho nhu cầu “${m[2]}”:`
                    });
                }
                return { type: "text", data: `Chưa tìm thấy sản phẩm dành cho “${m[2]}”.`, isProductDetail: false };
            }
        }

        /* 8) Hỏi theo thương hiệu */
        const brandIntent = msgNorm.match(RE.brandIntent);
        if (brandIntent) {
            const kw = norm((brandIntent[1] || brandIntent[2] || "").replace(/[?.!,;:]+$/, "").trim());
            const blacklist = new Set(["shop", "cua hang", "ben ban", "bennay", "ben nay"]);
            if (kw && !blacklist.has(kw)) {
                const kwTokens = kw.split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 2);
                if (kwTokens.length === 0) {
                    return { type: "text", data: "Anh/chị cho em tên thương hiệu cụ thể để lọc giúp ạ.", isProductDetail: false };
                }
                const relevanceScore = (p) => {
                    const nameNorm = norm(p.name), brandNorm = norm(p.brand), catNorm = norm(p.category);
                    let score = 0;
                    for (const t of kwTokens) {
                        const inBrand = brandNorm.includes(t), inName = nameNorm.includes(t), inCat = catNorm.includes(t);
                        if (inBrand) score += 10;
                        if (inName) score += 6;
                        if (inCat) score += 3;
                        if (brandNorm.startsWith(t)) score += 3;
                        if (nameNorm.startsWith(t)) score += 2;
                    }
                    const phrase = kwTokens.join(" ");
                    if (phrase.length >= 2) { if (brandNorm.includes(phrase)) score += 4; if (nameNorm.includes(phrase)) score += 2; }
                    return score;
                };
                const matchedBrand = products
                    .map((p) => ({ p, s: relevanceScore(p) }))
                    .filter(x => x.s > 0)
                    .sort((a, b) => b.s - a.s || ((b.p.soldCount || 0) - (a.p.soldCount || 0)))
                    .map(x => x.p);
                if (matchedBrand.length) {
                    return buildGridResponse({
                        title: `Sản phẩm của thương hiệu ${kw}`,
                        products: matchedBrand.slice(0, 50),
                        descriptionTop: `Các sản phẩm nổi bật của thương hiệu “${kw}”:`
                    });
                }
                return { type: "text", data: `Xin lỗi, hiện chưa có sản phẩm nào thuộc thương hiệu "${kw}".`, isProductDetail: false };
            } else {
                return { type: "text", data: "Anh/chị cho em tên thương hiệu cụ thể để lọc giúp ạ.", isProductDetail: false };
            }
        }

        // Hỗ trợ "xem chi tiết sản phẩm ..." cả có dấu & không dấu
        const mDetailWith = msgNorm.match(RE_DETAIL_NO) || lower.match(RE_DETAIL_WITH);
        if (mDetailWith) {
            const keyword = (mDetailWith[3] || mDetailWith[2] || "").trim();
            if (keyword.length >= 2) {
                const found = products.find(p => norm(p.name).includes(norm(keyword)));
                if (found) {
                    const productDetailData = await this.fetchProductDetail(found.id, this.allActiveFlashSaleItemsMap, this.allActiveCategoryDealsMap);
                    return productDetailData
                        ? { type: "product_detail", data: productDetailData, isProductDetail: true }
                        : { type: "text", data: "Không tìm thấy chi tiết sản phẩm này.", isProductDetail: false };
                }
                return { type: "text", data: `Không tìm thấy sản phẩm "${keyword}".`, isProductDetail: false };
            }
        }

        /* 8.1) Danh mục được nhắc tới trong câu hỏi — gom cả danh mục con */
        for (const cat of categories) {
            const catNorm = norm(cat.name || "");
            if (catNorm && msgNorm.includes(catNorm)) {
                const idSet = collectDescendantIds(categories, cat.id);
                const allInTree = products.filter(p => p.categoryId && idSet.has(p.categoryId));
                const available = allInTree.filter(p => p.inStock);

                if (allInTree.length === 0) {
                    return { type: "text", data: `Danh mục "${cat.name}" hiện chưa có sản phẩm. Bên em đang chờ sản phẩm mới về ạ!`, isProductDetail: false };
                }
                if (available.length === 0) {
                    return { type: "text", data: `Danh mục "${cat.name}" hiện tạm hết hàng. Anh/chị quay lại sau giúp em — sản phẩm mới sẽ sớm cập nhật!`, isProductDetail: false };
                }

                const result = [...available, ...allInTree.filter(p => !p.inStock)].slice(0, 50);
                return buildGridResponse({
                    title: `Sản phẩm thuộc "${cat.name}"`,
                    products: result,
                    descriptionTop: `Danh sách sản phẩm trong danh mục “${cat.name}”:`,
                    noteAfterGrid: "Một số sản phẩm có nhiều biến thể giá."
                });
            }
        }

        /* ===== Helper tính điểm liên quan (duy nhất) ===== */
        const relevanceScore = (p) => {
            const nameNorm = norm(p.name), brandNorm = norm(p.brand), catNorm = norm(p.category);
            let score = 0;
            for (const t of meaningfulTokens) {
                const inBrand = brandNorm.includes(t), inName = nameNorm.includes(t), inCat = catNorm.includes(t);
                if (inBrand) score += 10;
                if (inName) score += 6;
                if (inCat) score += 3;
                if (brandNorm.startsWith(t)) score += 3;
                if (nameNorm.startsWith(t)) score += 2;
            }
            const phrase = meaningfulTokens.join(" ");
            if (phrase.length >= 2) { if (brandNorm.includes(phrase)) score += 4; if (nameNorm.includes(phrase)) score += 2; }
            return score;
        };

        // 10) Tìm theo độ liên quan (duy nhất)
        const matched = products
            .map(p => ({ p, s: relevanceScore(p) }))
            .filter(x => x.s > 0)
            .sort((a, b) => b.s - a.s || ((b.p.soldCount || 0) - (a.p.soldCount || 0)));

        const MIN_SCORE = 12;
        if (matched.length && matched[0].s >= MIN_SCORE) {
            const list = matched.slice(0, 50).map(x => x.p);
            return buildGridResponse({
                title: ` ${message}`,
                products: list,
                descriptionTop: "Các kết quả phù hợp nhất:"
            });
        }

        // Không đủ điểm liên quan + không rơi vào intent cụ thể
        const hasCommerceIntentLocal =
            RE_COMMERCE_INTENTS.some(re => re.test(lower)) || RE_CATEGORIES_UD.test(msgNorm);
        if (!hasCommerceIntentLocal) {
            return { type: "text", data: OFFTOPIC_MSG, isProductDetail: false };
        }

        /* 11) Fallback LLM structured (đặt trước return cuối) */
        if (genAI && process.env.GEMINI_API_KEY) {
            try {
                const structured = await askLLMStructured(message);
                if (structured.type === "product_detail") {
                    const candId = structured?.content?.productId;
                    if (candId) {
                        const detail = await this.fetchProductDetail(candId, this.allActiveFlashSaleItemsMap, this.allActiveCategoryDealsMap);
                        if (detail) return { type: "product_detail", data: detail, isProductDetail: true };
                    }
                    return buildGridResponse({
                        title: "Gợi ý liên quan",
                        products: products.slice(0, 8)
                    });
                }
                return { type: structured.type, data: structured.content, isProductDetail: structured.isProductDetail, replyMessage: structured.replyMessage || undefined };
            } catch (e) {
                console.error("Gemini structured error:", e);
                // Rơi xuống fallback cuối
            }
        }

        /* 12) Fallback cuối cùng */
        return { type: "text", data: "Xin lỗi, hiện tại em chưa hiểu rõ câu hỏi. Anh/Chị vui lòng thử lại.", isProductDetail: false };
    }

    /* ========== Data fetchers ========== */
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
                        { model: SkuVariantValue, as: "variantValues", include: [{ model: VariantValue, as: "variantValue", include: [{ model: Variant, as: "variant" }] }] },
                        { model: ProductMedia, as: "ProductMedia", attributes: ["mediaUrl"] },
                        {
                            model: OrderItem,
                            as: "OrderItems",
                            attributes: ["quantity"],
                            required: false,
                            include: [{ model: Order, as: "order", attributes: [], where: { status: { [Op.in]: ["delivered", "completed"] } }, required: true }],
                        },
                        { model: Review, as: "reviews", attributes: ["rating"], required: false },
                    ],
                },
                { model: Category, as: "category", attributes: ["id", "name"] },
                { model: Brand, as: "brand", attributes: ["name"] },
            ],
            limit,
            order: [["createdAt", "DESC"]],
        });

        const result = products.map((p) => {
            let bestSku = null, minPrice = Infinity;
            let totalSold = 0, totalRating = 0, reviewCount = 0;

            p.skus.forEach((sku) => {
                const skuData = sku.toJSON();
                skuData.Product = { category: { id: p.category?.id } };

                const { price: finalPrice, originalPrice, discount, hasDeal, flashSaleInfo } =
                    processSkuPrices(skuData, allActiveFlashSaleItemsMap, allActiveCategoryDealsMap);

                const optionNames = skuData.variantValues?.map((vv) => vv.variantValue?.value).join(", ") || "";
                const optionValuesData = skuData.variantValues?.map((vv) => ({
                    type: vv.variantValue?.variant?.type,
                    value: vv.variantValue?.value,
                    colorCode: vv.variantValue?.colorCode,
                })) || [];

                totalSold += skuData.OrderItems?.reduce((s, oi) => s + (oi.quantity || 0), 0) || 0;

                skuData.reviews?.forEach((r) => { const v = Number(r.rating); if (v > 0) { totalRating += v; reviewCount += 1; } });

                if (finalPrice > 0 && finalPrice < minPrice) {
                    bestSku = {
                        skuId: skuData.id,
                        optionNames,
                        optionValues: optionValuesData,
                        price: finalPrice,
                        originalPrice,
                        discount,
                        stock: skuData.stock,
                        ProductMedia: skuData.ProductMedia,
                        flashSaleInfo,
                        hasDeal,
                    };
                    minPrice = finalPrice;
                }
            });

            const primary = bestSku || { price: 0, originalPrice: null, discount: null, stock: 0, ProductMedia: [], optionNames: "", optionValues: [] };
            const imageUrl = p.thumbnail || primary.ProductMedia?.[0]?.mediaUrl;
            const averageRating = reviewCount > 0 ? parseFloat((totalRating / reviewCount).toFixed(1)) : 0;
            const useCases = classifyUseCasesByText(p.name, p.category?.name);

            return {
                id: p.id,
                name: primary.optionNames ? `${p.name} (${primary.optionNames})` : p.name,
                slug: p.slug,
                image: imageUrl,
                price: primary.price,
                oldPrice: primary.originalPrice,
                discount: primary.discount,
                inStock: primary.stock > 0,
                status: primary.stock > 0 ? "Còn hàng" : "Hết hàng",
                category: p.category?.name || "Khác",
                categoryId: p.category?.id || null,
                brand: p.brand?.name || null,
                optionValues: primary.optionValues,
                rating: averageRating,
                soldCount: totalSold,
                quantity: primary.stock,
                badge: p.badge || null,
                badgeImage: p.badgeImage || null,
                flashSaleInfo: primary.flashSaleInfo,
                useCases,
            };
        });

        return result;
    }

    async fetchProductDetail(productId, allActiveFlashSaleItemsMap, allActiveCategoryDealsMap) {
        const product = await Product.findByPk(productId, {
            include: [
                {
                    model: Sku, as: "skus", required: true,
                    attributes: ["id", "skuCode", "price", "originalPrice", "stock"],
                    include: [
                        { model: SkuVariantValue, as: "variantValues", include: [{ model: VariantValue, as: "variantValue", include: [{ model: Variant, as: "variant" }] }] },
                        { model: ProductMedia, as: "ProductMedia", attributes: ["mediaUrl", "type", "sortOrder"] },
                        {
                            model: OrderItem, as: "OrderItems", attributes: ["quantity"], required: false,
                            include: [{ model: Order, as: "order", attributes: [], where: { status: { [Op.in]: ["delivered", "completed"] } }, required: true }],
                        },
                        { model: Review, as: "reviews", attributes: ["rating"], required: false },
                    ],
                },
                { model: Category, as: "category", attributes: ["id", "name", "slug"] },
                { model: Brand, as: "brand", attributes: ["name", "description"] },
            ],
        });
        if (!product) return null;

        const p = product.toJSON();
        let totalRating = 0, reviewCount = 0, totalSold = 0;

        p.skus = (p.skus || []).map((sku) => {
            const skuData = sku.toJSON();
            // FIX: dùng id từ include category thay vì p.categoryId (không select)
            skuData.Product = { category: { id: p.category?.id } };
            const pr = processSkuPrices(skuData, allActiveFlashSaleItemsMap, allActiveCategoryDealsMap);
            totalSold += skuData.OrderItems?.reduce((s, oi) => s + (oi.quantity || 0), 0) || 0;
            skuData.reviews?.forEach((r) => { const v = Number(r.rating); if (v > 0) { totalRating += v; reviewCount += 1; } });
            return {
                ...skuData,
                price: pr.price,
                originalPrice: pr.originalPrice,
                flashSaleInfo: pr.flashSaleInfo,
                discount: pr.discount,
                hasDeal: pr.hasDeal
            };
        });
        p.skus.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
        p.defaultSku = p.skus.length > 0 ? p.skus[0] : null;

        const avg = reviewCount > 0 ? parseFloat((totalRating / reviewCount).toFixed(1)) : 0;
        return { id: p.id, name: p.name, slug: p.slug, thumbnail: p.thumbnail, brand: p.brand?.name, category: p.category?.name, skus: p.skus, defaultSku: p.defaultSku, rating: avg, soldCount: totalSold };
    }
}

module.exports = new ChatboxController();
