// helpers/providerMapper.js (rút gọn)
const {
  ProviderProvince,
  ProviderDistrict,
  ProviderWard
} = require('../models');

async function vtpCodesById({ provinceId, districtId, wardId }) {
  // province code
  const pv = await ProviderProvince.findOne({
    where: { providerId: 3, provinceId },       // <- có cột provinceId?
    attributes: ['providerProvinceCode']
  });

  // district code
  const dt = await ProviderDistrict.findOne({
    where: { providerId: 3, districtId },
    attributes: ['providerDistrictCode']
  });

  // ward code (có thể null)
  const wd = await ProviderWard.findOne({
    where: { providerId: 3, wardId },
    attributes: ['providerWardCode']
  });

  return {
    pvCode : pv?.providerProvinceCode,
    dtCode : dt?.providerDistrictCode,
    wdCode : wd?.providerWardCode || null
  };
}
module.exports = { vtpCodesById };
