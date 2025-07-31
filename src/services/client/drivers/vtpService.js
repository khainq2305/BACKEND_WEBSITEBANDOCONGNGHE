// drivers/vtpService.js
const axios = require('axios');
const NodeCache = require('node-cache');
const fuzzysort = require('fuzzysort'); 
const cache = new NodeCache({ stdTTL: 86_400 });

// Import các models cần thiết từ thư mục cha
const {
  ProviderProvince,
  ProviderDistrict,
  ProviderWard,
} = require('../../../models');

/* ─────── ENVIRONMENT VARIABLES ─────── */
const {
  VTP_API_TOKEN,
  VTP_SHOP_PROVINCE_ID,
  VTP_SHOP_DISTRICT_ID,
  VTP_SHOP_WARD_ID,
} = process.env;

if (!VTP_API_TOKEN) {
  console.error('ERROR: VTP_API_TOKEN is not defined in .env. ViettelPost service will not function.');
}
if (!VTP_SHOP_PROVINCE_ID || !VTP_SHOP_DISTRICT_ID) {
  console.warn('WARNING: VTP_SHOP_PROVINCE_ID or VTP_SHOP_DISTRICT_ID is missing in .env. Shop origin details for ViettelPost might be incomplete or incorrect, affecting fee calculations.');
}

const HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${VTP_API_TOKEN}`,
};

/* ─────── HELPER FUNCTIONS ─────── */

/**
 * Tra cứu mã ViettelPost (PROVINCE_ID / DISTRICT_ID / WARDS_ID) từ ID nội bộ.
 */
async function getVtpCodesFromLocalDb({ provinceId, districtId, wardId }) {
  const VTP_PROVIDER_ID = 3;
  let pvCode = null, dtCode = null, wdCode = null;

  const provMapResult = await ProviderProvince.findOne({
    where: { providerId: VTP_PROVIDER_ID, provinceId },
    attributes: ['providerProvinceCode'],
  });
  pvCode = provMapResult?.providerProvinceCode ?? null;

  if (pvCode) {
    const distMapResult = await ProviderDistrict.findOne({
      where: { providerId: VTP_PROVIDER_ID, districtId, },
      attributes: ['providerDistrictCode'],
    });
    dtCode = distMapResult?.providerDistrictCode ?? null;
  }
  
  if (dtCode && wardId) {
    const wardMapResult = await ProviderWard.findOne({
      where: { providerId: VTP_PROVIDER_ID, wardId},
      attributes: ['providerWardCode'],
    });
    wdCode = wardMapResult?.providerWardCode ?? null;
  }
  
  return { pvCode, dtCode, wdCode };
}

function buildCacheKey(p, d, wd, w, l, wid, h, svc) {
  return `vtp:${p}|${d}|${wd || 0}|${w || 0}|${l}|${wid}|${h}|${svc}`;
}

function calcLeadTime(kpiHtValue) {
  const hours = Number(kpiHtValue);
  if (isNaN(hours) || hours <= 0) {
    return null;
  }
  return Math.max(1, Math.ceil(hours / 24));
}

let _availableServiceList = null;

async function loadServiceList() {
  if (_availableServiceList) return _availableServiceList;
  const cacheKey = 'vtp:serviceList';
  const cached = cache.get(cacheKey);
  if (cached) {
    _availableServiceList = cached;
    console.log('[VTP] Danh sách dịch vụ được tải từ cache.');
    return cached;
  }

  try {
    const { data } = await axios.post(
      'https://partner.viettelpost.vn/v2/categories/listService',
      { "TYPE": 2 },
      { headers: HEADERS },
    );
    const services = (data?.data || []).map(s => s.SERVICE_CODE);
    _availableServiceList = services;
    cache.set(cacheKey, _availableServiceList, 86_400);
    console.log(`[VTP] Đã tải thành công ${services.length} dịch vụ từ API.`);
    return _availableServiceList;
  } catch (err) {
    console.error(`[VTP ERROR] Lỗi khi lấy danh sách dịch vụ từ ViettelPost API. Sẽ sử dụng dịch vụ dự phòng.`);
    if (err.response) {
      console.error(`  HTTP Status: ${err.response.status}`);
      console.error(`  Dữ liệu phản hồi: ${JSON.stringify(err.response.data)}`);
    } else if (err.request) {
      console.error(`  Không nhận được phản hồi: ${err.message}`);
    } else {
      console.error(`  Lỗi thiết lập yêu cầu: ${err.message}`);
    }
    _availableServiceList = ['VCN', 'VHT', 'VTK', 'SCOD', 'V60'];
    console.warn(`[VTP CẢNH BÁO] Sử dụng danh sách dịch vụ dự phòng: ${_availableServiceList.join(', ')}`);
    return _availableServiceList;
  }
}

async function getDefaultService({ toProvince, toDistrict }) {
  const services = await loadServiceList();
  if (services && services.length > 0) {
    if (services.includes('VCN')) return 'VCN';
    if (services.includes('VTK')) return 'VTK';
    if (services.includes('VHT')) return 'VHT';
    return services[0];
  }
  return null;
}

async function getFee({
  toProvince, toDistrict, toWard = null,
  weight, length, width, height,
  serviceCode = null,
  orderValue = 0,
}) {
  // 💥 ĐIỂM SỬA QUAN TRỌNG: Gọi hàm mapping địa chỉ ở đây
  const { pvCode, dtCode, wdCode } = await getVtpCodesFromLocalDb({
    provinceId: toProvince,
    districtId: toDistrict,
    wardId: toWard,
  });

  if (!pvCode || !dtCode) {
    throw new Error('VTP: Không tìm thấy mã tỉnh/huyện VTP từ DB nội bộ.');
  }

  const availableServices = await loadServiceList();
  const servicesToTry = serviceCode
    ? [serviceCode].filter(s => availableServices.includes(s))
    : ['VCN', 'VHT', 'VTK', ...availableServices.filter(s => !['VCN','VHT','VTK'].includes(s))]
      .filter(s => availableServices.includes(s));

  if (servicesToTry.length === 0) {
    console.warn('[VTP] Không tìm thấy dịch vụ phù hợp sau khi lọc.');
    throw new Error('VTP: Không có dịch vụ vận chuyển phù hợp nào khả dụng cho tài khoản này.');
  }

  const senderProvince = Number(VTP_SHOP_PROVINCE_ID);
  const senderDistrict = Number(VTP_SHOP_DISTRICT_ID);
  const senderWard = VTP_SHOP_WARD_ID ? Number(VTP_SHOP_WARD_ID) : undefined;

  for (const svc of servicesToTry) {
    const cacheKey = buildCacheKey(
      pvCode, dtCode, wdCode,
      weight, length, width, height, svc,
    );
    const cached = cache.get(cacheKey);
    if (cached) {
      if (cached.fee > 0) {
        console.log(`[VTP CACHE HIT] ${svc} - Phí: ${cached.fee}, Thời gian dự kiến: ${cached.leadTime} ngày (từ cache)`);
        return cached;
      }
      console.warn(`[VTP CACHE CẢNH BÁO] ${svc} - Kết quả cache cho thấy phí bằng 0 hoặc không phù hợp. Đang thử dịch vụ tiếp theo.`);
      continue;
    }

    const requestBody = {
      PRODUCT_TYPE: 'HH',
      SENDER_PROVINCE: senderProvince,
      SENDER_DISTRICT: senderDistrict,
      SENDER_WARD: senderWard,
      RECEIVER_PROVINCE: pvCode, // Sử dụng mã VTP đã được mapping
      RECEIVER_DISTRICT: dtCode, // Sử dụng mã VTP đã được mapping
      RECEIVER_WARD: wdCode,   // Sử dụng mã VTP đã được mapping
      PRODUCT_WEIGHT: Math.max(Number(weight) || 0, 100),
      PRODUCT_DIMENSION: `${Math.max(length || 0, 1)}x${Math.max(width || 0, 1)}x${Math.max(height || 0, 1)}`,
      ORDER_SERVICE: svc,
      ORDER_SERVICE_ADD: '',
      NATIONAL_TYPE: 1,
      ORDER_VALUE: Math.max(Number(orderValue) || 0, 100_000),
    };

    try {
      console.log('\n[VTP] Đang gửi request body đến API getPrice →', JSON.stringify(requestBody, null, 2));
      const response = await axios.post(
        'https://partner.viettelpost.vn/v2/order/getPrice',
        requestBody,
        { headers: HEADERS, timeout: 10_000 }
      );
      console.log(`[VTP] Phản hồi API VTP (full data): ${JSON.stringify(response.data, null, 2)}`);
      
      const priceResult = response?.data?.data;
      console.log('[VTP DEBUG] priceResult object:', priceResult);
      
      const feeCalculated = Number(priceResult?.MONEY_TOTAL_FEE);
      const leadTimeInDays = calcLeadTime(priceResult?.KPI_HT);
      
      if (feeCalculated > 0) {
        const result = {
          fee: feeCalculated,
          leadTime: leadTimeInDays,
        };
        cache.set(cacheKey, result);
        console.log(`[VTP THÀNH CÔNG] Dịch vụ ${svc} cho tuyến ${pvCode}/${dtCode}/${wdCode} - Phí: ${feeCalculated}, Thời gian dự kiến: ${result.leadTime} ngày`);
        return result;
      }
      
      cache.set(cacheKey, { fee: 0, leadTime: null });
      console.warn(`[VTP CẢNH BÁO] Dịch vụ ${svc} trả về phí 0 hoặc không hợp lệ cho tuyến ${pvCode}/${dtCode}/${wdCode}. Đang thử dịch vụ tiếp theo.`);
    } catch (err) {
      const receiverAddressInfo = `Tỉnh:${pvCode}, Huyện:${dtCode}, Xã:${wdCode || 'N/A'}`;
      if (err.response) {
        console.error(`[VTP LỖI] Dịch vụ ${svc} cho ${receiverAddressInfo} - Trạng thái HTTP ${err.response.status}`, 'Dữ liệu phản hồi lỗi:', JSON.stringify(err.response.data, null, 2));
      } else if (err.request) {
        console.error(`[VTP LỖI] Dịch vụ ${svc} cho ${receiverAddressInfo} - Không nhận được phản hồi (Mạng/Hết thời gian chờ).`, 'Cấu hình yêu cầu:', JSON.stringify(err.config, null, 2));
      } else {
        console.error(`[VTP LỖI] Dịch vụ ${svc} cho ${receiverAddressInfo} - Lỗi khi thiết lập yêu cầu:`, err.message);
      }
    }
  }

  throw new Error('VTP: Không tìm thấy dịch vụ vận chuyển khả thi nào sau khi thử tất cả các tùy chọn có sẵn.');
}

module.exports = {
  getDefaultService,
  getFee,
};