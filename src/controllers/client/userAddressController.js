const { UserAddress, Province, District, Ward } = require('../../models');


class UserAddressController {
  static async create(req, res) {
    try {
      const { fullName, phone, street, provinceId, districtId, wardCode, isDefault, addressType } = req.body;
      const userId = req.user.id; // đã đăng nhập

      if (isDefault) {
        await UserAddress.update({ isDefault: false }, { where: { userId } });
      }

      const newAddress = await UserAddress.create({
        userId,
        fullName,
        phone,
        street,
        provinceId,
        districtId,
        wardCode,
        isDefault,
        addressType
      });

      res.json({ message: "Thêm địa chỉ thành công", data: newAddress });
    } catch (error) {
      console.error("❌ Lỗi thêm địa chỉ:", error.message);
      res.status(500).json({ message: "Lỗi thêm địa chỉ" });
    }
  }

  static async getByUser(req, res) {
  try {
    console.log("✅ req.user:", req.user); // <<== DÒNG NÀY
    const userId = req.user.id;
const addresses = await UserAddress.findAll({
  where: { userId },
  include: [
    { model: Province, attributes: ['name'], as: 'province' },
    { model: District, attributes: ['name'], as: 'district' },
    { model: Ward, attributes: ['name'], as: 'ward' }
  ]
});

    res.json({ data: addresses });
  } catch (error) {
    console.log("❌ Lỗi:", error);
    res.status(500).json({ message: "Lỗi lấy danh sách địa chỉ" });
  }
}
static async setDefault(req, res) {
  try {
    const userId = req.user.id;
    const id = req.params.id;

    // ✅ Reset tất cả địa chỉ về false
    await UserAddress.update({ isDefault: false }, { where: { userId } });

    // ✅ Cập nhật địa chỉ được chọn là mặc định
    await UserAddress.update({ isDefault: true }, { where: { id, userId } });

    res.json({ message: "Thiết lập địa chỉ mặc định thành công" });
  } catch (error) {
    console.error("❌ Lỗi khi thiết lập mặc định:", error);
    res.status(500).json({ message: "Lỗi thiết lập mặc định" });
  }
}
static async update(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const {
      fullName, phone, street,
      provinceId, districtId, wardCode,
      isDefault, addressType
    } = req.body;

    if (isDefault) {
      // Nếu là mặc định, reset các địa chỉ khác về false
      await UserAddress.update({ isDefault: false }, { where: { userId } });
    }

    await UserAddress.update({
      fullName, phone, street,
      provinceId, districtId, wardCode,
      isDefault, addressType
    }, {
      where: { id, userId }
    });

    res.json({ message: "Cập nhật địa chỉ thành công" });
  } catch (error) {
    console.error("❌ Lỗi cập nhật địa chỉ:", error);
    res.status(500).json({ message: "Lỗi cập nhật địa chỉ" });
  }
}
static async remove(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    await UserAddress.destroy({ where: { id, userId } });
    res.json({ message: "Xóa địa chỉ thành công" });
  } catch (error) {
    console.error("❌ Lỗi xóa địa chỉ:", error);
    res.status(500).json({ message: "Lỗi xóa địa chỉ" });
  }
}


}

module.exports = UserAddressController;
