const axios = require('axios');
const NodeCache = require('node-cache');
const fuzzysort = require('fuzzysort'); // Đảm bảo đã cài đặt: npm install fuzzysort

const cache = new NodeCache({ stdTTL: 86_400 }); // Cache time-to-live: 24 hours (in seconds)

/* ─────── ENVIRONMENT VARIABLES ─────── */
// Đặt tên rõ ràng cho biến môi trường Viettel Post
const {
  VTP_API_TOKEN,
  VTP_SHOP_PROVINCE_ID,
  VTP_SHOP_DISTRICT_ID,
  VTP_SHOP_WARD_ID, // Có thể không bắt buộc, sử dụng nếu có
} = process.env;

// Kiểm tra các biến môi trường quan trọng khi khởi tạo module
if (!VTP_API_TOKEN) {
  console.error('ERROR: VTP_API_TOKEN is not defined in .env. ViettelPost service will not function.');
  // Trong ứng dụng thực tế, bạn có thể muốn thoát hoặc tắt dịch vụ VTP.
}
if (!VTP_SHOP_PROVINCE_ID || !VTP_SHOP_DISTRICT_ID) {
  console.warn('WARNING: VTP_SHOP_PROVINCE_ID or VTP_SHOP_DISTRICT_ID is missing in .env. Shop origin details for ViettelPost might be incomplete or incorrect, affecting fee calculations.');
}

// Common headers for Axios requests to ViettelPost API
const HEADERS = {
  'Content-Type': 'application/json',
  // ViettelPost thường sử dụng Authorization: Bearer {TOKEN} cho các API mới hơn
  'Authorization': `Bearer ${VTP_API_TOKEN}`,
  // Nếu API VTP của bạn dùng header khác, ví dụ 'token': VTP_API_TOKEN, bạn cần điều chỉnh ở đây
};

/* ─────── HELPER FUNCTIONS ─────── */

/**
 * Xây dựng một key cache duy nhất cho một tập hợp các tham số vận chuyển.
 * @param {number} p - ID Tỉnh người nhận (mã VTP)
 * @param {number} d - ID Huyện người nhận (mã VTP)
 * @param {number|null} wd - ID Xã người nhận (mã VTP), hoặc 0 nếu null
 * @param {number} w - Cân nặng tính bằng gram
 * @param {number} l - Chiều dài tính bằng cm
 * @param {number} wid - Chiều rộng tính bằng cm
 * @param {number} h - Chiều cao tính bằng cm
 * @param {string} svc - Mã dịch vụ (ví dụ: 'VCN', 'VTK')
 * @returns {string} Khóa cache duy nhất
 */
function buildCacheKey(p, d, wd, w, l, wid, h, svc) {
  return `vtp:${p}|${d}|${wd || 0}|${w || 0}|${l}|${wid}|${h}|${svc}`;
}

/**
 * Tính toán thời gian giao hàng dự kiến bằng ngày từ KPI_HT (số giờ) hoặc một timestamp Unix (milliseconds).
 * @param {number|string} kpiHtValue - Giá trị KPI_HT từ API (thường là số giờ).
 * @returns {number|null} Thời gian giao hàng bằng ngày, làm tròn lên, hoặc null nếu đầu vào không hợp lệ.
 */
function calcLeadTime(kpiHtValue) {
  const hours = Number(kpiHtValue);
  if (isNaN(hours) || hours <= 0) {
    return null; // Trả về null nếu giá trị không hợp lệ
  }

  // Chuyển đổi giờ thành ngày, làm tròn lên
  // Math.max(1, ...) đảm bảo tối thiểu 1 ngày cho bất kỳ giá trị dương nào,
  // vì thường không có giao hàng trong 0 ngày.
  return Math.max(1, Math.ceil(hours / 24));
}


/* ─────── TẢI & CACHE DANH SÁCH DỊCH VỤ VIETTELPOST KHẢ DỤNG ─────── */

let _availableServiceList = null; // Biến riêng tư để lưu trữ danh sách dịch vụ của tài khoản

/**
 * Lấy và cache danh sách các dịch vụ khả dụng cho tài khoản ViettelPost đã cấu hình.
 * @returns {Promise<string[]>} Một mảng các mã dịch vụ (ví dụ: ['VCN', 'VTK', 'VHT']).
 */
async function loadServiceList() {
  if (_availableServiceList) return _availableServiceList; // Trả về danh sách đã cache nếu đã tải

  const cacheKey = 'vtp:serviceList';
  const cached = cache.get(cacheKey);
  if (cached) {
    _availableServiceList = cached;
    console.log('[VTP] Danh sách dịch vụ được tải từ cache.');
    return cached;
  }

  try {
    const { data } = await axios.post(
      'https://partner.viettelpost.vn/v2/categories/listService', // Endpoint để lấy các dịch vụ khả dụng
      { "TYPE": 2 }, // Body chính xác theo tài liệu VTP
      { headers: HEADERS }, // Sử dụng các header chung cho xác thực
    );

    // Giả định cấu trúc phản hồi API là { "status": ..., "data": [{ "SERVICE_CODE": "...", ... }] }
    const services = (data?.data || []).map(s => s.SERVICE_CODE);
    _availableServiceList = services;
    cache.set(cacheKey, _availableServiceList, 86_400); // Cache trong 24 giờ
    console.log(`[VTP] Đã tải thành công ${services.length} dịch vụ từ API.`);
    return _availableServiceList;
  } catch (err) {
    console.error(`[VTP ERROR] Lỗi khi lấy danh sách dịch vụ từ ViettelPost API. Sẽ sử dụng dịch vụ dự phòng.`);
    if (err.response) {
      console.error(`   HTTP Status: ${err.response.status}`);
      console.error(`   Dữ liệu phản hồi: ${JSON.stringify(err.response.data)}`);
    } else if (err.request) {
      console.error(`   Không nhận được phản hồi: ${err.message}`);
    } else {
      console.error(`   Lỗi thiết lập yêu cầu: ${err.message}`);
    }
    // Dự phòng các mã dịch vụ phổ biến nếu cuộc gọi API thất bại
    _availableServiceList = ['VCN', 'VHT', 'VTK', 'SCOD', 'V60'];
    console.warn(`[VTP CẢNH BÁO] Sử dụng danh sách dịch vụ dự phòng: ${_availableServiceList.join(', ')}`);
    return _availableServiceList;
  }
}

/**
 * Xác định dịch vụ vận chuyển mặc định (ưu tiên) từ danh sách khả dụng.
 * Hàm này được gọi bởi ShippingService.calcFee nếu không có serviceCode cụ thể nào được cung cấp bởi client.
 * @returns {Promise<string|null>} Mã dịch vụ ưu tiên hoặc null nếu không có dịch vụ nào khả dụng.
 */
async function getDefaultService() {
  const services = await loadServiceList();
  if (services && services.length > 0) {
    // Ưu tiên các dịch vụ phổ biến nhất
    if (services.includes('VCN')) return 'VCN'; // Tiêu chuẩn/Nhanh
    if (services.includes('VTK')) return 'VTK'; // Tiết kiệm
    if (services.includes('VHT')) return 'VHT'; // Hỏa tốc
    // Nếu không có, trả về dịch vụ đầu tiên có trong danh sách
    return services[0];
  }
  return null; // Không có dịch vụ nào khả dụng cho tài khoản
}


/* ─────── HÀM CHÍNH: TÍNH TOÁN PHÍ VẬN CHUYỂN VÀ THỜI GIAN DỰ KIẾN ─────── */

/**
 * Tính toán phí vận chuyển và thời gian giao hàng dự kiến cho một lô hàng.
 * @param {object} params - Các tham số vận chuyển.
 * @param {number|string} params.toProvince - ID Tỉnh người nhận (mã ViettelPost).
 * @param {number|string} params.toDistrict - ID Huyện người nhận (mã ViettelPost).
 * @param {number|string|null} [params.toWard=null] - ID Xã người nhận (mã ViettelPost), có thể là null.
 * @param {number} params.weight - Cân nặng gói hàng tính bằng gram.
 * @param {number} params.length - Chiều dài gói hàng tính bằng centimet.
 * @param {number} params.width - Chiều rộng gói hàng tính bằng centimet.
 * @param {number} params.height - Chiều cao tính bằng centimet.
 * @param {string|null} [params.serviceCode=null] - Mã dịch vụ ViettelPost cụ thể để sử dụng.
 * @param {number} [params.orderValue=0] - Giá trị khai báo của đơn hàng bằng VND (dùng cho bảo hiểm/giá trị COD).
 * @returns {Promise<{ fee: number, leadTime: number|null }>} Phí vận chuyển và thời gian giao hàng dự kiến.
 * @throws {Error} Nếu không tìm thấy dịch vụ hoặc xảy ra lỗi API không thể phục hồi.
 */
async function getFee({
  toProvince,
  toDistrict,
  toWard = null,
  weight, length, width, height,
  serviceCode = null, // Dịch vụ cụ thể được yêu cầu bởi client
  orderValue = 0,     // Giá trị của đơn hàng
}) {
  // 0️⃣ Lấy danh sách các dịch vụ khả dụng cho tài khoản
  const availableServices = await loadServiceList();

  // 1️⃣ Xác định thứ tự các dịch vụ sẽ thử
  const servicesToTry = serviceCode
    ? [serviceCode].filter(s => availableServices.includes(s)) // Sử dụng dịch vụ do client chỉ định nếu khả dụng
    : [
        'VCN',                 // Tiêu chuẩn/Nhanh (mặc định phổ biến)
        'VHT',                 // Hỏa tốc
        'VTK',                 // Tiết kiệm
        ...availableServices.filter(s => !['VCN','VHT','VTK'].includes(s)), // Thêm các dịch vụ khác
      ].filter(s => availableServices.includes(s)); // Đảm bảo chỉ xem xét các dịch vụ thực sự khả dụng

  if (servicesToTry.length === 0) {
      console.warn('[VTP] Không tìm thấy dịch vụ phù hợp sau khi lọc. Điều này có thể chỉ ra mã dịch vụ không chính xác hoặc không có dịch vụ hoạt động nào cho tài khoản.');
      throw new Error('VTP: Không có dịch vụ vận chuyển phù hợp nào khả dụng cho tài khoản này.');
  }

  // Đảm bảo thông tin gốc của cửa hàng là các số
  const senderProvince = Number(VTP_SHOP_PROVINCE_ID);
  const senderDistrict = Number(VTP_SHOP_DISTRICT_ID);
  const senderWard     = VTP_SHOP_WARD_ID ? Number(VTP_SHOP_WARD_ID) : undefined; // Có thể là undefined nếu không được cung cấp

  // Đảm bảo thông tin người nhận là các số
  const receiverProvince = Number(toProvince); // Đây sẽ là mã VTP ĐÃ ĐƯỢC MAPPING
  const receiverDistrict = Number(toDistrict); // Đây sẽ là mã VTP ĐÃ ĐƯỢC MAPPING
  const receiverWard     = toWard ? Number(toWard) : undefined; // Đây sẽ là mã VTP ĐÃ ĐƯỢC MAPPING

  // 2️⃣ Thử từng dịch vụ theo trình tự
  for (const svc of servicesToTry) {
    const cacheKey = buildCacheKey(
      receiverProvince, receiverDistrict, receiverWard,
      weight, length, width, height, svc,
    );

    /* ---- Cache hit? ---- */
    const cached = cache.get(cacheKey);
    if (cached) {
      if (cached.fee > 0) {
        console.log(`[VTP CACHE HIT] ${svc} - Phí: ${cached.fee}, Thời gian dự kiến: ${cached.leadTime} ngày (từ cache)`);
        return cached;
      }
      // Nếu phí được cache là 0, điều đó có nghĩa là dịch vụ/tuyến đường này trước đây không có phí hoặc có vấn đề.
      // Ghi lại cảnh báo và thử dịch vụ tiếp theo.
      console.warn(`[VTP CACHE CẢNH BÁO] ${svc} - Kết quả cache cho thấy phí bằng 0 hoặc không phù hợp. Đang thử dịch vụ tiếp theo.`);
      continue;
    }

    /* ---- Request body cho API getPrice của ViettelPost ---- */
    const requestBody = {
      PRODUCT_TYPE      : 'HH', // 'HH' cho Hàng hóa, 'TL' cho Tài liệu. Điều chỉnh nếu loại sản phẩm quan trọng.
      SENDER_PROVINCE   : senderProvince,
      SENDER_DISTRICT   : senderDistrict,
      SENDER_WARD       : senderWard, // Tùy chọn, có thể là undefined

      RECEIVER_PROVINCE : receiverProvince, // Sử dụng mã VTP ĐÃ ĐƯỢC MAPPING
      RECEIVER_DISTRICT : receiverDistrict, // Sử dụng mã VTP ĐÃ ĐƯỢC MAPPING
      RECEIVER_WARD     : receiverWard, // Sử dụng mã VTP ĐÃ ĐƯỢC MAPPING

      PRODUCT_WEIGHT    : Math.max(Number(weight) || 0, 100), // Cân nặng tối thiểu cho VTP thường là 100g.
      PRODUCT_DIMENSION : `${Math.max(length || 0, 1)}x${Math.max(width || 0, 1)}x${Math.max(height || 0, 1)}`, // Tối thiểu 1cm, tránh kích thước 0.

      ORDER_SERVICE     : svc,
      ORDER_SERVICE_ADD : '', // Các dịch vụ bổ sung (ví dụ: COD). Để trống nếu không sử dụng.
      NATIONAL_TYPE     : 1,  // 1: Trong nước, 2: Quốc tế

      ORDER_VALUE       : Math.max(Number(orderValue) || 0, 100_000), // Giá trị đơn hàng khai báo. VTP có thể yêu cầu tối thiểu 100.000 VNĐ cho bảo hiểm/giá trị khai báo.
    };

    /* ---- Gọi API ViettelPost ---- */
    try {
      console.log('\n[VTP] Đang gửi request body đến API getPrice →', JSON.stringify(requestBody, null, 2));
      const response = await axios.post(
        'https://partner.viettelpost.vn/v2/order/getPrice', // Endpoint API getPrice của VTP
        requestBody,
        {
          headers : HEADERS, // Sử dụng các header chung cho xác thực
          timeout : 10_000, // Thời gian chờ 10 giây
        },
      );

      // In toàn bộ dữ liệu phản hồi API để kiểm tra
      console.log(`[VTP] Phản hồi API VTP (full data): ${JSON.stringify(response.data, null, 2)}`);

      // Giả định cấu trúc phản hồi thành công là { "status": 200, "data": { "MONEY_TOTAL_FEE": ..., "KPI_HT": ... } }
      // Phản hồi VTP cho getPrice thường trả về một đối tượng trực tiếp trong 'data', không phải mảng.
      const priceResult = response?.data?.data; 

      // Debug: In priceResult để xác nhận cấu trúc
      console.log('[VTP DEBUG] priceResult object:', priceResult);

      const feeCalculated = Number(priceResult?.MONEY_TOTAL_FEE); 
      // KPI_HT thường là số giờ. calcLeadTime sẽ chuyển đổi số giờ này thành số ngày.
      const leadTimeInDays = calcLeadTime(priceResult?.KPI_HT); 

      if (feeCalculated > 0) {
        const result = {
          fee      : feeCalculated,
          leadTime : leadTimeInDays,
        };
        cache.set(cacheKey, result); // Cache kết quả phí hợp lệ
        console.log(`[VTP THÀNH CÔNG] Dịch vụ ${svc} cho tuyến ${receiverProvince}/${receiverDistrict}/${receiverWard} - Phí: ${feeCalculated}, Thời gian dự kiến: ${result.leadTime} ngày`);
        return result;
      }

      // Nếu cuộc gọi API thành công nhưng trả về phí là 0 hoặc không có, cache nó và thử dịch vụ tiếp theo
      cache.set(cacheKey, { fee: 0, leadTime: null });
      console.warn(`[VTP CẢNH BÁO] Dịch vụ ${svc} trả về phí 0 hoặc không hợp lệ cho tuyến ${receiverProvince}/${receiverDistrict}/${receiverWard}. Đang thử dịch vụ tiếp theo.`);

    } catch (err) {
      // Ghi log thông tin lỗi chi tiết từ Axios/API ViettelPost
      const receiverAddressInfo = `Tỉnh:${receiverProvince}, Huyện:${receiverDistrict}, Xã:${receiverWard || 'N/A'}`;
      if (err.response) {
          console.error(
              `[VTP LỖI] Dịch vụ ${svc} cho ${receiverAddressInfo} - Trạng thái HTTP ${err.response.status}`,
              'Dữ liệu phản hồi lỗi:', JSON.stringify(err.response.data, null, 2),
          );
      } else if (err.request) {
          console.error(
              `[VTP LỖI] Dịch vụ ${svc} cho ${receiverAddressInfo} - Không nhận được phản hồi (Mạng/Hết thời gian chờ).`,
              'Cấu hình yêu cầu:', JSON.stringify(err.config, null, 2)
          );
      } else {
          console.error(
              `[VTP LỖI] Dịch vụ ${svc} cho ${receiverAddressInfo} - Lỗi khi thiết lập yêu cầu:`,
              err.message
          );
      }
      // KHÔNG ném lỗi ở đây, để vòng lặp thử các dịch vụ khác.
    }
  }

  // Nếu vòng lặp kết thúc mà không trả về được phí hợp lệ, tức là không tìm thấy dịch vụ phù hợp.
  throw new Error('VTP: Không tìm thấy dịch vụ vận chuyển khả thi nào sau khi thử tất cả các tùy chọn có sẵn.');
}

module.exports = {
  getDefaultService, // Xuất hàm getDefaultService không đồng bộ
  getFee,
};