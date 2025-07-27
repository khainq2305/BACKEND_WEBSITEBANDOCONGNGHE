const GHN = require('./drivers/ghnService');
const GHTK = require('./drivers/ghtkService'); // Giữ nguyên nếu bạn có driver này
const VTP = require('./drivers/vtpService');   // Giữ nguyên nếu bạn có driver này

// Import các models cần thiết từ thư mục cha
const {
    ShippingProvider,
    ProviderProvince,
    ProviderDistrict,
    ProviderWard,
    Province,
    District,
    Ward,
} = require('../../models');
const { Op } = require('sequelize'); // Cần Op cho Sequelize queries

// Map shippingProviders.code → driver
const drivers = {
    ghn: GHN,
    ghtk: GHTK, // Giữ nguyên
    vtp: VTP,   // Giữ nguyên
    // Thêm các driver khác nếu có (ví dụ: jnt: require('./drivers/jntService'))
    // XÓA HOẶC COMMENT DÒNG NÀY ĐỂ BỎ J&T
    // jnt: require('./drivers/jntService'),
};

/*───────────────────────────────────────────────────────────
 * Helpers (Đã đồng bộ với hàm norm trong ghnService.js)
 *───────────────────────────────────────────────────────────*/

// Hàm chuẩn hóa (giống hệt norm() trong ghnService.js và importGhn.js)
const deAccent = t => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const stripProv = t => t.replace(/^(Tỉnh|Tinh|Thành phố|Thanh pho|TP)\s+/i, '');
const stripDist = t => t.replace(/^(Quận|Quan|Huyện|Huyen|Thị xã|Thi xa|TP|TX)\s+/i, '');
const stripWard = t => t.replace(/^(Phường|Phuong|Xã|Xa|Thị trấn|Thi tran)\s+/i, '');
function normalize(str = '') {
    return deAccent(stripDist(stripProv(stripWard(str || ''))))
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

/**
 * Tra mã ViettelPost (PROVINCE_ID / DISTRICT_ID / WARDS_ID)
 * từ id **hoặc** tên nội bộ của DB.
 *
 * @param {object} param
 * @param {number|null} param.province – id bảng `provinces` nội bộ
 * @param {number|null} param.district – id bảng `districts` nội bộ
 * @param {number|null} param.ward – id bảng `wards` nội bộ
 * @param {string|null} param.provinceName – tên tỉnh nội bộ
 * @param {string|null} param.districtName – tên huyện nội bộ
 * @param {string|null} param.wardName – tên xã nội bộ
 * @returns {{pvCode:number|null, dtCode:number|null, wdCode:number|null}}
 */
async function mapVtpCodes({
    provinceId,
    districtId,
    wardId,
    provinceName,
    districtName,
    wardName,
}) {
    console.log(`[DEBUG mapVtpCodes] Đầu vào: ProvID=${provinceId}, DistID=${districtId}, WardID=${wardId}, ProvName="${provinceName}", DistName="${districtName}", WardName="${wardName}"`);

    let pvCode = null, dtCode = null, wdCode = null;

    /* ----- Tra cứu Province Code của VTP ----- */
    let provMapResult = null;
    if (provinceId) {
        provMapResult = await ProviderProvince.findOne({
            where: { providerId: 3, provinceId },
            attributes: ['providerProvinceCode'],
        });
        console.log(`[DEBUG mapVtpCodes] Query Prov by ID ${provinceId}: ${provMapResult ? 'FOUND' : 'NOT FOUND'}, Code: ${provMapResult?.providerProvinceCode || 'N/A'}`);
    }
    if (!provMapResult && provinceName) {
        provMapResult = await ProviderProvince.findOne({
            where: {
                providerId: 3,
                providerProvinceName: normalize(provinceName),
            },
            attributes: ['providerProvinceCode'],
        });
        console.log(`[DEBUG mapVtpCodes] Query Prov by Name "${provinceName}" (Normalized: "${normalize(provinceName)}"): ${provMapResult ? 'FOUND' : 'NOT FOUND'}, Code: ${provMapResult?.providerProvinceCode || 'N/A'}`);
    }
    pvCode = provMapResult?.providerProvinceCode ?? null;

    /* ----- Tra cứu District Code của VTP ----- */
    let distMapResult = null;
    if (districtId) {
        distMapResult = await ProviderDistrict.findOne({
            where: { providerId: 3, districtId },
            attributes: ['providerDistrictCode'],
        });
        console.log(`[DEBUG mapVtpCodes] Query Dist by ID ${districtId}: ${distMapResult ? 'FOUND' : 'NOT FOUND'}, Code: ${distMapResult?.providerDistrictCode || 'N/A'}`);
    }
    if (!distMapResult && districtName && pvCode) {
        distMapResult = await ProviderDistrict.findOne({
            where: {
                providerId: 3,
                providerDistrictName: normalize(districtName),
                providerProvinceCode: pvCode,
            },
            attributes: ['providerDistrictCode'],
        });
        console.log(`[DEBUG mapVtpCodes] Query Dist by Name "${districtName}" (Normalized: "${normalize(districtName)}") and ProvCode ${pvCode}: ${distMapResult ? 'FOUND' : 'NOT FOUND'}, Code: ${distMapResult?.providerDistrictCode || 'N/A'}`);
    }
    dtCode = distMapResult?.providerDistrictCode ?? null;

    /* ----- Tra cứu Ward Code của VTP (có thể null) ----- */
    let wardMapResult = null;
    if (wardId) {
        wardMapResult = await ProviderWard.findOne({
            where: { providerId: 3, wardId },
            attributes: ['providerWardCode'],
        });
        console.log(`[DEBUG mapVtpCodes] Query Ward by ID ${wardId}: ${wardMapResult ? 'FOUND' : 'NOT FOUND'}, Code: ${wardMapResult?.providerWardCode || 'N/A'}`);
    }
    if (!wardMapResult && wardName && dtCode) {
        wardMapResult = await ProviderWard.findOne({
            where: {
                providerId: 3,
                providerWardName: normalize(wardName),
                providerDistrictCode: dtCode,
            },
            attributes: ['providerWardCode'],
        });
        console.log(`[DEBUG mapVtpCodes] Query Ward by Name "${wardName}" (Normalized: "${normalize(wardName)}") and DistCode ${dtCode}: ${wardMapResult ? 'FOUND' : 'NOT FOUND'}, Code: ${wardMapResult?.providerWardCode || 'N/A'}`);
    }
    wdCode = wardMapResult?.providerWardCode ?? null;

    console.log(`[mapVtpCodes] Mapped codes for VTP: Prov: ${pvCode}, Dist: ${dtCode}, Ward: ${wdCode}`);
    return { pvCode, dtCode, wdCode };
}

/*───────────────────────────────────────────────────────────
 * Service class
 *───────────────────────────────────────────────────────────*/
class ShippingService {
    /**
     * Tính phí giao hàng & lead-time.
     *
     * @param {object} payload
     * @returns {Promise<{ fee:number, leadTime:number|null }>}
     */
    static async calcFee({
        providerId, toProvince, toDistrict, toWard,
        weight, length, width, height,
        serviceCode = null,
        provinceName = null, districtName = null, wardName = null,
        orderValue = 0, // ✅ Thêm dòng này
    }) {
        const provider = await ShippingProvider.findByPk(providerId);
        if (!provider || !provider.isActive) {
            console.warn(`[calcFee] Hãng vận chuyển ID ${providerId} không hoạt động hoặc không tồn tại.`);
            throw new Error('Hãng vận chuyển không hoạt động');
        }

        const driver = drivers[provider.code];
        if (!driver) {
            console.error(`[calcFee] Driver cho hãng "${provider.code}" không được định nghĩa.`);
            throw new Error(`Chưa hỗ trợ driver “${provider.code}”`);
        }

        let finalProvince = toProvince, finalDistrict = toDistrict, finalWard = toWard;

        if (provider.code === 'vtp') {
            const { pvCode, dtCode, wdCode } = await mapVtpCodes({
                provinceId: typeof toProvince === 'number' ? toProvince : null,
                districtId: typeof toDistrict === 'number' ? toDistrict : null,
                wardId: typeof toWard === 'number' ? toWard : null,
                provinceName, districtName, wardName,
            });

            if (!pvCode || !dtCode) {
                throw new Error('Không tìm thấy mã tỉnh/huyện VTP.');
            }

            finalProvince = pvCode;
            finalDistrict = dtCode;
            finalWard = wdCode;
        }

   let finalService = serviceCode;

if (!finalService && provider.code === 'ghn') {
  finalService = await driver.getDefaultService({
    toDistrict: finalDistrict, // finalDistrict lúc này là GHN District ID
  });
}

if (!finalService && provider.code === 'vtp') {
  finalService = await driver.getDefaultService({
    toProvince: finalProvince,
    toDistrict: finalDistrict,
  });
}

// Các hãng khác nếu cần getDefaultService thì viết thêm ở đây


        return driver.getFee({
            toProvince: finalProvince,
            toDistrict: finalDistrict,
            toWard: finalWard,
            weight, length, width, height,
            serviceCode: finalService,
              orderValue, // 🔥 Thêm dòng này
        });
    }
}

ShippingService.drivers = drivers;

module.exports = ShippingService;