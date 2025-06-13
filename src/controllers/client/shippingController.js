// ShippingController sử dụng database thay vì gọi GHN trực tiếp
const { Province, District, Ward } = require('../../models');

class ShippingController {
 
  static async getProvinces(req, res) {
    try {
      const provinces = await Province.findAll({ attributes: ['id', 'name'], order: [['name', 'ASC']] });
      res.json(provinces);
    } catch (error) {
      console.error('Lỗi lấy tỉnh từ DB:', error.message);
      res.status(500).json({ message: 'Lỗi lấy tỉnh từ database' });
    }
  }

  static async getDistricts(req, res) {
    const { province_id } = req.query;
    if (!province_id) {
      return res.status(400).json({ message: 'Thiếu province_id' });
    }

    try {
      const districts = await District.findAll({
        where: { provinceId: province_id },
        attributes: ['id', 'name'],
        order: [['name', 'ASC']]
      });
      res.json(districts);
    } catch (error) {
      console.error('Lỗi lấy quận từ DB:', error.message);
      res.status(500).json({ message: 'Lỗi lấy quận từ database' });
    }
  }


  static async getWards(req, res) {
    const { district_id } = req.query;
    if (!district_id) {
      return res.status(400).json({ message: 'Thiếu district_id' });
    }

    try {
      const wards = await Ward.findAll({
        where: { districtId: district_id },
        attributes: ['code', 'name'],
        order: [['name', 'ASC']]
      });
      res.json(wards);
    } catch (error) {
      console.error('Lỗi lấy xã từ DB:', error.message);
      res.status(500).json({ message: 'Lỗi lấy xã từ database' });
    }
  }
}

module.exports = ShippingController;