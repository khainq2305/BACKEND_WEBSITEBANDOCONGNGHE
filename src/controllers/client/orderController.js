const {
  Order,
  OrderItem,
  sequelize,
  UserAddress,
  Province,
  Product,
  District,
  Cart,
  CartItem, // ✅ THÊM DÒNG NÀY
  Ward,
  Sku,
  PaymentMethod,
} = require("../../models");
const axios = require("axios");
const momoService = require("../../services/client/momoService");
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

      const districtIdValue = /^\d+$/.test(districtId)
        ? Number(districtId)
        : districtId;

      if (!districtIdValue || !wardCode || !items || items.length === 0) {
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
        districtIdValue
      );

      const shippingFee = await OrderController.calculateFee({
        toDistrict: districtIdValue,
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
      const {
        addressId,
        items,
        note,
        paymentMethodId,
        cartItemIds = [],
      } = req.body;

      if (!addressId || !items || items.length === 0 || !paymentMethodId) {
        return res.status(400).json({ message: "Thiếu dữ liệu đơn hàng" });
      }

      const validPayment = await PaymentMethod.findByPk(paymentMethodId);
      if (!validPayment) {
        return res
          .status(400)
          .json({ message: "Phương thức thanh toán không hợp lệ" });
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
        return res
          .status(400)
          .json({ message: "Không tìm thấy địa chỉ giao hàng hợp lệ" });
      }

      if (
        !selectedAddress.district?.ghnCode ||
        !selectedAddress.ward?.ghnCode
      ) {
        return res
          .status(400)
          .json({ message: "Thiếu mã GHN cho địa chỉ giao hàng" });
      }

      const skuList = await Sku.findAll({
        where: { id: items.map((i) => i.skuId) },
      });
      const skuMap = {};
      skuList.forEach((sku) => (skuMap[sku.id] = sku));

      for (const item of items) {
        const sku = skuMap[item.skuId];
        if (!sku) {
          return res
            .status(400)
            .json({ message: `Không tìm thấy SKU: ${item.skuId}` });
        }
        if (item.quantity > sku.stock) {
          return res.status(400).json({
            message: `Sản phẩm "${sku.skuCode}" không đủ hàng (hiện còn: ${sku.stock})`,
          });
        }
      }

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
        selectedAddress.district.ghnCode
      );
      const shippingFee = await OrderController.calculateFee({
        toDistrict: selectedAddress.district.ghnCode,
        toWard: selectedAddress.ward.code,
        weight: totalWeight,
        length: maxLength,
        width: maxWidth,
        height: maxHeight,
        serviceTypeId,
      });

      const totalPrice = items.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
      );

      // ✅ tạo trước đơn hàng (chưa có orderCode)
      const newOrder = await Order.create(
        {
          userId: user.id,
          userAddressId: selectedAddress.id,
          totalPrice,
          finalPrice: totalPrice + shippingFee,
          shippingFee,
          paymentMethodId,
          isPaid: false,
          note,
          status: "pending",
          orderCode: "temp", // gán tạm để tránh lỗi not null
        },
        { transaction: t }
      );

      // ✅ sau khi có ID, tạo mã orderCode chuẩn
      const today = new Date();
      const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");
      newOrder.orderCode = `DH${dateStr}-${String(newOrder.id).padStart(
        5,
        "0"
      )}`;
      await newOrder.save({ transaction: t });

      for (const item of items) {
        await OrderItem.create(
          {
            orderId: newOrder.id,
            skuId: item.skuId,
            quantity: item.quantity,
            price: item.price,
          },
          { transaction: t }
        );

        await skuMap[item.skuId].decrement("stock", {
          by: item.quantity,
          transaction: t,
        });
      }

      const cart = await Cart.findOne({ where: { userId: user.id } });
      if (!cart)
        return res
          .status(400)
          .json({ message: "Không tìm thấy giỏ hàng người dùng" });

      await CartItem.destroy({
        where: {
          id: cartItemIds,
          cartId: cart.id,
        },
        transaction: t,
      });

      await t.commit();
      return res.status(201).json({
        message: "Đặt hàng thành công",
        orderId: newOrder.id,
        orderCode: newOrder.orderCode, // ✅ trả thêm mã đơn
      });
    } catch (error) {
      await t.rollback();
      console.error("Lỗi tạo đơn hàng:", error);
      return res.status(500).json({ message: "Lỗi khi tạo đơn hàng" });
    }
  }

  static async getById(req, res) {
    try {
      const user = req.user;
      const orderCode = req.params.code;

      const order = await Order.findOne({
        where: { orderCode, userId: user.id },
        include: [
          {
            model: OrderItem,
            as: "items",
            include: {
              model: Sku,
              as: "Sku",
              include: [
                {
                  model: Product,
                  as: "product",

                  attributes: ["name", "thumbnail"],
                },
              ],
            },
          },
          {
            model: UserAddress,
            as: "shippingAddress",
            include: [
              { model: Province, as: "province" },
              { model: District, as: "district" },
              { model: Ward, as: "ward" },
            ],
          },
          {
            model: PaymentMethod,
            as: "paymentMethod",
          },
        ],
      });

      if (!order) {
        console.warn(
          `Không tìm thấy đơn hàng với mã: ${orderCode} và userId: ${user.id}`
        );
        return res.status(404).json({ message: "Không tìm thấy đơn hàng" });
      }

      const address = order.shippingAddress;
      const fullAddress = `${address?.streetAddress || ""}, ${
        address?.ward?.name || ""
      }, ${address?.district?.name || ""}, ${
        address?.province?.name || ""
      }`.trim();

      const products = order.items.map((item) => ({
        skuId: item.skuId,
        name: item.Sku?.product?.name || "Sản phẩm không tồn tại",
        image: item.Sku?.product?.thumbnail || "/images/default.jpg",
        quantity: item.quantity,
        price: item.price,
        total: item.price * item.quantity,
      }));

      const result = {
        id: order.id,
        orderCode: order.orderCode,
        status: order.status,
        totalPrice: order.totalPrice,
        finalPrice: order.finalPrice,
        shippingFee: order.shippingFee,
        isPaid: order.isPaid,
        note: order.note,
        cancelReason: order.cancelReason,
        paymentMethod: order.paymentMethod
          ? {
              id: order.paymentMethod.id,
              name: order.paymentMethod.name,
            }
          : null,

        userAddress: {
          fullAddress,
          fullName: address?.fullName,
          phone: address?.phone,
        },
        createdAt: order.createdAt,
        products,
      };

      return res.json({ message: "Lấy đơn hàng thành công", data: result });
    } catch (error) {
      console.error("Lỗi khi lấy chi tiết đơn hàng:", error);
      return res.status(500).json({ message: "Lỗi máy chủ khi lấy đơn hàng" });
    }
  }

  static async momoPay(req, res) {
    try {
      const { orderId } = req.body;
      const order = await Order.findByPk(orderId);

      if (!order)
        return res.status(404).json({ message: "Không tìm thấy đơn hàng" });

      // ✅ Dùng orderCode nếu có
      const momoOrderId = `${order.orderCode || `DH${orderId}`}-${Date.now()}`;

      const momoRes = await momoService.createPaymentLink({
        orderId: momoOrderId,
        amount: order.finalPrice,
        orderInfo: `Thanh toán đơn hàng ${order.orderCode || `#${orderId}`}`,
      });

      if (momoRes.resultCode !== 0) {
        return res
          .status(400)
          .json({ message: "Lỗi tạo thanh toán MoMo", momoRes });
      }

      order.momoOrderId = momoOrderId;
      await order.save();

      return res.json({ payUrl: momoRes.payUrl });
    } catch (error) {
      console.error("MoMo error:", error);
      return res
        .status(500)
        .json({ message: "Lỗi khi tạo link thanh toán MoMo" });
    }
  }

  static async momoCallback(req, res) {
    try {
      const { orderId, resultCode } = req.body;
      const order = await Order.findByPk(orderId);
      if (!order)
        return res.status(404).json({ message: "Không tìm thấy đơn hàng" });

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
  static async getAllByUser(req, res) {
    try {
      const userId = req.user.id;

      const ordersFromDb = await Order.findAll({
        where: { userId },
        include: [
          {
            model: OrderItem,
            as: "items",
            include: [
              {
                model: Sku,
                required: false,
                include: [
                  {
                    model: Product,
                    as: "product",
                    required: false,
                    paranoid: false,
                  },
                ],
              },
            ],
          },
        ],
        order: [["createdAt", "DESC"]],
      });

      if (!ordersFromDb) {
        return res.json({ message: "Không có đơn hàng nào", data: [] });
      }

      const formattedOrders = ordersFromDb.map((order) => ({
        id: order.id,
        status: order.status,
        finalPrice: order.finalPrice,
        products: order.items.map((item) => {
          const productInfo = item.Sku?.product;
          const skuInfo = item.Sku;

          const pricePaid = item.price;
          const originalPriceFromSku = skuInfo?.originalPrice || 0;

          return {
            skuId: item.skuId,
            name: productInfo?.name || "Sản phẩm không tồn tại",
            imageUrl: productInfo?.thumbnail || "/images/default.jpg",
            quantity: item.quantity,
            price: pricePaid,
            originalPrice:
              originalPriceFromSku > pricePaid ? originalPriceFromSku : null,
            variation: skuInfo?.skuCode || "",
          };
        }),
      }));
      console.log("==== DEBUG ITEM SKU ====");
      console.dir(ordersFromDb[0].items[0].sku, { depth: 5 });
      console.log("==== DEBUG PRODUCT ====");
      console.dir(ordersFromDb[0].items[0].sku?.product, { depth: 5 });

      return res.json({
        message: "Lấy danh sách đơn hàng thành công",
        data: formattedOrders,
      });
    } catch (error) {
      console.error("Lỗi khi lấy danh sách đơn hàng:", error);
      return res.status(500).json({ message: "Lỗi máy chủ khi lấy đơn hàng" });
    }
  }
  static async cancel(req, res) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const order = await Order.findOne({ where: { id, userId: req.user.id } });
      if (!order) {
        return res.status(404).json({ message: "Không tìm thấy đơn hàng" });
      }

      if (order.status !== "pending" && order.status !== "confirmed") {
        console.warn("Trạng thái đơn hàng không cho phép hủy:", order.status);
        return res
          .status(400)
          .json({ message: "Không thể hủy đơn hàng ở trạng thái này" });
      }

      order.status = "cancelled";
      order.cancelReason = reason || "Người dùng không cung cấp lý do";
      await order.save();

      return res.json({ message: "Đã hủy đơn hàng thành công" });
    } catch (err) {
      console.error("Cancel order error:", err);
      return res.status(500).json({ message: "Hủy đơn thất bại" });
    }
  }
  static async generate(req, res) {
    try {
      const { accountNumber, accountName, bankCode, amount, message } =
        req.body;

      if (!accountNumber || !accountName || !bankCode || !amount || !message) {
        return res.status(400).json({ message: "Thiếu thông tin cần thiết." });
      }

      const vietqrUrl = `https://img.vietqr.io/image/${bankCode}-${accountNumber}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(
        message
      )}&accountName=${encodeURIComponent(accountName)}`;

      return res.json({ qrImage: vietqrUrl });
    } catch (error) {
      console.error("Lỗi khi sinh QR VietQR:", error);
      res.status(500).json({ message: "Không thể tạo VietQR." });
    }
  }
}

module.exports = OrderController;
