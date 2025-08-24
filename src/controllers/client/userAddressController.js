const { UserAddress, Province, District, Ward } = require("../../models");
const { Op } = require('sequelize');

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
        latitude,    // thêm
  longitude,   // thêm
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
      latitude,   // thêm
  longitude,  // thêm
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
      where: {
        userId,
        isDeleted: false, 
      },
      include: [
        { model: Province, attributes: ["id", "name"], as: "province" },
        {
          model: District,
          attributes: ["id", "name"],
          as: "district",
        },
        { model: Ward, attributes: ["id", "name"], as: "ward" },
      ],
      order: [["isDefault", "DESC"]],
    });

    res.json({ data: addresses });
  } catch (error) {
    console.log("Lỗi khi lấy danh sách địa chỉ:", error);
    res.status(500).json({
      message: "Lỗi lấy danh sách địa chỉ",
      errorDetails: error.message,
    });
  }
}


 static async setDefault(req, res) {
  try {
    const userId = req.user.id;
    const id = req.params.id;

   
    const address = await UserAddress.findOne({
      where: { id, userId, isDeleted: false }
    });

    if (!address) {
      return res.status(404).json({
        message: "Không tìm thấy địa chỉ hoặc bạn không có quyền truy cập."
      });
    }

  
    await UserAddress.update(
      { isDefault: false },
      { where: { userId, isDeleted: false } }
    );

    
    await address.update({ isDefault: true });

    res.json({ message: "Thiết lập địa chỉ mặc định thành công" });
  } catch (error) {
    console.error("Lỗi khi thiết lập mặc định:", error);
    res.status(500).json({ message: "Lỗi thiết lập mặc định", errorDetails: error.message });
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
      wardId,
      isDefault,
      label,
    } = req.body;

   
    if (isDefault) {
      await UserAddress.update(
        { isDefault: false },
        { where: { userId, isDeleted: false, id: { [Op.ne]: id } } }
      );
    }

    const [updatedRows] = await UserAddress.update(
      {
        fullName,
        phone,
        streetAddress,
        provinceId,
        districtId,
        wardId,
        isDefault,
        label,
      },
      {
        where: { id, userId, isDeleted: false }, 
      }
    );

    if (updatedRows === 0) {
      return res.status(404).json({
        message: "Không tìm thấy địa chỉ hoặc bạn không có quyền cập nhật.",
      });
    }

    res.json({ message: "Cập nhật địa chỉ thành công" });
  } catch (error) {
    console.error("Lỗi cập nhật địa chỉ:", error);
    if (error.parent?.sqlMessage) {
      console.error("SQL Error:", error.parent.sqlMessage);
    }
    res.status(500).json({
      message: "Lỗi cập nhật địa chỉ",
      errorDetails: error.message,
    });
  }
}


  static async remove(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

  
    const [updatedRows] = await UserAddress.update(
      { isDeleted: true },
      {
        where: {
          id,
          userId,
          isDeleted: false, 
        },
      }
    );

    if (updatedRows === 0) {
      return res
        .status(404)
        .json({ message: "Không tìm thấy địa chỉ hoặc đã bị xóa trước đó." });
    }

    res.json({ message: "Xóa địa chỉ thành công " });
  } catch (error) {
    console.error("Lỗi xóa địa chỉ:", error);
    res
      .status(500)
      .json({ message: "Lỗi xóa địa chỉ", errorDetails: error.message });
  }
}


  static async getDefault(req, res) {
  try {
    const userId = req.user.id;
    const { addressId } = req.query;
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
     
      address = await UserAddress.findOne({
        where: { id: addressId, userId, isDeleted: false },
        include: includeOptions,
      });
    } else {
  
      address = await UserAddress.findOne({
        where: { userId, isDefault: true, isDeleted: false },
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