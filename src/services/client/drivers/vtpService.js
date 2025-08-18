// drivers/vtpService.js
const axios = require('axios');
const NodeCache = require('node-cache');
const fuzzysort = require('fuzzysort'); 
const cache = new NodeCache({ stdTTL: 86_400 });

const {
  ProviderProvince,
  ProviderDistrict,
  ProviderWard,
} = require('../../../models');

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

async function getVtpCodesFromLocalDb({ provinceId, districtId, wardId }) {
  const VTP_PROVIDER_ID = 1; 
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
  if (_availableServiceList) {
    return _availableServiceList;
  }
  const cacheKey = 'vtp:serviceList';
  const cached = cache.get(cacheKey);
  if (cached) {
    _availableServiceList = cached;
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
    return _availableServiceList;
  } catch (err) {
    if (err.response) {
      console.error(`HTTP Status: ${err.response.status}`);
      console.error(`Dữ liệu phản hồi: ${JSON.stringify(err.response.data)}`);
    } else if (err.request) {
      console.error(`Không nhận được phản hồi: ${err.message}`);
    } else {
      console.error(`Lỗi thiết lập yêu cầu: ${err.message}`);
    }
    _availableServiceList = ['VCN', 'VHT', 'VTK', 'SCOD', 'V60'];
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
  const { pvCode, dtCode, wdCode } = await getVtpCodesFromLocalDb({
    provinceId: toProvince,
    districtId: toDistrict,
    wardId: toWard,
  });

  if (!pvCode || !dtCode) {
    throw new Error('VTP: Không tìm thấy mã tỉnh/huyện VTP cho địa chỉ nhận từ DB nội bộ.');
  }

  const senderProvId = 1;
  const senderDistId = 1;

  if (isNaN(senderProvId) || isNaN(senderDistId)) {
    throw new Error('VTP: Biến môi trường VTP_SHOP_PROVINCE_ID hoặc VTP_SHOP_DISTRICT_ID không hợp lệ.');
  }
  
  const {
    pvCode: senderPvCode,
    dtCode: senderDtCode,
    wdCode: senderWdCode
  } = await getVtpCodesFromLocalDb({
    provinceId: senderProvId,
    districtId: senderDistId,
    wardId: Number(VTP_SHOP_WARD_ID),
  });

  if (!senderPvCode || !senderDtCode) {
    throw new Error('VTP: Không tìm thấy mã tỉnh/huyện VTP cho địa chỉ gửi từ DB nội bộ. Vui lòng kiểm tra lại cấu hình VTP_SHOP_PROVINCE_ID và VTP_SHOP_DISTRICT_ID.');
  }
  
  const availableServices = await loadServiceList();
  const servicesToTry = serviceCode
    ? [serviceCode].filter(s => availableServices.includes(s))
    : ['VCN', 'VHT', 'VTK', ...availableServices.filter(s => !['VCN','VHT','VTK'].includes(s))]
    .filter(s => availableServices.includes(s));

  if (servicesToTry.length === 0) {
    throw new Error('VTP: Không có dịch vụ vận chuyển phù hợp nào khả dụng cho tài khoản này.');
  }

  for (const svc of servicesToTry) {
    const cacheKey = buildCacheKey(
      pvCode, dtCode, wdCode,
      weight, length, width, height, svc,
    );
    const cached = cache.get(cacheKey);
    if (cached) {
      if (cached.fee > 0) {
        return cached;
      }
      continue;
    }

   const requestBody = {
 PRODUCT_TYPE: 'HH',
 SENDER_PROVINCE: Number(senderPvCode),
 SENDER_DISTRICT: Number(senderDtCode),
 SENDER_WARD: senderWdCode ? Number(senderWdCode) : undefined,
 RECEIVER_PROVINCE: Number(pvCode),
 RECEIVER_DISTRICT: Number(dtCode),
 RECEIVER_WARD: wdCode ? Number(wdCode) : undefined,
 PRODUCT_WEIGHT: Math.max(Number(weight) || 0, 100),
 PRODUCT_DIMENSION: `${Math.max(length || 0, 1)}x${Math.max(width || 0, 1)}x${Math.max(height || 0, 1)}`,
 ORDER_SERVICE: svc,
 ORDER_SERVICE_ADD: '',
 NATIONAL_TYPE: 1,
 ORDER_VALUE: Math.max(Number(orderValue) || 0, 100_000),
};


    try {
      const response = await axios.post(
        'https://partner.viettelpost.vn/v2/order/getPrice',
        requestBody,
        { headers: HEADERS, timeout: 10_000 }
      );
      
      const priceResult = response?.data?.data;
      
      const feeCalculated = Number(priceResult?.MONEY_TOTAL_FEE);
      const leadTimeInDays = calcLeadTime(priceResult?.KPI_HT);
      
      if (feeCalculated > 0) {
        const result = {
          fee: feeCalculated,
          leadTime: leadTimeInDays,
        };
        cache.set(cacheKey, result);
        return result;
      }
      
      cache.set(cacheKey, { fee: 0, leadTime: null });
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
