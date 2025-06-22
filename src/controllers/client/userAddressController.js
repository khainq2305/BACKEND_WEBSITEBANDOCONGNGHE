const { UserAddress, Province, District, Ward } = require("../../models");

class UserAddressController {
  static async create(req, res) {
    try {
      const {
        fullName,
        phone,
        streetAddress,
        provinceId,
        districtId,
        wardCode,
        isDefault,
        label,
      } = req.body;
      const userId = req.user.id;

      if (isDefault) {
        await UserAddress.update({ isDefault: false }, { where: { userId } });
      }

      const newAddress = await UserAddress.create({
        userId,
        fullName,
        phone,
        streetAddress,
        provinceId,
        districtId,
        wardCode,
        isDefault,
        label,
      });

      res.json({ message: "Thêm địa chỉ thành công", data: newAddress });
    } catch (error) {
      console.error("Lỗi thêm địa chỉ:", error.message);
      res.status(500).json({ message: "Lỗi thêm địa chỉ" });
    }
  }

  static async getByUser(req, res) {
    try {
      const userId = req.user.id;
      const addresses = await UserAddress.findAll({
        where: { userId },
        include: [
          { model: Province, attributes: ["id", "name"], as: "province" },
          {
            model: District,
            attributes: ["id", "name", "ghnCode"],
            as: "district",
          },
          { model: Ward, attributes: ["id", "name", "code"], as: "ward" },
        ],
      });

      res.json({ data: addresses });
    } catch (error) {
      console.log("Lỗi:", error);
      res.status(500).json({ message: "Lỗi lấy danh sách địa chỉ" });
    }
  }
  static async setDefault(req, res) {
    try {
      const userId = req.user.id;
      const id = req.params.id;

      await UserAddress.update({ isDefault: false }, { where: { userId } });

      await UserAddress.update({ isDefault: true }, { where: { id, userId } });

      res.json({ message: "Thiết lập địa chỉ mặc định thành công" });
    } catch (error) {
      console.error("Lỗi khi thiết lập mặc định:", error);
      res.status(500).json({ message: "Lỗi thiết lập mặc định" });
    }
  }
  static async update(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const {
        fullName,
        phone,
        streetAddress,
        provinceId,
        districtId,
        wardCode,
        isDefault,
        label,
      } = req.body;

      if (isDefault) {
        await UserAddress.update({ isDefault: false }, { where: { userId } });
      }

      await UserAddress.update(
        {
          fullName,
          phone,
          streetAddress,
          provinceId,
          districtId,
          wardCode,
          isDefault,
          label,
        },
        {
          where: { id, userId },
        }
      );

      res.json({ message: "Cập nhật địa chỉ thành công" });
    } catch (error) {
      console.error("Lỗi cập nhật địa chỉ:", error);
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
      console.error("Lỗi xóa địa chỉ:", error);
      res.status(500).json({ message: "Lỗi xóa địa chỉ" });
    }
  }
  static async getDefault(req, res) {
    try {
      const userId = req.user.id;
      const { addressId } = req.query;
      let address;
      console.log("👉 [getDefault] req.user.id:", req.user.id);

      const provinceAttributes = ["id", "name"];
      const districtAttributes = ["id", "name", "ghnCode"];
      const wardAttributes = ["id", "name", "code"];

      const includeOptions = [
        { model: Province, as: "province", attributes: provinceAttributes },
        { model: District, as: "district", attributes: districtAttributes },
        { model: Ward, as: "ward", attributes: wardAttributes },
      ];

      if (addressId) {
        address = await UserAddress.findOne({
          where: { id: addressId, userId },
          include: includeOptions,
        });
      } else {
        address = await UserAddress.findOne({
          where: { userId, isDefault: true },
          include: includeOptions,
        });
      }

      res.json({ data: address || null });
    } catch (error) {
      console.error(
        "Lỗi lấy địa chỉ mặc định:",
        error.name,
        error.message,
        error.parent?.sqlMessage
      );
      console.error("SQL Query (nếu có):", error.parent?.sql);
      res
        .status(500)
        .json({ message: "Lỗi lấy địa chỉ", errorDetails: error.message });
    }
  }
}

module.exports = UserAddressController;
