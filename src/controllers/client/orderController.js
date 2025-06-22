const {
  Order,
  OrderItem,
  sequelize,
  UserAddress,
  Province,
  Product,
  Coupon,  // 👈 THÊM DÒNG NÀY
  ReturnRequest,
  FlashSale,
  FlashSaleItem, // ✅ THÊM DÒNG NÀY
  District,
     // 👈 Thêm dòng này
  Cart,
  CartItem, // ✅ THÊM DÒNG NÀY
  Ward,
  Sku,
  PaymentMethod,
} = require("../../models");
const axios = require("axios");
const momoService = require("../../services/client/momoService");
const zaloPayService = require("../../services/client/zalopayService");
const vnpayService = require("../../services/client/vnpayService");

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

// Trong file controllers/client/orderController.js

// Trong file controllers/client/orderController.js

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
        return res.status(400).json({ message: "Coupon không hợp lệ hoặc đã hết hiệu lực" });
      }

      if (couponRecord.totalQuantity !== null) {
        const usedCount = await Order.count({
          where: {
            couponId: couponRecord.id,
            status: { [Op.notIn]: ["cancelled", "failed"] },
          },
        });
        if (usedCount >= couponRecord.totalQuantity) {
          return res.status(400).json({ message: "Coupon đã hết lượt sử dụng" });
        }
      }
    }

    // ✅ Validate đầu vào
    if (!addressId || !items?.length || !paymentMethodId) {
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

    if (!selectedAddress || !selectedAddress.district?.ghnCode || !selectedAddress.ward?.ghnCode) {
      return res.status(400).json({ message: "Địa chỉ không hợp lệ hoặc thiếu mã GHN" });
    }

    // ✅ Lấy danh sách SKU kèm Flash Sale nếu có
    const { Op } = require("sequelize");
    const skuList = await Sku.findAll({
      where: { id: items.map(i => i.skuId) },
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

    const skuMap = Object.fromEntries(skuList.map(s => [s.id, s]));
    for (const item of items) {
      const sku = skuMap[item.skuId];
      if (!sku) return res.status(400).json({ message: `Không tìm thấy SKU ${item.skuId}` });
      if (item.quantity > sku.stock) {
        return res.status(400).json({ message: `SKU "${sku.skuCode}" chỉ còn ${sku.stock}` });
      }
    }

    // ✅ Tính tổng tiền
    const totalPrice = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

    if (couponRecord) {
      couponDiscount = couponRecord.discountType === "percent"
        ? Math.floor((totalPrice * couponRecord.discountValue) / 100)
        : Number(couponRecord.discountValue);
      if (couponRecord.maxDiscountValue && couponDiscount > couponRecord.maxDiscountValue) {
        couponDiscount = couponRecord.maxDiscountValue;
      }
    }

    // ✅ Tính phí vận chuyển
    let shippingFee = 0;
    {
      let totalWeight = 0, maxL = 0, maxW = 0, maxH = 0;
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

    const finalPrice = totalPrice - couponDiscount + shippingFee;

    const paymentStatus = ["momo", "vnpay", "zalopay"].includes(validPayment.code.toLowerCase())
      ? "waiting"
      : "unpaid";

    // ✅ Tạo đơn hàng
    const newOrder = await Order.create({
      userId: user.id,
      userAddressId: selectedAddress.id,
      couponId: couponRecord?.id || null,
      totalPrice,
      finalPrice,
      shippingFee,
      couponDiscount,
      shippingDiscount: 0,
      paymentMethodId,
      note,
      status: "pending",
      paymentStatus,
      orderCode: "temp",
    }, { transaction: t });

    newOrder.orderCode = `DH${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(newOrder.id).padStart(5, "0")}`;
    await newOrder.save({ transaction: t });

    // ✅ Thêm order item + trừ tồn kho
    for (const item of items) {
      const sku = skuMap[item.skuId];
      const flashSaleItem = sku.flashSaleSkus?.[0]; // alias CHUẨN

      item.flashSaleItemId = flashSaleItem?.id || null;
      item.flashSaleId = flashSaleItem?.flashSaleId || null; // ✅ dùng trực tiếp ID

      console.log("📌 FLASH SALE ITEM ID:", item.flashSaleItemId);
      console.log("📌 FLASH SALE ID:", item.flashSaleId);

      await OrderItem.create({
  orderId: newOrder.id,
  skuId: item.skuId,
  quantity: item.quantity,
  price: item.price,
  flashSaleId: item.flashSaleItemId, // ✅ Tham chiếu đúng sang bảng flashsaleitems
}, { transaction: t });

      await sku.decrement("stock", {
        by: item.quantity,
        transaction: t,
      });

      if (item.flashSaleItemId) {
        const fsItem = await FlashSaleItem.findByPk(item.flashSaleItemId, { transaction: t });
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

    await t.commit();
    return res.status(201).json({
      message: "Đặt hàng thành công",
      orderId: newOrder.id,
      orderCode: newOrder.orderCode,
      couponDiscount,
      shippingDiscount: 0,
    });
  } catch (error) {
    await t.rollback();
    console.error("❌ Lỗi tạo đơn hàng:", error);
    return res.status(500).json({ message: "Lỗi khi tạo đơn hàng" });
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
    order.paymentStatus = 'waiting';
    await order.save();

    return res.json({ payUrl: momoRes.payUrl });
  } catch (error) {
    console.error("MoMo error:", error);
    return res
      .status(500)
      .json({ message: "Lỗi khi tạo link thanh toán MoMo" });
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
    return res.status(500).json({ message: "Lỗi server khi tạo thanh toán ZaloPay" });
  }
}
static async vnpay(req, res) {
  try {
    const { orderId } = req.body;
    const order = await Order.findByPk(orderId);
    if (!order)
      return res.status(404).json({ message: "Không tìm thấy đơn hàng" });

    const payUrl = vnpayService.createPaymentLink({
      orderId: order.orderCode,
      amount: order.finalPrice,
      orderInfo: order.orderCode,
    });

    return res.json({ payUrl });
  } catch (err) {
    console.error("VNPay error:", err);
    return res.status(500).json({ message: "Lỗi server khi tạo thanh toán VNPay" });
  }
}

 static async momoCallback(req, res) {
  try {
    const { orderId, resultCode } = req.body;
console.log("MoMo CALLBACK BODY:", req.body);

    // ✅ orderId lúc gửi là orderCode => cần tìm bằng orderCode
    const order = await Order.findOne({
  where: {
    orderCode: orderId, // ✅ KHÔNG split
  },
});
console.log("MoMo CALLBACK BODY:", req.body);


    if (!order) {
      return res.status(404).json({ message: "Không tìm thấy đơn hàng" });
    }

    if (resultCode === 0) {
      order.paymentStatus = 'paid';        // ✅ cập nhật trạng thái thanh toán
      order.status = 'confirmed';          // ✅ xác nhận đơn
    } else {
      order.paymentStatus = 'failed';      // ❌ thêm trạng thái nếu cần
      order.status = 'cancelled';
    }

    await order.save();
    return res.status(200).json({ message: "Đã xử lý callback thành công" });
  } catch (err) {
    console.error("Callback error:", err);
    return res.status(500).json({ message: "Lỗi xử lý callback MoMo" });
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
        {
          model: ReturnRequest,
          as: "returnRequest", // ✅ thêm dòng này
          required: false,
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
      orderCode: order.orderCode,
      returnRequest: order.returnRequest
        ? {
            id: order.returnRequest.id,
            status: order.returnRequest.status,
          }
        : null, // ✅ Đảm bảo trả về returnRequest và status
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
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const order = await Order.findOne({ where: { id, userId: req.user.id } });
    if (!order) {
      return res.status(404).json({ message: "Không tìm thấy đơn hàng" });
    }

    // ✅ Trạng thái không hợp lệ
    const invalidStatuses = ["shipping", "completed", "cancelled"];
    if (invalidStatuses.includes(order.status)) {
      return res.status(400).json({
        message: `Đơn hàng đã ở trạng thái "${order.status.toUpperCase()}", không thể hủy.`,
      });
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

  
  static async lookupOrder(req, res) {
    try {
      const { code, phone } = req.query;

      if (!code || !phone) {
        return res.status(400).json({ message: 'Thiếu mã đơn hoặc số điện thoại' });
      }

      const order = await Order.findOne({
        where: {
          orderCode: code,
        },
        include: [
          {
            model: UserAddress,
            as: 'shippingAddress',
            where: { phone },
            required: true,
          },
          {
            model: OrderItem,
            as: 'items',
            include: [
              {
                model: Sku,
                include: [
                  {
                    model: Product,
                    as: 'product'
                  }
                ]
              }
            ]
          }
        ]
      });

      if (!order) return res.status(404).json({ message: 'Không tìm thấy đơn hàng' });

      res.status(200).json(order);
    } catch (err) {
      console.error('[lookupOrder]', err);
      res.status(500).json({ message: 'Lỗi server', error: err.message });
    }
  }
// controllers/client/orderController.js
static async requestReturn(req, res) {
  try {
    console.log("🧾 [requestReturn] req.body:", req.body);
console.log("🧾 [requestReturn] req.files:", req.files);

    const { orderId, reason } = req.body;
    const userId = req.user.id;

    // ✅ 1. Kiểm tra orderId hợp lệ
    const parsedOrderId = Number(orderId);
    if (isNaN(parsedOrderId)) {
      return res.status(400).json({ message: "orderId không hợp lệ" });
    }

    // ✅ 2. Kiểm tra đơn hàng thuộc về user
    const order = await Order.findOne({
      where: { id: parsedOrderId, userId },
    });

    if (!order) {
      return res.status(404).json({ message: "Không tìm thấy đơn hàng" });
    }

    if (order.status !== "completed") {
      return res.status(400).json({
        message: "Chỉ có thể gửi yêu cầu trả hàng cho đơn hàng đã hoàn thành",
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

    // ✅ 3. Xử lý file upload (ảnh/video từ multer)
    const imageFiles = req.files?.images || [];
    const videoFiles = req.files?.videos || [];

    const imageUrls = imageFiles.map((f) => f.path).join(",") || null;
    const videoUrls = videoFiles.map((f) => f.path).join(",") || null;

    // ✅ 4. Tạo bản ghi ReturnRequest
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

static async chooseReturnMethod(req, res) {
  try {
    const { id } = req.params; // returnRequest id
    const { returnMethod, trackingCode } = req.body;
    const userId = req.user.id;

    // 1. Kiểm tra hợp lệ
    const returnRequest = await ReturnRequest.findOne({
      where: { id },
     include: [
  {
    model: Order,
    as: "order", // ✅ BẮT BUỘC PHẢI CÓ
    where: { userId },
    required: true,
  },
]

    });

    if (!returnRequest) {
      return res.status(404).json({ message: 'Không tìm thấy yêu cầu trả hàng' });
    }

    if (returnRequest.status !== 'approved') {
      return res.status(400).json({
        message: 'Chỉ có thể chọn phương thức hoàn hàng khi yêu cầu ở trạng thái đã duyệt',
      });
    }

    if (!['ghn_pickup', 'self_send'].includes(returnMethod)) {
      return res.status(400).json({ message: 'Phương thức hoàn hàng không hợp lệ' });
    }

    // 2. Cập nhật phương thức
    returnRequest.returnMethod = returnMethod;
  if (returnMethod === 'self_send' && trackingCode?.trim()) {
  returnRequest.trackingCode = trackingCode.trim();
}


    returnRequest.status = 'awaiting_pickup';
    await returnRequest.save();

    return res.json({ message: 'Đã cập nhật phương thức hoàn hàng', data: returnRequest });
  } catch (err) {
    console.error('[chooseReturnMethod]', err);
    return res.status(500).json({ message: 'Lỗi server khi chọn phương thức hoàn hàng' });
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

    // Tìm hoặc tạo giỏ hàng
    const [cart] = await Cart.findOrCreate({ where: { userId }, defaults: { userId } });

    for (const item of order.items) {
      const sku = item.Sku;
      if (!sku || sku.stock <= 0) continue;

      const quantityToAdd = Math.min(item.quantity, sku.stock);

      // Kiểm tra nếu item đã có trong giỏ hàng
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

    if (order.status !== 'shipping') {
      return res.status(400).json({ message: "Chỉ xác nhận khi đơn hàng đang giao" });
    }

    order.status = 'completed';
    await order.save();

    return res.json({ message: "Xác nhận đã nhận hàng thành công" });
  } catch (err) {
    console.error("[markAsCompleted]", err);
    return res.status(500).json({ message: "Lỗi server khi xác nhận đã nhận hàng" });
  }
}

}

module.exports = OrderController;

