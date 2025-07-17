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
      wardId,
      isDefault,
      label,
    } = req.body;
    const userId = req.user.id;

   
    const existingCount = await UserAddress.count({ where: { userId } });

   
    const autoSetDefault = existingCount === 0;

    
    if (isDefault || autoSetDefault) {
      await UserAddress.update({ isDefault: false }, { where: { userId } });
    }

  
    const newAddress = await UserAddress.create({
      userId,
      fullName,
      phone,
      streetAddress,
      provinceId,
      districtId,
      wardId,
      isDefault: isDefault || autoSetDefault, 
      label,
    });

    return res.json({ message: "Thêm địa chỉ thành công", data: newAddress });
  } catch (error) {
    console.error("Lỗi thêm địa chỉ:", error.message);
    if (error.parent?.sqlMessage) {
      console.error("SQL Error:", error.parent.sqlMessage);
    }
    return res.status(500).json({ message: "Lỗi thêm địa chỉ", errorDetails: error.message });
  }
}


  static async getByUser(req, res) {
    try {
      const userId = req.user.id;
      const addresses = await UserAddress.findAll({
        where: { userId },
        include: [
          // Bao gồm thông tin Tỉnh/Thành phố
          { model: Province, attributes: ["id", "name"], as: "province" },
          // Bao gồm thông tin Quận/Huyện
          {
            model: District,
            attributes: ["id", "name"], // Giữ "ghnCode" nếu bạn có cột này và cần nó
            as: "district",
          },
          // Bao gồm thông tin Phường/Xã
          { model: Ward, attributes: ["id", "name"], as: "ward" },
        ],
        // Sắp xếp để địa chỉ mặc định lên đầu
        order: [['isDefault', 'DESC']],
      });

      res.json({ data: addresses });
    } catch (error) {
      console.log("Lỗi khi lấy danh sách địa chỉ:", error);
      res.status(500).json({ message: "Lỗi lấy danh sách địa chỉ", errorDetails: error.message });
    }
  }

  static async setDefault(req, res) {
    try {
      const userId = req.user.id;
      const id = req.params.id; // ID của địa chỉ muốn đặt làm mặc định

      // Bước 1: Đặt tất cả địa chỉ khác của người dùng về không mặc định
      await UserAddress.update({ isDefault: false }, { where: { userId } });

      // Bước 2: Đặt địa chỉ cụ thể này làm mặc định
      const [updatedRows] = await UserAddress.update({ isDefault: true }, { where: { id, userId } });

      if (updatedRows === 0) {
        return res.status(404).json({ message: "Không tìm thấy địa chỉ hoặc bạn không có quyền truy cập." });
      }

      res.json({ message: "Thiết lập địa chỉ mặc định thành công" });
    } catch (error) {
      console.error("Lỗi khi thiết lập mặc định:", error);
      res.status(500).json({ message: "Lỗi thiết lập mặc định", errorDetails: error.message });
    }
  }

  static async update(req, res) {
    try {
      const { id } = req.params; // ID của địa chỉ cần cập nhật
      const userId = req.user.id;
      const {
        fullName,
        phone,
        streetAddress,
        provinceId,
        districtId,
        wardId, // Đã thêm wardId vào đây
        isDefault,
        label,
      } = req.body;

      // Nếu địa chỉ này được đặt làm mặc định,
      // thì tất cả các địa chỉ khác của người dùng đó sẽ không còn là mặc định nữa.
      if (isDefault) {
        await UserAddress.update({ isDefault: false }, { where: { userId } });
      }

      const [updatedRows] = await UserAddress.update(
        {
          fullName,
          phone,
          streetAddress,
          provinceId,
          districtId,
          wardId, // Đã thêm wardId vào đây
          isDefault,
          label,
        },
        {
          where: { id, userId },
        }
      );

      if (updatedRows === 0) {
        return res.status(404).json({ message: "Không tìm thấy địa chỉ hoặc bạn không có quyền cập nhật." });
      }

      res.json({ message: "Cập nhật địa chỉ thành công" });
    } catch (error) {
      console.error("Lỗi cập nhật địa chỉ:", error);
      if (error.parent?.sqlMessage) {
        console.error("SQL Error:", error.parent.sqlMessage);
      }
      res.status(500).json({ message: "Lỗi cập nhật địa chỉ", errorDetails: error.message });
    }
  }

  static async remove(req, res) {
    try {
      const { id } = req.params; // ID của địa chỉ cần xóa
      const userId = req.user.id;

      const deletedRows = await UserAddress.destroy({ where: { id, userId } });

      if (deletedRows === 0) {
        return res.status(404).json({ message: "Không tìm thấy địa chỉ hoặc bạn không có quyền xóa." });
      }
      res.json({ message: "Xóa địa chỉ thành công" });
    } catch (error) {
      console.error("Lỗi xóa địa chỉ:", error);
      res.status(500).json({ message: "Lỗi xóa địa chỉ", errorDetails: error.message });
    }
  }

  static async getDefault(req, res) {
    try {
      const userId = req.user.id;
      const { addressId } = req.query; // Có thể truyền addressId để lấy địa chỉ cụ thể
      let address;

      const provinceAttributes = ["id", "name"];
      const districtAttributes = ["id", "name", "ghnCode"];
      const wardAttributes = ["id", "name"];

      const includeOptions = [
        { model: Province, as: "province", attributes: provinceAttributes },
        { model: District, as: "district", attributes: districtAttributes },
        { model: Ward, as: "ward", attributes: wardAttributes },
      ];

      if (addressId) {
        // Lấy địa chỉ theo ID cụ thể (nếu có)
        address = await UserAddress.findOne({
          where: { id: addressId, userId },
          include: includeOptions,
        });
      } else {
        // Mặc định lấy địa chỉ mặc định
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
      if (error.parent?.sql) {
        console.error("SQL Query (nếu có):", error.parent.sql);
      }
      res
        .status(500)
        .json({ message: "Lỗi lấy địa chỉ", errorDetails: error.message });
    }
  }
}

module.exports = UserAddressController;