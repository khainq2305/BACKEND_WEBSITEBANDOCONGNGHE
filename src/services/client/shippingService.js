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

  /**
   * Lấy thời gian giao hàng dự kiến (leadTime).
   *
   * @param {object} payload
   * @returns {Promise<number|null>}
   */
  static async getLeadTime({
    providerId, toProvince, toDistrict, toWard,
    weight, length, width, height,
    serviceCode = null,
  }) {
    const provider = await ShippingProvider.findByPk(providerId);
    if (!provider || !provider.isActive) {
      console.warn(`[getLeadTime] Hãng vận chuyển ID ${providerId} không hoạt động hoặc không tồn tại.`);
      throw new Error('Hãng vận chuyển không hoạt động');
    }

    const driver = drivers[provider.code];
    if (!driver || !driver.getLeadTime) {
      console.error(`[getLeadTime] Driver cho hãng "${provider.code}" không hỗ trợ getLeadTime.`);
      throw new Error(`Chưa hỗ trợ getLeadTime cho “${provider.code}”`);
    }

    return driver.getLeadTime({
      toProvince,
      toDistrict,
      toWard,
      weight,
      length,
      width,
      height,
      serviceCode,
    });
  }
}

ShippingService.drivers = drivers;

module.exports = ShippingService;
