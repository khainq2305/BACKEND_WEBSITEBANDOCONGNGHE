const {
  Order,
  OrderItem,
  sequelize,
  UserAddress,
  Province,
  District,
  Ward,
  Sku,
  PaymentMethod,
} = require("../../models");
const axios = require("axios");
const momoService = require('../../services/client/momoService');
class OrderController {
  static async getAvailableService(fromDistrict, toDistrict) {
    try {
      console.log(
        `[GHN Service] Requesting available services for from_district: ${fromDistrict}, to_district: ${toDistrict}`
      );
      const response = await axios.post(
        "https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/available-services",
        {
          shop_id: Number(process.env.GHN_SHOP_ID),
          from_district: Number(fromDistrict),
          to_district: Number(toDistrict),
        },
        {
          headers: {
            "Content-Type": "application/json",
            Token: process.env.GHN_TOKEN,
          },
        }
      );

      const service = response.data.data?.[0];
      if (!service) {
        throw new Error("Không có dịch vụ giao hàng khả dụng");
      }

      return service.service_type_id;
    } catch (error) {
      throw new Error("Không lấy được dịch vụ giao hàng");
    }
  }

  static async calculateFee({
    toDistrict,
    toWard,
    weight,
    length,
    width,
    height,
    serviceTypeId,
  }) {
    try {
      const response = await axios.post(
        "https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/fee",
        {
          from_district_id: 1450,
          to_district_id: Number(toDistrict),
          to_ward_code: toWard,
          service_type_id: serviceTypeId,
          weight,
          length,
          width,
          height,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Token: process.env.GHN_TOKEN,
            ShopId: process.env.GHN_SHOP_ID,
          },
        }
      );

      return response.data.data.total;
    } catch (error) {
      console.error("GHN Fee Error:", error?.response?.data || error.message);
      throw new Error("Không tính được phí vận chuyển");
    }
  }

  static async getShippingFee(req, res) {
    try {
      const { districtId, wardCode, items } = req.body;

      const districtIdNumber = Number(districtId);

      if (!districtIdNumber || !wardCode || !items || items.length === 0) {
        return res.status(400).json({ message: "Thiếu thông tin tính phí" });
      }

      const skuList = await Sku.findAll({
        where: { id: items.map((i) => i.skuId) },
      });
      const skuMap = {};
      skuList.forEach((s) => (skuMap[s.id] = s));

      let totalWeight = 0,
        maxLength = 0,
        maxWidth = 0,
        maxHeight = 0;
      for (const item of items) {
        const sku = skuMap[item.skuId];
        totalWeight += (sku.weight || 500) * item.quantity;
        maxLength = Math.max(maxLength, sku.length || 10);
        maxWidth = Math.max(maxWidth, sku.width || 10);
        maxHeight = Math.max(maxHeight, sku.height || 10);
      }

      const serviceTypeId = await OrderController.getAvailableService(
        1450,
        districtIdNumber
      );

      const shippingFee = await OrderController.calculateFee({
        toDistrict: districtIdNumber,
        toWard: wardCode,
        weight: totalWeight,
        length: maxLength,
        width: maxWidth,
        height: maxHeight,
        serviceTypeId,
      });

      return res.json({ shippingFee });
    } catch (err) {
      console.error("Fee error:", err);
      return res
        .status(500)
        .json({ message: "Không tính được phí vận chuyển" });
    }
  }

  static async createOrder(req, res) {
  const t = await sequelize.transaction();
  try {
    const user = req.user;
    const { addressId, items, note, paymentMethodId, cartItemIds = [] } = req.body;

    if (!addressId || !items || items.length === 0 || !paymentMethodId) {
      return res.status(400).json({ message: "Thiếu dữ liệu đơn hàng" });
    }

    const validPayment = await PaymentMethod.findByPk(paymentMethodId);
    if (!validPayment) {
      return res.status(400).json({ message: "Phương thức thanh toán không hợp lệ" });
    }

    const selectedAddress = await UserAddress.findOne({
      where: { id: addressId, userId: user.id },
      include: [
        { model: Province, as: "province" },
        { model: District, as: "district" },
        { model: Ward, as: "ward" },
      ],
    });

    if (!selectedAddress || !selectedAddress.id) {
      return res.status(400).json({ message: "Không tìm thấy địa chỉ giao hàng hợp lệ" });
    }

    if (!selectedAddress.district?.ghnCode || !selectedAddress.ward?.ghnCode) {
      return res.status(400).json({ message: "Thiếu mã GHN cho địa chỉ giao hàng" });
    }

    const skuList = await Sku.findAll({ where: { id: items.map(i => i.skuId) } });
    const skuMap = {};
    skuList.forEach(sku => (skuMap[sku.id] = sku));

    for (const item of items) {
      const sku = skuMap[item.skuId];
      if (!sku) {
        return res.status(400).json({ message: `Không tìm thấy SKU: ${item.skuId}` });
      }
      if (item.quantity > sku.stock) {
        return res.status(400).json({
          message: `Sản phẩm "${sku.skuCode}" không đủ hàng (hiện còn: ${sku.stock})`,
        });
      }
    }

    // Tính phí vận chuyển
    let totalWeight = 0, maxLength = 0, maxWidth = 0, maxHeight = 0;
    for (const item of items) {
      const sku = skuMap[item.skuId];
      totalWeight += (sku.weight || 500) * item.quantity;
      maxLength = Math.max(maxLength, sku.length || 10);
      maxWidth = Math.max(maxWidth, sku.width || 10);
      maxHeight = Math.max(maxHeight, sku.height || 10);
    }

    const serviceTypeId = await OrderController.getAvailableService(1450, selectedAddress.district.ghnCode);
    const shippingFee = await OrderController.calculateFee({
      toDistrict: selectedAddress.district.ghnCode,
      toWard: selectedAddress.ward.ghnCode,
      weight: totalWeight,
      length: maxLength,
      width: maxWidth,
      height: maxHeight,
      serviceTypeId,
    });

    const totalPrice = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

    const newOrder = await Order.create({
      userId: user.id,
      userAddressId: selectedAddress.id,
      totalPrice,
      finalPrice: totalPrice + shippingFee,
      shippingFee,
      paymentMethodId,
      isPaid: false,
      note,
      status: "pending",
    }, { transaction: t });

    for (const item of items) {
      await OrderItem.create({
        orderId: newOrder.id,
        skuId: item.skuId,
        quantity: item.quantity,
        price: item.price,
      }, { transaction: t });

      await skuMap[item.skuId].decrement("stock", {
        by: item.quantity,
        transaction: t,
      });
    }

    // ✅ XÓA CART ITEM ĐÃ MUA
    if (cartItemIds && cartItemIds.length > 0) {
      await CartItem.destroy({
        where: {
          id: cartItemIds,
          userId: user.id,
        },
        transaction: t,
      });
    }

    await t.commit();
    return res.status(201).json({ message: "Đặt hàng thành công", orderId: newOrder.id });
  } catch (error) {
    await t.rollback();
    console.error("Lỗi tạo đơn hàng:", error);
    return res.status(500).json({ message: "Lỗi khi tạo đơn hàng" });
  }
}
static async getById(req, res) {
  try {
    const orderId = req.params.id;
    const userId = req.user.id;

    const order = await Order.findOne({
      where: { id: orderId, userId },
      include: [
        {
          model: OrderItem,
          as: 'orderItems',
          include: {
            model: Sku,
            as: 'sku',
            attributes: ['skuCode', 'price', 'finalPrice'],
            include: ['product'],
          },
        },
        {
          model: UserAddress,
          as: 'userAddress',
          include: [
            { model: Province, as: 'province' },
            { model: District, as: 'district' },
            { model: Ward, as: 'ward' },
          ],
        },
        {
          model: PaymentMethod,
          as: 'paymentMethod',
          attributes: ['id', 'name'],
        },
      ],
    });

    if (!order) {
      return res.status(404).json({ message: "Không tìm thấy đơn hàng" });
    }

    const products = order.orderItems.map(item => ({
      id: item.id,
      skuId: item.skuId,
      name: item.sku?.product?.name || "Sản phẩm",
      image: item.sku?.product?.thumbnail || "/images/default.jpg",
      price: item.price,
      quantity: item.quantity,
    }));

    return res.json({
      message: "Lấy đơn hàng thành công",
      data: {
        id: order.id,
        status: order.status,
        totalPrice: order.totalPrice,
        discount: 0, // hoặc tính nếu có logic khuyến mãi
        shippingFee: order.shippingFee,
        finalPrice: order.finalPrice,
        paymentMethod: order.paymentMethod,
        products,
        userAddress: order.userAddress,
        createdAt: order.createdAt,
      },
    });
  } catch (error) {
    console.error("Lỗi khi lấy đơn hàng:", error);
    return res.status(500).json({ message: "Lỗi máy chủ khi lấy đơn hàng" });
  }
}

  static async momoPay(req, res) {
  try {
    const { orderId } = req.body;
    const order = await Order.findByPk(orderId);
    if (!order) return res.status(404).json({ message: "Không tìm thấy đơn hàng" });

const momoOrderId = `DH${orderId}-${Date.now()}`; // dùng thời gian để luôn khác nhau


    const momoRes = await momoService.createPaymentLink({
      orderId: momoOrderId,
      amount: order.finalPrice,
      orderInfo: `Thanh toán đơn hàng #${orderId}`,
    });

    if (momoRes.resultCode !== 0) {
      return res.status(400).json({ message: "Lỗi tạo thanh toán MoMo", momoRes });
    }

    // 👉 Optionally: Lưu momoOrderId vào DB nếu cần tracking
    order.momoOrderId = momoOrderId;
    await order.save();

    return res.json({ payUrl: momoRes.payUrl });
  } catch (error) {
    console.error("MoMo error:", error);
    return res.status(500).json({ message: "Lỗi khi tạo link thanh toán MoMo" });
  }
}


  static async momoCallback(req, res) {
    try {
      const { orderId, resultCode } = req.body;
      const order = await Order.findByPk(orderId);
      if (!order) return res.status(404).json({ message: "Không tìm thấy đơn hàng" });

      if (resultCode === 0) {
        order.isPaid = true;
        order.status = "confirmed";
      } else {
        order.status = "cancelled";
      }

      await order.save();
      return res.status(200).json({ message: "Callback xử lý thành công" });
    } catch (err) {
      console.error("Callback error:", err);
      return res.status(500).json({ message: "Lỗi xử lý callback" });
    }
  }
}

module.exports = OrderController;
