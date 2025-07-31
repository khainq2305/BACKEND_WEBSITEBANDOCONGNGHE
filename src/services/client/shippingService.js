// services/ShippingService.js
const GHN = require('./drivers/ghnService');
const GHTK = require('./drivers/ghtkService');
const VTP = require('./drivers/vtpService');
const {
  ShippingProvider,
  ProviderProvince,
  ProviderDistrict,
  ProviderWard,
  Province,
  District,
  Ward,
  Sku,
} = require('../../models');
const { Op } = require('sequelize');

const drivers = {
  ghn: GHN,
  ghtk: GHTK,
  vtp: VTP,
};

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
    orderValue = 0,
    provinceName = null, districtName = null, wardName = null,
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

    // Các driver sẽ tự xử lý việc mapping ID nội bộ thành mã API
    return driver.getFee({
      toProvince,
      toDistrict,
      toWard,
      weight,
      length,
      width,
      height,
      serviceCode,
      orderValue,
    });
  }
}

ShippingService.drivers = drivers;

module.exports = ShippingService;