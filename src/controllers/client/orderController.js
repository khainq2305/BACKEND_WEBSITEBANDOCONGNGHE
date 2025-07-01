const {
  Order,
  OrderItem,
  sequelize,
  UserAddress,
  Province,
  Product,
  Coupon,
  ReturnRequest,
  FlashSale,
  FlashSaleItem,
  District,
  Cart,
  CartItem,
  Ward,
  Notification,
  NotificationUser,
  Sku,
  PaymentMethod,
} = require("../../models");
const axios = require("axios");
const momoService = require("../../services/client/momoService");
const zaloPayService = require("../../services/client/zalopayService");
const vnpayService = require("../../services/client/vnpayService");
const viettelMoneyService = require("../../services/client/viettelMoneyService");
const { Op } = require('sequelize');

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
        couponCode,
        paymentMethodId,
        cartItemIds = [],
      } = req.body;

      let couponRecord = null;
      let couponDiscount = 0;
      let shippingDiscount = 0; // --- ADD

      const now = new Date();

      // ✅ Kiểm tra coupon
      if (couponCode) {
        const { Op } = require("sequelize");
        couponRecord = await Coupon.findOne({
          where: {
            code: couponCode.trim(),
            isActive: true,
            startTime: { [Op.lte]: now },
            endTime: { [Op.gte]: now },
          },
          paranoid: false,
        });

        if (!couponRecord) {
          return res
            .status(400)
            .json({ message: "Coupon không hợp lệ hoặc đã hết hiệu lực" });
        }

        if (couponRecord.totalQuantity !== null) {
          const usedCount = await Order.count({
            where: {
              couponId: couponRecord.id,
              status: { [Op.notIn]: ["cancelled", "failed"] },
            },
          });
          if (usedCount >= couponRecord.totalQuantity) {
            return res
              .status(400)
              .json({ message: "Coupon đã hết lượt sử dụng" });
          }
        }
      }

      // ✅ Validate đầu vào
      if (!addressId || !items?.length || !paymentMethodId) {
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

      if (
        !selectedAddress ||
        !selectedAddress.district?.ghnCode ||
        !selectedAddress.ward?.ghnCode
      ) {
        return res
          .status(400)
          .json({ message: "Địa chỉ không hợp lệ hoặc thiếu mã GHN" });
      }

      // ✅ Lấy danh sách SKU kèm Flash Sale nếu có
      const { Op } = require("sequelize");
      const skuList = await Sku.findAll({
        where: { id: items.map((i) => i.skuId) },
        include: [
          {
            model: FlashSaleItem,
            as: "flashSaleSkus", // ✅ alias CHUẨN
            required: false,
            include: [
              {
                model: FlashSale,
                as: "flashSale", // ✅ alias CHUẨN
                required: true,
                where: {
                  isActive: true,
                  startTime: { [Op.lte]: now },
                  endTime: { [Op.gte]: now },
                },
              },
            ],
          },
        ],
      });

      const skuMap = Object.fromEntries(skuList.map((s) => [s.id, s]));
      for (const item of items) {
        const sku = skuMap[item.skuId];
        if (!sku)
          return res
            .status(400)
            .json({ message: `Không tìm thấy SKU ${item.skuId}` });
        if (item.quantity > sku.stock) {
          return res
            .status(400)
            .json({ message: `SKU "${sku.skuCode}" chỉ còn ${sku.stock}` });
        }
      }

      const totalPrice = items.reduce(
        (sum, i) => sum + i.price * i.quantity,
        0
      );

      if (couponRecord) {
        if (couponRecord.discountType === "shipping") {
          shippingDiscount = Number(couponRecord.discountValue);
        } else {
          couponDiscount =
            couponRecord.discountType === "percent"
              ? Math.floor((totalPrice * couponRecord.discountValue) / 100)
              : Number(couponRecord.discountValue);

          if (
            couponRecord.maxDiscountValue &&
            couponDiscount > couponRecord.maxDiscountValue
          ) {
            couponDiscount = couponRecord.maxDiscountValue;
          }
        }
      }

      let shippingFee = 0;
      {
        let totalWeight = 0,
          maxL = 0,
          maxW = 0,
          maxH = 0;
        for (const item of items) {
          const sku = skuMap[item.skuId];
          totalWeight += (sku.weight || 500) * item.quantity;
          maxL = Math.max(maxL, sku.length || 10);
          maxW = Math.max(maxW, sku.width || 10);
          maxH = Math.max(maxH, sku.height || 10);
        }
        const serviceTypeId = await OrderController.getAvailableService(
          1450,
          selectedAddress.district.ghnCode
        );
        shippingFee = await OrderController.calculateFee({
          toDistrict: selectedAddress.district.ghnCode,
          toWard: selectedAddress.ward.code,
          weight: totalWeight,
          length: maxL,
          width: maxW,
          height: maxH,
          serviceTypeId,
        });
      }
      shippingDiscount = Math.min(shippingDiscount, shippingFee);
      const finalPrice =
        totalPrice - // giá hàng
        couponDiscount + // giảm trên hàng
        shippingFee - // phí ship gốc
        Math.min(shippingFee, shippingDiscount); // giảm phí ship

  const paymentStatus = ["momo", "vnpay", "zalopay", "viettel_money"].includes(
  validPayment.code.toLowerCase()
)
  ? "waiting"
  : "unpaid";

      
      // ✅ Tạo đơn hàng
      const newOrder = await Order.create(
        {
          userId: user.id,
          userAddressId: selectedAddress.id,
          couponId: couponRecord?.id || null,
          totalPrice,
          finalPrice,
          shippingFee,
          couponDiscount,
          shippingDiscount, // --- ADD

          paymentMethodId,
          note,
          status: "processing",

      
          paymentStatus,
          orderCode: "temp",
        },
        { transaction: t }
      );

      newOrder.orderCode = `DH${new Date()
        .toISOString()
        .slice(0, 10)
        .replace(/-/g, "")}-${String(newOrder.id).padStart(5, "0")}`;
      await newOrder.save({ transaction: t });

      // ✅ Thêm order item + trừ tồn kho
      for (const item of items) {
        const sku = skuMap[item.skuId];
        const flashSaleItem = sku.flashSaleSkus?.[0]; // alias CHUẨN

        item.flashSaleItemId = flashSaleItem?.id || null;
        item.flashSaleId = flashSaleItem?.flashSaleId || null; // ✅ dùng trực tiếp ID

        console.log("📌 FLASH SALE ITEM ID:", item.flashSaleItemId);
        console.log("📌 FLASH SALE ID:", item.flashSaleId);

        await OrderItem.create(
          {
            orderId: newOrder.id,
            skuId: item.skuId,
            quantity: item.quantity,
            price: item.price,
            flashSaleId: item.flashSaleItemId, // ✅ Tham chiếu đúng sang bảng flashsaleitems
          },
          { transaction: t }
        );

        await sku.decrement("stock", {
          by: item.quantity,
          transaction: t,
        });

        if (item.flashSaleItemId) {
          const fsItem = await FlashSaleItem.findByPk(item.flashSaleItemId, {
            transaction: t,
          });
          if (fsItem) {
            console.log("✅ Trừ số lượng FlashSaleItem:", fsItem.id);
            await fsItem.decrement("quantity", {
              by: item.quantity,
              transaction: t,
            });
          } else {
            console.warn("⚠️ Không tìm thấy FlashSaleItem để trừ số lượng.");
          }
        }
      }

      if (couponRecord && couponRecord.totalQuantity !== null) {
        await couponRecord.decrement("totalQuantity", {
          by: 1,
          transaction: t,
        });
      }

      const cart = await Cart.findOne({ where: { userId: user.id } });
      if (cart) {
        await CartItem.destroy({
          where: { id: cartItemIds, cartId: cart.id },
          transaction: t,
        });
      }

      const title =
        paymentStatus === "paid"
          ? "Đặt hàng thành công"
          : "Đơn hàng đã tạo – chờ thanh toán";

      const message =
        paymentStatus === "paid"
          ? `Đơn ${newOrder.orderCode} đã được đặt thành công.`
          : `Đơn ${newOrder.orderCode} đã được tạo. Vui lòng thanh toán trong 15 phút để tránh hủy đơn tự động.`;

      const notification = await Notification.create(
        {
          title,
          message,
          slug: `order-${newOrder.orderCode}`,
          type: "order",
          referenceId: newOrder.id,
        },
        { transaction: t }
      );

      // ghi vào bảng NotificationUser
      await NotificationUser.create(
        {
          notificationId: notification.id, // <- dùng biến mới
          userId: user.id,
        },
        { transaction: t }
      );

      await t.commit();
      return res.status(201).json({
        message: "Đặt hàng thành công",
        orderId: newOrder.id,
        orderCode: newOrder.orderCode,
        couponDiscount,
        shippingDiscount, // --- ADD
      });
    } catch (error) {
      await t.rollback();
      console.error("❌ Lỗi tạo đơn hàng:", error);
      return res.status(500).json({ message: "Lỗi khi tạo đơn hàng" });
    }
  }
  static async momoPay(req, res) {
    try {
      const { orderId } = req.body;
      const order = await Order.findByPk(orderId);

      if (!order)
        return res.status(404).json({ message: "Không tìm thấy đơn hàng" });

      // ✅ Gửi orderCode cho MoMo (sẽ nhận lại trong callback)
      const momoOrderId = order.orderCode;

      const momoRes = await momoService.createPaymentLink({
        orderId: momoOrderId, // ✅ gửi orderCode
        amount: order.finalPrice,
        orderInfo: `Thanh toán đơn hàng ${order.orderCode}`,
      });

      if (momoRes.resultCode !== 0) {
        return res.status(400).json({
          message: "Lỗi tạo thanh toán MoMo",
          momoRes,
        });
      }

      // ✅ Lưu orderCode vào cột riêng nếu cần kiểm tra
      order.momoOrderId = momoOrderId;
      order.paymentStatus = "waiting";
      await order.save();

      return res.json({ payUrl: momoRes.payUrl });
    } catch (error) {
      console.error("MoMo error:", error);
      return res
        .status(500)
        .json({ message: "Lỗi khi tạo link thanh toán MoMo" });
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
  static async getById(req, res) {
    try {
      const user = req.user;
   
const orderCode = req.params.code?.trim(); // 🟢 thêm dòng này

      const order = await Order.findOne({
          where: {
    userId: user.id,

[Op.or]: [
  { orderCode: orderCode },
  { momoOrderId: orderCode } // 🟢 thay code bằng orderCode
]

  },
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
        shippingDiscount: order.shippingDiscount, // 👈 thêm
        productDiscount: order.productDiscount || 0, // ✅ thêm
        totalPrice: order.totalPrice,
        finalPrice: order.finalPrice,
        shippingFee: order.shippingFee,
        note: order.note,
        cancelReason: order.cancelReason,
        couponDiscount: order.couponDiscount,
        paymentStatus: order.paymentStatus, // ✅ thêm dòng này
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

  static async zaloPay(req, res) {
    try {
      const { orderId } = req.body;
      const order = await Order.findByPk(orderId);
      if (!order)
        return res.status(404).json({ message: "Không tìm thấy đơn hàng" });

      const zaloRes = await zaloPayService.createPaymentLink({
        orderId: order.orderCode,
        amount: order.finalPrice,
        orderInfo: order.orderCode,
      });

      console.log("🧾 ZaloPay response:", zaloRes); // ✅ thêm dòng này để xem lỗi chi tiết

      if (zaloRes.return_code !== 1) {
        return res
          .status(400)
          .json({ message: "Lỗi tạo thanh toán ZaloPay", zaloRes });
      }

      // Optionally: lưu zaloOrderId nếu cần
      // order.zaloOrderId = zaloRes.app_trans_id;
      // await order.save();

      return res.json({ payUrl: zaloRes.order_url });
    } catch (err) {
      console.error("ZaloPay error:", err);
      return res
        .status(500)
        .json({ message: "Lỗi server khi tạo thanh toán ZaloPay" });
    }
  }
  static async vnpay(req, res) {
    try {
      const { orderId } = req.body;
      const { bankCode } = req.body;
      const order = await Order.findByPk(orderId);
      if (!order)
        return res.status(404).json({ message: "Không tìm thấy đơn hàng" });

      const payUrl = vnpayService.createPaymentLink({
        orderId: order.orderCode,
        amount: order.finalPrice,
        orderInfo: order.orderCode,
        bankCode, // ✅ TRUYỀN THẰNG NÀY
      });

      return res.json({ payUrl });
    } catch (err) {
      console.error("VNPay error:", err);
      return res
        .status(500)
        .json({ message: "Lỗi server khi tạo thanh toán VNPay" });
    }
  }
// trong OrderController
static async vnpayCallback(req, res) {
  try {
    const raw = req.body.rawQuery;

    // Nếu gọi từ frontend sẽ có 'rawQuery' trong body
    const isFromFrontend = Boolean(raw);

    const qs = raw
      ? require('querystring').parse(raw, null, null, {
          decodeURIComponent: v => v // KHÔNG decode 2 lần
        })
      : req.query;

    const orderCode   = qs.vnp_TxnRef;
    const rspCode     = qs.vnp_ResponseCode;
    const secureHash  = qs.vnp_SecureHash;

    console.log('[VNPay CALLBACK] orderCode:', orderCode);
    console.log('[VNPay CALLBACK] Response Code:', rspCode);

    // 1. Kiểm tra chữ ký
    const isValid = vnpayService.verifySignature(qs, secureHash);
    if (!isValid) return res.status(400).end('INVALID_CHECKSUM');

    // 2. Tìm đơn hàng
    const order = await Order.findOne({ where: { orderCode } });
    if (!order) return res.status(404).end('ORDER_NOT_FOUND');

    // 3. Cập nhật trạng thái thanh toán
    order.paymentStatus = rspCode === '00' ? 'paid' : 'failed';
    await order.save();

    // 4. Nếu gọi từ frontend (fetch) → chỉ trả "OK"
    if (isFromFrontend) return res.end('OK');

    // 5. Nếu trình duyệt redirect từ VNPay → điều hướng đến trang xác nhận
    const redirect = `${process.env.BASE_URL}/order-confirmation?orderCode=${orderCode}`;
    return res.redirect(redirect);
  } catch (err) {
    console.error('[vnpayCallback]', err);
    return res.status(500).end('ERROR');
  }
}



  static async momoCallback(req, res) {
  try {
    
    const data = Object.keys(req.body).length ? req.body : req.query;
    const { orderId, resultCode } = data;          // orderId ≡ momoOrderId
console.log('[MoMo CALLBACK]', JSON.stringify(data, null, 2));

    if (!orderId) return res.end('MISSING_ORDER_ID');

    // ưu tiên tra theo momoOrderId, fallback về orderCode
    let order = await Order.findOne({ where: { momoOrderId: orderId } });
    if (!order) {
      // trường hợp thanh toán lần đầu (orderId = orderCode)
      order = await Order.findOne({ where: { orderCode: orderId } });
    }
    if (!order) return res.end('ORDER_NOT_FOUND');

    order.paymentStatus = Number(resultCode) === 0 ? 'paid' : 'failed';
    await order.save();
    return res.end('OK');
  } catch (err) {
    console.error('[momoCallback]', err);
    return res.status(500).end('ERROR');
  }
}


  // controller
// controllers/client/orderController.js
// ...

static async payAgain(req, res) {
  try {
    const { id } = req.params;
    const order  = await Order.findByPk(id, {
      include: {               // ⭐ cần include để lấy code
        model      : PaymentMethod,
        as         : 'paymentMethod',
        attributes : ['code'],
      },
    });

    // 1. kiểm tra hợp lệ
    if (
      !order ||
      order.paymentStatus !== 'waiting' ||
      order.status !== 'processing'
    ) {
      return res
        .status(400)
        .json({ message: 'Đơn không hợp lệ để thanh toán lại' });
    }

    // 2. xác định cổng
    const gateway = order.paymentMethod.code.toLowerCase();

    let payUrl = null;

    switch (gateway) {
      case 'momo': {
        const momoOrderId = `${order.orderCode}-${Date.now()}`;
        const momoRes = await momoService.createPaymentLink({
          orderId  : momoOrderId,
          amount   : order.finalPrice,
          orderInfo: `Thanh toán lại đơn ${order.orderCode}`,
        });

        if (momoRes.resultCode !== 0)
          return res.status(400).json({ message: 'MoMo lỗi', momoRes });

        order.momoOrderId  = momoOrderId;
        payUrl             = momoRes.payUrl;
        break;
      }

      case 'vnpay': {
        /* frontend nên truyền bankCode (hoặc mặc định: '' = chọn trong cổng) */
        const { bankCode = '' } = req.body;
        payUrl = vnpayService.createPaymentLink({
          orderId  : order.orderCode,
          amount   : order.finalPrice,
          orderInfo: `Thanh toán lại đơn ${order.orderCode}`,
          bankCode,
        });
        break;
      }

      case 'zalopay': {
        const zaloRes = await zaloPayService.createPaymentLink({
          orderId  : order.orderCode,
          amount   : order.finalPrice,
          orderInfo: order.orderCode,
        });
        if (zaloRes.return_code !== 1)
          return res.status(400).json({ message: 'ZaloPay lỗi', zaloRes });

        payUrl = zaloRes.order_url;
        break;
      }

      case 'viettel_money': {
        payUrl = viettelMoneyService.createPaymentLink({
          orderId  : order.orderCode,
          billCode : `VT-${order.orderCode}-${Date.now()}`,
          amount   : order.finalPrice,
          orderInfo: `Thanh toán lại đơn ${order.orderCode}`,
        });
        break;
      }

      default:
        return res
          .status(400)
          .json({ message: 'Phương thức thanh toán không hỗ trợ pay-again' });
    }

    await order.save();
    return res.json({ payUrl });
  } catch (err) {
    console.error('[payAgain]', err);
    return res.status(500).json({ message: 'Không tạo được link thanh toán lại' });
  }
}

  // ... (trong OrderController.js)

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
                {
                    model: ReturnRequest,
                    as: "returnRequest",
                    required: false,
                },
                {
                    model: PaymentMethod,
                    as: "paymentMethod",
                    attributes: ["id", "name", "code"],
                    required: true,
                },
                // THÊM INCLUDE ĐỊA CHỈ GIAO HÀNG VÀO ĐÂY
                {
                    model: UserAddress,
                    as: "shippingAddress", // Đảm bảo alias này khớp với model Order
                    include: [
                        { model: Province, as: "province" },
                        { model: District, as: "district" },
                        { model: Ward, as: "ward" },
                    ],
                    required: false, // Để vẫn lấy được order nếu không có địa chỉ (trường hợp hiếm)
                },
                // THÊM INCLUDE SHIPPING METHOD (Nếu có model riêng cho nó)
                // {
                //     model: ShippingMethod, // Giả định bạn có model ShippingMethod
                //     as: "shippingMethod", // Đảm bảo alias này khớp với model Order
                //     attributes: ["id", "name", "code"],
                //     required: false,
                // },
            ],
            order: [["createdAt", "DESC"]],
        });

        if (!ordersFromDb) {
            return res.json({ message: "Không có đơn hàng nào", data: [] });
        }

        const formattedOrders = ordersFromDb.map((order) => ({
            id: order.id,
            status: order.status,
            paymentStatus: order.paymentStatus,
            finalPrice: order.finalPrice,
            orderCode: order.orderCode,
            returnRequest: order.returnRequest
                ? {
                    id: order.returnRequest.id,
                    status: order.returnRequest.status,
                }
                : null,
            paymentMethod: order.paymentMethod
                ? {
                    id: order.paymentMethod.id,
                    name: order.paymentMethod.name,
                    code: order.paymentMethod.code,
                }
                : null,
            // MAP THÊM THÔNG TIN SHIPPING ADDRESS VÀ SHIPPING METHOD
            shippingAddress: order.shippingAddress ? {
                fullName: order.shippingAddress.fullName,
                phone: order.shippingAddress.phone,
                streetAddress: order.shippingAddress.streetAddress,
                ward: {
                    name: order.shippingAddress.ward?.name,
                    code: order.shippingAddress.ward?.code
                },
                district: {
                    name: order.shippingAddress.district?.name,
                    ghnCode: order.shippingAddress.district?.ghnCode
                },
                province: {
                    name: order.shippingAddress.province?.name
                }
            } : null,
            // shippingMethod: order.shippingMethod ? { // Nếu bạn có model ShippingMethod
            //     name: order.shippingMethod.name,
            //     code: order.shippingMethod.code
            // } : null,
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
  const t = await sequelize.transaction();
  try {
    const { id }     = req.params;
    const { reason } = req.body || {};
    const userId     = req.user.id;

    if (!reason?.trim())
      return res.status(400).json({ message: 'Lý do huỷ đơn không được bỏ trống' });

    /* 1. Khoá & lấy đơn */
    const order = await Order.findOne({
      where: { id, userId },
      include: [{ model: OrderItem, as: 'items' }],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!order)
      return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });

    const invalid = ['shipping','delivered','completed','cancelled'];
    if (invalid.includes(order.status))
      return res.status(400).json({
        message: `Đơn đã ở trạng thái "${order.status.toUpperCase()}", không thể huỷ`,
      });

    /* 2. Cập nhật trạng thái đơn */
    order.status        = 'cancelled';
    order.paymentStatus = 'unpaid';
    order.cancelReason  = reason.trim();
    await order.save({ transaction: t });

    /* 3. Hoàn kho SKU + Flash Sale */
    for (const it of order.items) {
      await Sku.increment('stock', {
        by: it.quantity,
        where: { id: it.skuId },
        transaction: t,
      });

      if (it.flashSaleId) {
        await FlashSaleItem.increment('quantity', {
          by: it.quantity,
          where: { id: it.flashSaleId },
          transaction: t,
        });
      }
    }

    /* 4. Trả lượt dùng coupon (nếu có) */
    if (order.couponId) {
      await Coupon.increment('totalQuantity', {
        by: 1,
        where: { id: order.couponId },
        transaction: t,
      });
    }

    /* 5. (Tùy chọn) Xử lý hoàn tiền online */
    if (order.paymentStatus === 'paid') {
      // TODO: gọi service refund hoặc đánh dấu pending_refund
    }

    /* 6. Gửi notification */
    const baseSlug = `order-${order.orderCode}`;
    let slug = baseSlug, suffix = 1;
    while (await Notification.findOne({ where: { slug }, transaction: t })) {
      slug = `${baseSlug}-${suffix++}`;
    }

    const noti = await Notification.create({
      title: 'Đơn hàng đã huỷ',
      message: `Đơn ${order.orderCode} đã được huỷ – ${reason.trim()}.`,
      slug,
      type: 'order',
      referenceId: order.id,
    }, { transaction: t });

    await NotificationUser.create(
      { notificationId: noti.id, userId },
      { transaction: t },
    );

    await t.commit();
    return res.json({ message: 'Đã huỷ đơn và cộng lại tồn kho', orderId: order.id });
  } catch (err) {
    await t.rollback();
    console.error('[cancel]', err);
    return res.status(500).json({ message: 'Hủy đơn thất bại' });
  }
}



  static async lookupOrder(req, res) {
    try {
      const { code, phone } = req.query;

      if (!code || !phone) {
        return res
          .status(400)
          .json({ message: "Thiếu mã đơn hoặc số điện thoại" });
      }

      const order = await Order.findOne({
        where: {
          orderCode: code,
        },
        include: [
          {
            model: UserAddress,
            as: "shippingAddress",
            where: { phone },
            required: true,
          },
          {
            model: OrderItem,
            as: "items",
            include: [
              {
                model: Sku,
                include: [
                  {
                    model: Product,
                    as: "product",
                  },
                ],
              },
            ],
          },
        ],
      });

      if (!order)
        return res.status(404).json({ message: "Không tìm thấy đơn hàng" });

      res.status(200).json(order);
    } catch (err) {
      console.error("[lookupOrder]", err);
      res.status(500).json({ message: "Lỗi server", error: err.message });
    }
  }

  static async requestReturn(req, res) {
    try {
      console.log("🧾 [requestReturn] req.body:", req.body);
      console.log("🧾 [requestReturn] req.files:", req.files);

      const { orderId, reason } = req.body;
      const userId = req.user.id;

      const parsedOrderId = Number(orderId);
      if (isNaN(parsedOrderId)) {
        return res.status(400).json({ message: "orderId không hợp lệ" });
      }

      const order = await Order.findOne({
        where: { id: parsedOrderId, userId },
      });

      if (!order) {
        return res.status(404).json({ message: "Không tìm thấy đơn hàng" });
      }

      if (!["completed", "delivered"].includes(order.status)) {
        return res.status(400).json({
          message: "Chỉ có thể trả hàng với đơn đã giao hoặc đã hoàn thành",
        });
      }

      const existing = await ReturnRequest.findOne({
        where: { orderId: parsedOrderId },
      });

      if (existing) {
        return res
          .status(400)
          .json({ message: "Đơn hàng đã có yêu cầu trả hàng trước đó" });
      }

      const imageFiles = req.files?.images || [];
      const videoFiles = req.files?.videos || [];

      const imageUrls = imageFiles.map((f) => f.path).join(",") || null;
      const videoUrls = videoFiles.map((f) => f.path).join(",") || null;

      const returnReq = await ReturnRequest.create({
        orderId: parsedOrderId,
        reason,
        evidenceImages: imageUrls,
        evidenceVideos: videoUrls,
        status: "pending",
      });

      return res.status(201).json({
        message: "Đã gửi yêu cầu trả hàng thành công",
        data: returnReq,
      });
    } catch (err) {
      console.error("Lỗi gửi yêu cầu trả hàng:", err);
      return res.status(500).json({
        message: "Lỗi server khi gửi yêu cầu trả hàng",
      });
    }
  }

 // controllers/client/orderController.js
static async chooseReturnMethod(req, res) {
  try {
    const { id } = req.params;
    const { returnMethod, trackingCode } = req.body;
    const userId = req.user.id;

    /* ------------------------------------------------------------------
     * 1. Tìm yêu cầu trả hàng kèm đơn, đảm bảo thuộc về user hiện tại
     * ---------------------------------------------------------------- */
    const returnRequest = await ReturnRequest.findOne({
      where: { id },
      include: [
        {
          model   : Order,
          as      : "order",
          where   : { userId },
          required: true,
        },
      ],
    });

    if (!returnRequest) {
      return res
        .status(404)
        .json({ message: "Không tìm thấy yêu cầu trả hàng" });
    }

    /* ------------------------------------------------------------------
     * 2. Chỉ cho phép chọn phương thức khi đã được admin duyệt
     * ---------------------------------------------------------------- */
    if (returnRequest.status !== "approved") {
      return res.status(400).json({
        message:
          "Chỉ có thể chọn phương thức hoàn hàng khi yêu cầu ở trạng thái đã duyệt",
      });
    }

    /* ------------------------------------------------------------------
     * 3. Validate input
     * ---------------------------------------------------------------- */
    if (!["ghn_pickup", "self_send"].includes(returnMethod)) {
      return res
        .status(400)
        .json({ message: "Phương thức hoàn hàng không hợp lệ" });
    }

    /* ------------------------------------------------------------------
     * 4. Cập nhật phương thức + trạng thái
     *    - GHN đến lấy  : giữ nguyên `approved` (để bước book GHN xử lý)
     *    - Tự gửi bưu cục: chuyển sang `awaiting_pickup`
     * ---------------------------------------------------------------- */
    returnRequest.returnMethod = returnMethod;

    if (returnMethod === "self_send") {
      if (trackingCode?.trim()) returnRequest.trackingCode = trackingCode.trim();
      returnRequest.status = "awaiting_pickup";
    } else {
      // GHN tới lấy – trạng thái vẫn là `approved`
      returnRequest.status = "approved";
    }

    await returnRequest.save();

    return res.json({
      message: "Đã cập nhật phương thức hoàn hàng",
      data   : returnRequest,
    });
  } catch (err) {
    console.error("[chooseReturnMethod]", err);
    return res
      .status(500)
      .json({ message: "Lỗi server khi chọn phương thức hoàn hàng" });
  }
}


  static async reorder(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const order = await Order.findOne({
        where: { id, userId },
        include: [
          {
            model: OrderItem,
            as: "items",
            include: {
              model: Sku,
              required: true,
            },
          },
        ],
      });

      if (!order) {
        return res.status(404).json({ message: "Không tìm thấy đơn hàng" });
      }

      const [cart] = await Cart.findOrCreate({
        where: { userId },
        defaults: { userId },
      });

      for (const item of order.items) {
        const sku = item.Sku;
        if (!sku || sku.stock <= 0) continue;

        const quantityToAdd = Math.min(item.quantity, sku.stock);

        const [cartItem, created] = await CartItem.findOrCreate({
          where: { cartId: cart.id, skuId: sku.id },
          defaults: {
            cartId: cart.id,
            skuId: sku.id,
            quantity: quantityToAdd,
          },
        });

        if (!created) {
          cartItem.quantity += quantityToAdd;
          await cartItem.save();
        }
      }

      return res.json({ message: "Đã thêm lại sản phẩm vào giỏ hàng" });
    } catch (err) {
      console.error("[reorder] Lỗi:", err);
      return res.status(500).json({ message: "Không thể mua lại đơn hàng" });
    }
  }
  static async markAsCompleted(req, res) {
    try {
      const userId = req.user.id;
      const { id } = req.params;

      const order = await Order.findOne({ where: { id, userId } });

      if (!order) {
        return res.status(404).json({ message: "Không tìm thấy đơn hàng" });
      }

      if (!["shipping", "delivered"].includes(order.status)) {
        return res
          .status(400)
          .json({ message: "Chỉ xác nhận đơn đang giao hoặc đã giao" });
      }
      order.status = "completed";
      await order.save();

      return res.json({ message: "Xác nhận đã nhận hàng thành công" });
    } catch (err) {
      console.error("[markAsCompleted]", err);
      return res
        .status(500)
        .json({ message: "Lỗi server khi xác nhận đã nhận hàng" });
    }
  }
  // ----------------------------------------------------------------------------
// GHN RETURN-PICKUP: tự động tính weight, length, width, height
// ----------------------------------------------------------------------------
static async bookReturnPickup(req, res) {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;              // id của return request
    const userId = req.user.id;

    // 1. Tìm ReturnRequest kèm Order + ShippingAddress + SKU
    const returnReq = await ReturnRequest.findOne({
      where: { id },
      include: [
        {
          model: Order,
          as   : 'order',
          where: { userId },
          include: [
            {
              model : OrderItem,
              as    : 'items',
              include: {
                model     : Sku,
                attributes: ['weight', 'length', 'width', 'height'],
              },
            },
            {
              model: UserAddress,
              as   : 'shippingAddress',
              include: [
                { model: District, as: 'district' },
                { model: Ward,     as: 'ward'     },
              ],
            },
          ],
        },
      ],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!returnReq)
      return res.status(404).json({ message: 'Không tìm thấy yêu cầu trả hàng' });

    if (returnReq.status !== 'approved')
      return res.status(400).json({ message: 'Yêu cầu chưa được duyệt' });

    if (returnReq.returnMethod !== 'ghn_pickup')
      return res.status(400).json({ message: 'Phương thức không hợp lệ' });

    if (returnReq.trackingCode)
      return res.status(400).json({ message: 'Đã đặt GHN lấy hàng rồi' });

    const order = returnReq.order;

    /* --- TÍNH KHỐI LƯỢNG & KÍCH THƯỚC --- */
    let weight = 0;
    let maxL = 0, maxW = 0, maxH = 0;

    for (const it of order.items) {
      const sku = it.Sku;
      const w   = sku.weight || 500;
      const len = sku.length || 10;
      const wid = sku.width  || 10;
      const hei = sku.height || 10;

      weight += w * it.quantity;
      maxL   = Math.max(maxL, len);
      maxW   = Math.max(maxW, wid);
      maxH   = Math.max(maxH, hei);
    }

    /* --- GHN service_type_id --- */
    const addr = order.shippingAddress;

    const serviceId = await OrderController.getAvailableService(
      addr.district.ghnCode,
      Number(process.env.SHOP_DISTRICT_CODE)
    );

    /* --- TẠO VẬN ĐƠN GHN --- */
    const { data } = await axios.post(
      'https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/create',
      {
        service_type_id : serviceId,
        required_note   : 'KHONGCHOXEMHANG',
 payment_type_id : 1, // 1 = Shop trả phí
        // Lấy hàng tại KH
        from_name       : addr.fullName,
        from_phone      : addr.phone,
        from_address    : addr.streetAddress,
        from_ward_code  : addr.ward.code,
        from_district_id: addr.district.ghnCode,

        // Trả về kho
        to_name         : process.env.SHOP_NAME,
        to_phone        : process.env.SHOP_PHONE,
        to_address      : process.env.SHOP_ADDRESS,
        to_ward_code    : process.env.SHOP_WARD_CODE,
        to_district_id  : process.env.SHOP_DISTRICT_CODE,

        weight,
        length : maxL,
        width  : maxW,
        height : maxH,

        cod_amount       : 0,
        client_order_code: `RT-${order.orderCode}`,
        content          : `Return ${order.orderCode}`,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Token : process.env.GHN_TOKEN,
          ShopId: process.env.GHN_SHOP_ID,
        },
      }
    );

    const { order_code, label } = data.data;

    /* --- CẬP NHẬT ReturnRequest --- */
    returnReq.trackingCode = order_code;
    returnReq.labelUrl     = label;
    returnReq.status       = 'pickup_booked';
    await returnReq.save({ transaction: t });

    await t.commit();
    return res.json({
      message     : 'Đặt GHN lấy hàng thành công',
      trackingCode: order_code,
      labelUrl    : label,
    });

  } catch (err) {
    await t.rollback();
    console.error('[bookReturnPickup]', err);
    return res.status(500).json({ message: 'Lỗi server khi đặt GHN pick-up' });
  }
}
/**
 * Tạo link thanh toán Viettel Money
 * body: { orderId }
 */
static async viettelMoneyPay(req, res) {
  try {
    const { orderId } = req.body;
    const order = await Order.findByPk(orderId);
    if (!order) {
      return res.status(404).json({ message: "Không tìm thấy đơn hàng" });
    }

    const payUrl = viettelMoneyService.createPaymentLink({
      orderId:  order.orderCode,
      billCode: `VT-${order.orderCode}`,
      amount:   order.finalPrice,
      orderInfo:`Thanh toán đơn ${order.orderCode}`,
    });

    order.paymentStatus = "waiting";
    await order.save();

    return res.json({ payUrl });
  } catch (error) {
    console.error("ViettelMoney error:", error);
    return res.status(500).json({ message: "Lỗi tạo link Viettel Money" });
  }
}

/**
 * Callback / IPN từ Viettel Money
 */
static async viettelMoneyCallback(req, res) {
  try {
    const data =
      Object.keys(req.body).length > 0 ? req.body : req.query;

    if (!viettelMoneyService.verifySignature(data)) {
      return res.status(400).end("INVALID_SIGN");
    }

    const {
      order_id,
      error_code,
      payment_status,
      vt_transaction_id,
    } = data;

    const order = await Order.findOne({ where: { orderCode: order_id } });
    if (!order) {
      return res.status(404).end("ORDER_NOT_FOUND");
    }

    if (error_code === "00" && String(payment_status) === "1") {
      order.paymentStatus = "paid";
    } else {
      order.paymentStatus = "failed";
    }
    order.viettelTransId = vt_transaction_id;
    await order.save();

    return res.end("OK");
  } catch (error) {
    console.error("ViettelMoney callback error:", error);
    return res.status(500).end("ERR");
  }
}


}

module.exports = OrderController;
