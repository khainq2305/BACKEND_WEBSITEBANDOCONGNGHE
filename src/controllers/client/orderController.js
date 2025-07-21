const {
  Order,
  OrderItem,
  sequelize,
  UserAddress,
  Province,
  Product,
  Coupon,
  CouponUser,
  ReturnRequest,
  FlashSale,
  FlashSaleItem,
  District,
  Cart,
  CartItem,
  Ward,
  UserPoint,
  ReturnRequestItem,
  ShippingProvider,
  Notification,
  NotificationUser,
  ProviderProvince, // <--- Đảm bảo đã import
  ProviderDistrict, // <--- Đảm bảo đã import
  ProviderWard, // <--- Đảm bảo đã import
  Sku,
  PaymentMethod,
} = require("../../models");
const sendEmail = require("../../utils/sendEmail"); // đường dẫn chính xác tùy cấu trúc dự án
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const axios = require("axios");
const momoService = require("../../services/client/momoService");
const zaloPayService = require("../../services/client/zalopayService");
const vnpayService = require("../../services/client/vnpayService");
const viettelMoneyService = require("../../services/client/viettelMoneyService");
const { Op } = require("sequelize");
const refundGateway = require("../../utils/refundGateway");

const moment = require("moment"); // nếu chưa import
const ShippingService = require("../../services/client/shippingService");
class OrderController {
  static async createOrder(req, res) {
    const t = await sequelize.transaction();
    try {
      /* ================================================================
       * 1. LẤY INPUT & CÁC BIẾN CÓ THỂ THAY ĐỔI
       * ================================================================ */
      const user = req.user;
      const {
        addressId,
        items,
        note,
        couponCode,
        paymentMethodId,
        cartItemIds = [],

        // FE mới truyền xuống
        shippingProviderId, // id trong bảng shipping_providers
        shippingService, // serviceCode / service_type_id
        shippingLeadTime, // ISO-string
        shippingFee: bodyShippingFee, // số FE đã tính (nếu có)
      } = req.body;

      // 👉 copy sang biến có thể reassignment
      let providerId = shippingProviderId || null;
      let serviceCode = shippingService || null;
      let leadTimeDate = shippingLeadTime ? new Date(shippingLeadTime) : null;

      /* ------------------------------------------------ */
      if (!addressId || !items?.length || !paymentMethodId)
        return res.status(400).json({ message: "Thiếu dữ liệu đơn hàng" });

      const validPayment = await PaymentMethod.findByPk(paymentMethodId);
      if (!validPayment)
        return res
          .status(400)
          .json({ message: "Phương thức thanh toán không hợp lệ" });

      /* ========== ĐỊA CHỈ ========= */
      const selectedAddress = await UserAddress.findOne({
        where: { id: addressId, userId: user.id },
        include: [
          { model: Province, as: "province" },
          { model: District, as: "district" },
          { model: Ward, as: "ward" },
        ],
      });
      if (!selectedAddress) {
        return res
          .status(400)
          .json({ message: "Địa chỉ người dùng không hợp lệ." });
      }

      /* ========== SKU & GIẢM GIÁ ========= */
      const now = new Date();
      // const { Op } = require('sequelize'); // Dòng này có thể bị trùng nếu Op đã được import ở đầu file

      const skuList = await Sku.findAll({
        where: { id: items.map((i) => i.skuId) },
        include: [
          {
            model: FlashSaleItem,
            as: "flashSaleSkus",
            required: false,
            include: {
              model: FlashSale,
              as: "flashSale",
              required: true,
              where: {
                isActive: true,
                startTime: { [Op.lte]: now },
                endTime: { [Op.gte]: now },
              },
            },
          },
        ],
      });
      const skuMap = Object.fromEntries(skuList.map((s) => [s.id, s]));

      for (const it of items) {
        const sku = skuMap[it.skuId];
        if (!sku)
          return res
            .status(400)
            .json({ message: `Không tìm thấy SKU ${it.skuId}` });
        if (it.quantity > sku.stock)
          return res
            .status(400)
            .json({ message: `SKU "${sku.skuCode}" chỉ còn ${sku.stock}` });
      }

      const totalPrice = items.reduce((s, i) => s + i.price * i.quantity, 0);

      /* ----- coupon (nếu có) ----- */
      let couponRecord = null;
      let couponDiscount = 0;
      let shippingDiscount = 0;

      if (couponCode) {
        couponRecord = await Coupon.findOne({
          where: {
            code: couponCode.trim(),
            isActive: true,
            startTime: { [Op.lte]: now },
            endTime: { [Op.gte]: now },
          },
          paranoid: false,
        });
        if (!couponRecord)
          return res
            .status(400)
            .json({ message: "Coupon không hợp lệ hoặc đã hết hiệu lực" });

        if (couponRecord.totalQuantity !== null) {
          const used = await Order.count({
            where: {
              couponId: couponRecord.id,
              status: { [Op.notIn]: ["cancelled", "failed"] },
            },
          });
          if (used >= couponRecord.totalQuantity)
            return res
              .status(400)
              .json({ message: "Coupon đã hết lượt sử dụng" });
        }
        if (couponRecord) {
          const couponUser = await CouponUser.findOne({
            where: { userId: user.id, couponId: couponRecord.id },
            transaction: t,
            lock: t.LOCK.UPDATE,
          });

          // Giả sử bạn có trường maxUsagePerUser trong coupon (nếu không có thì đặt mặc định 1)
          const maxUsagePerUser = couponRecord.maxUsagePerUser || 1;

          if (couponUser && couponUser.used >= maxUsagePerUser) {
            await t.rollback();
            return res
              .status(400)
              .json({ message: "Bạn đã sử dụng mã này tối đa" });
          }
        }

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
          )
            couponDiscount = couponRecord.maxDiscountValue;
        }
      }

      /* ========== PHÍ VẬN CHUYỂN ========= */
      let shippingFee = Number(bodyShippingFee) || 0;
      let finalServiceCode = serviceCode; // Để lưu serviceCode cuối cùng
      let finalProviderId = providerId; // Để lưu providerId cuối cùng
      let calculatedLeadTime = leadTimeDate; // Để lưu leadTime cuối cùng

      if (!shippingFee) {
        // Nếu frontend không truyền phí vận chuyển (hoặc bằng 0), thì tự tính
        let weight = 0,
          maxL = 0,
          maxW = 0,
          maxH = 0;
        for (const it of items) {
          const sku = skuMap[it.skuId];
          weight += (sku.weight || 500) * it.quantity;
          maxL = Math.max(maxL, sku.length || 10);
          maxW = Math.max(maxW, sku.width || 10);
          maxH = Math.max(maxH, sku.height || 10);
        }
        weight ||= 1;
        maxL ||= 1;
        maxW ||= 1;
        maxH ||= 1; // Đảm bảo không có giá trị 0
        const MAX_WEIGHT = 30000; // 30kg
        const MAX_DIMENSION = 150; // GHN chiều dài tối đa

        if (
          weight > MAX_WEIGHT ||
          maxL > MAX_DIMENSION ||
          maxW > MAX_DIMENSION ||
          maxH > MAX_DIMENSION
        ) {
          return res.status(400).json({
            message: `Đơn hàng vượt quá giới hạn vận chuyển của GHN (30kg hoặc kích thước > 150cm). Vui lòng giảm số lượng sản phẩm.`,
            code: "ORDER_OVER_LIMIT",
          });
        }

        // ⭐ THAY THẾ LOGIC TÍNH PHÍ CŨ BẰNG ShippingService.calcFee ⭐
        const defaultProvider = await ShippingProvider.findOne({
          where: { code: "ghn" },
        }); // Lấy GHN làm hãng mặc định
        if (!defaultProvider) {
          throw new Error(
            "Hãng vận chuyển GHN (mặc định) không được tìm thấy."
          );
        }
        finalProviderId = defaultProvider.id;

        const {
          fee,
          leadTime,
          serviceCode: newServiceCode,
        } = await ShippingService.calcFee({
          providerId: finalProviderId,
          toProvince: selectedAddress.province.id, // ID nội bộ của tỉnh
          toDistrict: selectedAddress.district.id, // ID nội bộ của huyện
          toWard: selectedAddress.ward.id, // ID nội bộ của phường/xã
          weight,
          length: maxL,
          width: maxW,
          height: maxH,
          provinceName: selectedAddress.province.name, // Tên để fallback trong mapping
          districtName: selectedAddress.district.name, // Tên để fallback trong mapping
          wardName: selectedAddress.ward.name, // Tên để fallback trong mapping
          serviceCode: serviceCode, // Nếu FE có truyền serviceCode thì ưu tiên dùng
        });

        shippingFee = fee;
        calculatedLeadTime = leadTime;
        finalServiceCode = newServiceCode || serviceCode; // Ưu tiên serviceCode được trả về từ calcFee

        // Cập nhật các biến cuối cùng
        providerId = finalProviderId;
        serviceCode = finalServiceCode;
        leadTimeDate = calculatedLeadTime ? new Date(calculatedLeadTime) : null;
      }

      shippingDiscount = Math.min(shippingDiscount, shippingFee);
      const finalPrice =
        totalPrice - couponDiscount + shippingFee - shippingDiscount;

      /* ========== TẠO ĐƠN HÀNG ========= */
      const paymentStatus = [
        "momo",
        "vnpay",
        "zalopay",
        "atm",
        "stripe",
      ].includes(validPayment.code.toLowerCase())
        ? "waiting"
        : "unpaid";

      const newOrder = await Order.create(
        {
          userId: user.id,
          userAddressId: selectedAddress.id,
          couponId: couponRecord?.id || null,
          totalPrice,
          finalPrice,
          shippingFee,
          couponDiscount,
          shippingDiscount,

          shippingProviderId: providerId, // Sử dụng giá trị đã xác định
          shippingService: serviceCode, // Sử dụng giá trị đã xác định
          shippingLeadTime: leadTimeDate, // Sử dụng giá trị đã xác định

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
      // ✅ Nếu là VNPay thì tạo vnpOrderId và lưu vào đơn
      if (validPayment.code.toLowerCase() === "vnpay") {
        const vnpOrderId = `${newOrder.orderCode}-${Date.now()}`;
        newOrder.vnpOrderId = vnpOrderId;
        await newOrder.save({ transaction: t });
      }

      /* ---------- ORDER ITEMS & KHO ---------- */
      for (const it of items) {
        const sku = skuMap[it.skuId];
        const fsItem = sku.flashSaleSkus?.find(
          (f) => f.flashSale && f.quantity > 0 && f.skuId === it.skuId
        );
        console.log(`🟨 SKU ${sku.id} - ${sku.skuCode}`);
        if (sku.flashSaleSkus?.length) {
          sku.flashSaleSkus.forEach((f) => {
            console.log(
              `  🔸 FSItem ID: ${f.id}, FlashSale ID: ${f.flashSale?.id}, Quantity: ${f.quantity}`
            );
          });
        } else {
          console.log("  ⚠️ Không có flash sale nào");
        }

        await OrderItem.create(
          {
            orderId: newOrder.id,
            skuId: it.skuId,
            quantity: it.quantity,
            price: it.price,
            flashSaleId: fsItem?.id || null,
          },
          { transaction: t }
        );

        await sku.decrement("stock", { by: it.quantity, transaction: t });
        if (fsItem) {
          const fsItemLocked = await FlashSaleItem.findOne({
            where: { id: fsItem.id },
            transaction: t,
            lock: t.LOCK.UPDATE,
          });
          if (fsItemLocked) {
            await fsItemLocked.decrement("quantity", {
              by: it.quantity,
              transaction: t,
            });
            await fsItemLocked.reload({ transaction: t });
            console.log(
              `✅ Đã trừ flashSaleItem ${fsItemLocked.id}, còn lại: ${fsItemLocked.quantity}`
            );
          }
        }
      }

      if (couponRecord && couponRecord.totalQuantity !== null)
        await couponRecord.decrement("totalQuantity", {
          by: 1,
          transaction: t,
        });

      const cart = await Cart.findOne({ where: { userId: user.id } });
      if (cart && cartItemIds.length)
        await CartItem.destroy({
          where: { id: cartItemIds, cartId: cart.id },
          transaction: t,
        });

      /* ---------- NOTIFICATION ---------- */
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
      await NotificationUser.create(
        { notificationId: notification.id, userId: user.id },
        { transaction: t }
      );
      const emailHtml = `
  <h2>Đơn hàng ${newOrder.orderCode} đã được đặt thành công</h2>
  <p>Xin chào ${user.fullName || "khách hàng"},</p>
  <p>Cảm ơn bạn đã đặt hàng tại cửa hàng chúng tôi.</p>
  <p>Mã đơn hàng của bạn: <b>${newOrder.orderCode}</b></p>
  <p>Tổng giá trị: <b>${finalPrice.toLocaleString("vi-VN")}₫</b></p>
  <p>Phí vận chuyển: <b>${shippingFee.toLocaleString("vi-VN")}₫</b></p>
  <p>Phương thức thanh toán: <b>${validPayment.name}</b></p>
  <p>Chúng tôi sẽ liên hệ với bạn sớm nhất để xử lý đơn hàng.</p>
  <br />
  <p>Trân trọng,</p>
  <p>Đội ngũ hỗ trợ khách hàng</p>
`;

      try {
        await sendEmail(
          user.email,
          `Đơn hàng ${newOrder.orderCode} của bạn`,
          emailHtml
        );
      } catch (emailErr) {
        console.error("Lỗi gửi email thông báo đặt hàng:", emailErr);
      }
      if (couponRecord) {
        const couponUser = await CouponUser.findOne({
          where: { userId: user.id, couponId: couponRecord.id },
          transaction: t,
          lock: t.LOCK.UPDATE,
        });

        if (couponUser) {
          await couponUser.increment("used", { by: 1, transaction: t });
        } else {
          await CouponUser.create(
            {
              userId: user.id,
              couponId: couponRecord.id,
              used: 1,
              assignedAt: new Date(),
            },
            { transaction: t }
          );
        }
      }
// ✅ TÍNH VÀ LƯU ĐIỂM THƯỞNG
const rewardPoints = Math.floor(finalPrice / 4000);
if (rewardPoints > 0) {
  await UserPoint.create({
    userId: user.id,
    orderId: newOrder.id,
    points: rewardPoints,
    type: 'earn',
    description: `Tặng ${rewardPoints} điểm từ đơn ${newOrder.orderCode}`,
  }, { transaction: t });
}

      await t.commit();
      return res.status(201).json({
        message: "Đặt hàng thành công",
        orderId: newOrder.id,
        orderCode: newOrder.orderCode,
        couponDiscount,
        shippingDiscount,

        // gửi lại thông tin vận chuyển cho FE
        shippingFee,
        shippingProviderId: providerId,
        shippingService: serviceCode,
        shippingLeadTime: leadTimeDate,
      });
    } catch (err) {
      await t.rollback();
      console.error("❌ Lỗi tạo đơn hàng:", err);
      let errorMessage = "Lỗi khi tạo đơn hàng";
      if (axios.isAxiosError(err) && err.response && err.response.data) {
        errorMessage = `Lỗi từ hãng vận chuyển: ${
          err.response.data.message || JSON.stringify(err.response.data)
        }`;
      } else if (err.message) {
        errorMessage = err.message;
      }
      return res.status(500).json({ message: errorMessage });
    }
  }

  static async getById(req, res) {
  try {
    const user = req.user;
    const orderCode = req.params.code?.trim();

    const order = await Order.findOne({
      where: {
        userId: user.id,
        [Op.or]: [
          { orderCode },
          { momoOrderId: orderCode },
          { vnpOrderId: orderCode },
        ],
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
          attributes: ["id", "name", "code"],
        },
        {
          model: ShippingProvider, // 👈 thêm ShippingProvider
          as: "shippingProvider",
          attributes: ["id", "name", "code"],
        },
        {
          model: ReturnRequest,
          as: "returnRequest",
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
      originalPrice: item.Sku?.price ? Number(item.Sku.price) : null,
      price: item.price,
      total: item.price * item.quantity,
    }));

    let productDiscount = 0;
    for (const p of products) {
      if (p.originalPrice && p.originalPrice > p.price) {
        productDiscount += (p.originalPrice - p.price) * (p.quantity || 1);
      }
    }

    const statusTextMap = {
      pending: "Chờ xác nhận",
      processing: "Đang xử lý",
      shipping: "Đang giao",
      delivered: "Đã giao",
      cancelled: "Đã hủy",
      returned: "Đã hoàn trả",
      completed: "Đã hoàn tất",
    };

    const result = {
      id: order.id,
      orderCode: order.orderCode,
      status: order.status,
      statusText: statusTextMap[order.status] || "Không xác định",
      totalPrice: order.totalPrice,
      shippingFee: order.shippingFee,
      shippingDiscount: order.shippingDiscount,
      couponDiscount: order.couponDiscount,
      productDiscount,
      finalPrice: order.finalPrice,
      paymentStatus: order.paymentStatus,
      cancelReason: order.cancelReason,
      note: order.note,
      createdAt: order.createdAt,
      confirmedAt: order.confirmedAt,
      shippedAt: order.shippedAt,
      deliveredAt: order.deliveredAt,
      completedAt: order.completedAt,
      cancelledAt: order.cancelledAt,
      returnedAt: order.returnedAt,

      paymentMethod: order.paymentMethod
        ? {
            id: order.paymentMethod.id,
            name: order.paymentMethod.name,
            code: order.paymentMethod.code,
          }
        : null,

      shippingProvider: order.shippingProvider
        ? {
            id: order.shippingProvider.id,
            name: order.shippingProvider.name,
            code: order.shippingProvider.code,
          }
        : null,

      userAddress: {
        fullAddress,
        fullName: address?.fullName,
        phone: address?.phone,
        province: address?.province?.name || null,
        district: address?.district?.name || null,
        ward: address?.ward?.name || null,
        streetAddress: address?.streetAddress || null,
      },

      products,
      returnRequest: order.returnRequest || null,
    };

    return res.json({ message: "Lấy đơn hàng thành công", data: result });
  } catch (error) {
    console.error("Lỗi khi lấy chi tiết đơn hàng:", error);
    return res.status(500).json({ message: "Lỗi máy chủ khi lấy đơn hàng" });
  }
}


  static async uploadProof(req, res) {
    try {
      const { id } = req.params;
      if (!req.file || !req.file.path) {
        return res.status(400).json({ message: "Thiếu file chứng từ" });
      }

      const order = await Order.findByPk(id);
      if (!order) {
        return res.status(404).json({ message: "Không tìm thấy đơn hàng" });
      }

      // Lưu URL lên trường proofUrl
      order.proofUrl = req.file.path;
      await order.save();

      return res.json({
        message: "Upload chứng từ thành công",
        proofUrl: order.proofUrl,
      });
    } catch (err) {
      console.error("Lỗi upload chứng từ:", err);
      return res.status(500).json({ message: "Không thể upload chứng từ" });
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
          as: "returnRequest",
          required: false,
          attributes: [
            "id",
            "status",
            "returnCode",
            "deadlineChooseReturnMethod",
            "returnMethod",
          ],
          // ***** THAY ĐỔI QUAN TRỌNG TẠI ĐÂY *****
          include: [ // Thêm include này để lấy ReturnRequestItem
            {
              model: ReturnRequestItem, // Đảm bảo bạn đã import model này
              as: "items", // Tên alias của mối quan hệ trong model ReturnRequest của bạn (ví dụ: ReturnRequest hasMany ReturnRequestItem as 'items')
              attributes: ["skuId", "quantity"], // Chỉ lấy các thuộc tính cần thiết để so sánh ở frontend
              required: false, // Để vẫn lấy ReturnRequest nếu không có ReturnRequestItem nào
            },
          ],
        },
        {
          model: PaymentMethod,
          as: "paymentMethod",
          attributes: ["id", "name", "code"],
          required: true,
        },
        {
          model: UserAddress,
          as: "shippingAddress",
          include: [
            { model: Province, as: "province" },
            { model: District, as: "district" },
            { model: Ward, as: "ward" },
          ],
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
      paymentStatus: order.paymentStatus,
      finalPrice: order.finalPrice,
      orderCode: order.orderCode,
      createdAt: order.createdAt,
      returnRequest: order.returnRequest // Nếu order.returnRequest tồn tại
        ? {
            id: order.returnRequest.id,
            status: order.returnRequest.status,
            returnCode: order.returnRequest.returnCode,
            deadlineChooseReturnMethod: order.returnRequest.deadlineChooseReturnMethod,
            returnMethod: order.returnRequest.returnMethod || null,
            // ***** THAY ĐỔI QUAN TRỌNG TẠI ĐÂY *****
            items: order.returnRequest.items // Bây giờ `items` sẽ có dữ liệu từ include
              ? order.returnRequest.items.map((item) => ({
                  skuId: item.skuId,
                  quantity: item.quantity,
                }))
              : [], // Đảm bảo trả về mảng rỗng nếu không có item nào
          }
        : null,
      paymentMethod: order.paymentMethod
        ? {
            id: order.paymentMethod.id,
            name: order.paymentMethod.name,
            code: order.paymentMethod.code,
          }
        : null,
      shippingAddress: order.shippingAddress
        ? {
            fullName: order.shippingAddress.fullName,
            phone: order.shippingAddress.phone,
            streetAddress: order.shippingAddress.streetAddress,
            ward: {
              name: order.shippingAddress.ward?.name,
              code: order.shippingAddress.ward?.code,
            },
            district: {
              name: order.shippingAddress.district?.name,
              ghnCode: order.shippingAddress.district?.ghnCode,
            },
            province: {
              name: order.shippingAddress.province?.name,
            },
          }
        : null,
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
      const { id } = req.params;
      const { reason } = req.body || {};
      const reasonText = typeof reason === "string" ? reason : reason?.reason;

      if (!reasonText?.trim()) {
        return res
          .status(400)
          .json({ message: "Lý do huỷ đơn không được bỏ trống" });
      }

      // Tìm đơn hàng cần huỷ + phương thức thanh toán
      const order = await Order.findByPk(id, {
        include: [
          { model: PaymentMethod, as: "paymentMethod", attributes: ["code"] },
        ],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!order) {
        await t.rollback();
        return res.status(404).json({ message: "Không tìm thấy đơn hàng" });
      }

      if (order.status === "cancelled") {
        await t.rollback();
        return res.status(400).json({ message: "Đơn hàng đã bị huỷ trước đó" });
      }

      const disallowedStatuses = ["shipping", "delivered", "completed"];
      if (disallowedStatuses.includes(order.status)) {
        await t.rollback();
        return res
          .status(400)
          .json({ message: "Đơn hàng không thể huỷ ở trạng thái hiện tại" });
      }

      // ==============================
      // Hoàn tiền nếu đã thanh toán
      // ==============================
      const paid = order.paymentStatus === "paid";
      const payCode = order.paymentMethod?.code?.toLowerCase();

      if (paid && ["momo", "vnpay", "zalopay", "stripe"].includes(payCode)) {
        const payload = {
          orderCode: order.orderCode,
          amount: order.finalPrice,
        };

        if (payCode === "momo") {
          if (!order.momoTransId) {
            await t.rollback();
            return res
              .status(400)
              .json({ message: "Thiếu thông tin giao dịch MoMo" });
          }
          payload.momoTransId = order.momoTransId;
        }

        if (payCode === "vnpay") {
          if (!order.vnpTransactionId || !order.paymentTime) {
            await t.rollback();
            return res
              .status(400)
              .json({ message: "Thiếu thông tin giao dịch VNPay" });
          }
          payload.vnpTransactionId = order.vnpTransactionId;
          payload.transDate = order.paymentTime;
        }
        if (payCode === "stripe") {
          if (!order.stripePaymentIntentId) {
            await t.rollback();
            return res
              .status(400)
              .json({ message: "Thiếu stripePaymentIntentId" });
          }
          payload.stripePaymentIntentId = order.stripePaymentIntentId;
        }

        if (payCode === "zalopay") {
          if (!order.zaloTransId || !order.zaloAppTransId) {
            await t.rollback();
            return res
              .status(400)
              .json({ message: "Thiếu thông tin giao dịch ZaloPay" });
          }
          payload.zp_trans_id = order.zaloTransId;
          payload.app_trans_id = order.zaloAppTransId;
          payload.amount = Math.round(Number(order.finalPrice)); // 💥 BẮT BUỘC
        }

        console.log("[REFUND] Payload gửi gateway:", payload);

        const { ok, transId } = await refundGateway(payCode, payload);

        if (!ok) {
          await t.rollback();
          return res
            .status(400)
            .json({ message: "Hoàn tiền qua cổng thanh toán thất bại" });
        }

        order.paymentStatus = "refunded";
        order.gatewayTransId = transId || null;
      } else {
        // Nếu chưa thanh toán, hoặc COD/ATM thì chỉ huỷ đơn
        order.paymentStatus = "unpaid";
      }

      order.status = "cancelled";
      order.cancelReason = reasonText.trim();

      await order.save({ transaction: t });
      await t.commit();

      return res
        .status(200)
        .json({ message: "Huỷ đơn hàng thành công", orderId: order.id });
    } catch (err) {
      await t.rollback();
      console.error("[cancel]", err);
      return res.status(500).json({ message: "Hủy đơn thất bại" });
    }
  }

static async lookupOrder(req, res) {
  try {
    const { code, phone } = req.query;

    if (!code || !phone) {
      return res.status(400).json({ message: "Thiếu mã đơn hoặc số điện thoại" });
    }

    const order = await Order.findOne({
      where: { orderCode: code },
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
        {
          model: PaymentMethod,
          as: "paymentMethod",
          attributes: ["id", "name"],
        },
      ],
      attributes: [
        "id",
        "orderCode",
        "status",
        "totalPrice",
        "shippingProviderId",
        "shippingServiceId",
        "shippingFee",
        "paymentMethodId",
      ],
    });

    if (!order) return res.status(404).json({ message: "Không tìm thấy đơn hàng" });

    const plain = order.get({ plain: true });

    // ✅ Tính lại totalPrice nếu không có
    if (!plain.totalPrice || plain.totalPrice === 0) {
      plain.totalPrice = plain.items.reduce((acc, item) => acc + item.price * item.quantity, 0);
    }

    // ✅ Tìm tên địa chỉ từ ID (nếu đã có các bảng mapping)
    const ward = plain.shippingAddress?.wardId ? await Ward.findByPk(plain.shippingAddress.wardId) : null;
    const district = plain.shippingAddress?.districtId ? await District.findByPk(plain.shippingAddress.districtId) : null;
    const province = plain.shippingAddress?.provinceId ? await Province.findByPk(plain.shippingAddress.provinceId) : null;

    const fullAddress = [
      plain.shippingAddress?.streetAddress,
      ward?.name,
      district?.name,
      province?.name,
    ]
      .filter(Boolean)
      .join(", ");

    const responseData = {
      id: plain.id,
      code: plain.orderCode,
      status: plain.status,
      shippingProviderId: plain.shippingProviderId,
      shippingServiceId: plain.shippingServiceId,
      shippingFee: plain.shippingFee,
      totalPrice: plain.totalPrice,
      paymentMethod: plain.paymentMethod?.name || "Không rõ",
      customer: plain.shippingAddress?.fullName || "N/A",
      phone: plain.shippingAddress?.phone || "N/A",
      address: fullAddress || "Không xác định",
      products: plain.items.map((item) => ({
        name: item.Sku?.product?.name || "Sản phẩm",
        quantity: item.quantity,
        price: item.price,
      })),
    };

    return res.status(200).json(responseData);
  } catch (err) {
    console.error("[lookupOrder]", err);
    res.status(500).json({ message: "Lỗi server", error: err.message });
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

  static async getShippingOptions(req, res) {
    try {
      const { districtId, wardId, items = [] } = req.body;

      console.log("[getShippingOptions] Payload:", {
        districtId,
        wardId,
        itemsCount: items.length,
      });

      // 1️⃣ Lấy tỉnh/huyện/xã
      const district = await District.findByPk(districtId, {
        include: [Province],
      });
      const ward = await Ward.findByPk(wardId);

      if (!district || !district.Province)
        return res.status(400).json({ message: "Không tìm thấy tỉnh/huyện." });
      if (!ward)
        return res.status(400).json({ message: "Không tìm thấy phường/xã." });

      const toProvinceName = district.Province.name;
      const toDistrictName = district.name;
      const toWardName = ward.name;

      const toProvinceId = district.Province.id;
      const toDistrictId = district.id;
      const toWardId = ward.id;

      console.log("[getShippingOptions] Địa chỉ:", {
        province: toProvinceName,
        district: toDistrictName,
        ward: toWardName,
      });

      // 2️⃣ Tính trọng lượng và kích thước
      const skuList = await Sku.findAll({
        where: { id: items.map((i) => i.skuId) },
      });
      const skuMap = Object.fromEntries(skuList.map((s) => [s.id, s]));

      let weight = 0,
        maxL = 0,
        maxW = 0,
        maxH = 0;
      for (const it of items) {
        const sku = skuMap[it.skuId];
        if (!sku) continue;

        weight += (sku.weight || 500) * it.quantity;
        maxL = Math.max(maxL, sku.length || 10);
        maxW = Math.max(maxW, sku.width || 10);
        maxH = Math.max(maxH, sku.height || 10);
      }

      weight ||= 1;
      maxL ||= 1;
      maxW ||= 1;
      maxH ||= 1;

      const orderValue = items.reduce(
        (sum, it) => sum + (it.price || 0) * (it.quantity || 1),
        0
      );

      console.log("[getShippingOptions] Kích thước kiện:", {
        weight,
        length: maxL,
        width: maxW,
        height: maxH,
        orderValue,
      });

      // 3️⃣ Lấy các hãng vận chuyển đang hoạt động (bỏ jnt)
      const providers = await ShippingProvider.findAll({
        where: {
          isActive: true,
          code: { [Op.ne]: "jnt" },
        },
      });

      if (!providers.length)
        return res
          .status(404)
          .json({ message: "Không có hãng vận chuyển nào đang hoạt động." });

      // 4️⃣ Tính phí cho từng hãng
      const options = await Promise.all(
        providers.map(async (p) => {
          try {
            const isVTP = p.code === "vtp";

            const { fee, leadTime } = await ShippingService.calcFee({
              providerId: p.id,

              toProvince: isVTP ? toProvinceId : toProvinceName,
              toDistrict: isVTP ? toDistrictId : toDistrictName,
              toWard: isVTP ? toWardId : toWardName,

              provinceName: toProvinceName,
              districtName: toDistrictName,
              wardName: toWardName,

              weight,
              length: maxL,
              width: maxW,
              height: maxH,
              orderValue,
            });

            return {
              providerId: p.id,
              code: p.code,
              name: p.name,
              fee,
              leadTime,
            };
          } catch (err) {
            console.warn(
              `[getShippingOptions] Bỏ qua ${p.name} (${p.code}) –`,
              `Tỉnh: ${toProvinceName}, Huyện: ${toDistrictName}, Xã: ${toWardName} –`,
              err?.response?.data || err.message
            );
            return null;
          }
        })
      );

      const available = options.filter(Boolean);
      if (!available.length)
        return res
          .status(404)
          .json({ message: "Không tìm thấy phương thức vận chuyển khả dụng." });

      return res.json({ data: available });
    } catch (err) {
      console.error("[getShippingOptions] Lỗi server:", err);
      return res.status(500).json({
        message: "Lỗi server khi lấy phương thức vận chuyển",
        error: err.message,
      });
    }
  }
}

module.exports = OrderController;
