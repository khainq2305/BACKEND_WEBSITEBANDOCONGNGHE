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
const moment = require("moment"); // nếu chưa import
const ShippingService = require("../../services/client/shippingService");
class OrderController {
  // static async getAvailableService(fromDistrict, toDistrict) {
  //   try {
  //     console.log(
  //       `[GHN Service] Requesting available services for from_district: ${fromDistrict}, to_district: ${toDistrict}`
  //     );
  //     const response = await axios.post(
  //       "https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/available-services",
  //       {
  //         shop_id: Number(process.env.GHN_SHOP_ID),
  //         from_district: Number(fromDistrict),
  //         to_district: Number(toDistrict),
  //       },
  //       {
  //         headers: {
  //           "Content-Type": "application/json",
  //           Token: process.env.GHN_TOKEN,
  //         },
  //       }
  //     );

  //     const service = response.data.data?.[0];
  //     if (!service) {
  //       throw new Error("Không có dịch vụ giao hàng khả dụng");
  //     }

  //     return service.service_type_id;
  //   } catch (error) {
  //     throw new Error("Không lấy được dịch vụ giao hàng");
  //   }
  // }

  // static async calculateFee({
  //   toDistrict,
  //   toWard,
  //   weight,
  //   length,
  //   width,
  //   height,
  //   serviceTypeId,
  // }) {
  //   try {
  //     const response = await axios.post(
  //       "https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/fee",
  //       {
  //         from_district_id: 1450,
  //         to_district_id: Number(toDistrict),
  //         to_ward_code: toWard,
  //         service_type_id: serviceTypeId,
  //         weight,
  //         length,
  //         width,
  //         height,
  //       },
  //       {
  //         headers: {
  //           "Content-Type": "application/json",
  //           Token: process.env.GHN_TOKEN,
  //           ShopId: process.env.GHN_SHOP_ID,
  //         },
  //       }
  //     );

  //     return response.data.data.total;
  //   } catch (error) {
  //     console.error("GHN Fee Error:", error?.response?.data || error.message);
  //     throw new Error("Không tính được phí vận chuyển");
  //   }
  // }

  // static async getShippingFee(req, res) {
  //   try {
  //     const { districtId, wardCode, items } = req.body;

  //     const districtIdValue = /^\d+$/.test(districtId)
  //       ? Number(districtId)
  //       : districtId;

  //     if (!districtIdValue || !wardCode || !items || items.length === 0) {
  //       return res.status(400).json({ message: "Thiếu thông tin tính phí" });
  //     }

  //     const skuList = await Sku.findAll({
  //       where: { id: items.map((i) => i.skuId) },
  //     });
  //     const skuMap = {};
  //     skuList.forEach((s) => (skuMap[s.id] = s));

  //     let totalWeight = 0,
  //       maxLength = 0,
  //       maxWidth = 0,
  //       maxHeight = 0;
  //     for (const item of items) {
  //       const sku = skuMap[item.skuId];
  //       totalWeight += (sku.weight || 500) * item.quantity;
  //       maxLength = Math.max(maxLength, sku.length || 10);
  //       maxWidth = Math.max(maxWidth, sku.width || 10);
  //       maxHeight = Math.max(maxHeight, sku.height || 10);
  //     }

  //     const serviceTypeId = await OrderController.getAvailableService(
  //       1450,
  //       districtIdValue
  //     );

  //     const shippingFee = await OrderController.calculateFee({
  //       toDistrict: districtIdValue,
  //       toWard: wardCode,
  //       weight: totalWeight,
  //       length: maxLength,
  //       width: maxWidth,
  //       height: maxHeight,
  //       serviceTypeId,
  //     });

  //     return res.json({ shippingFee });
  //   } catch (err) {
  //     console.error("Fee error:", err);
  //     return res
  //       .status(500)
  //       .json({ message: "Không tính được phí vận chuyển" });
  //   }
  // }

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
   const paymentStatus = ["momo", "vnpay", "zalopay", "atm", "stripe"].includes(
  validPayment.code.toLowerCase()
)
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

      console.log("⚡ [generate VietQR] Nhận request với dữ liệu:", {
        accountNumber,
        accountName,
        bankCode,
        amount,
        message,
      });

      if (!accountNumber || !accountName || !bankCode || !amount || !message) {
        console.warn("⚠️ [generate VietQR] Thiếu thông tin cần thiết:", {
          accountNumber: !!accountNumber,
          accountName: !!accountName,
          bankCode: !!bankCode,
          amount: !!amount,
          message: !!message,
        });
        return res.status(400).json({ message: "Thiếu thông tin cần thiết." });
      }

      const encodedMessage = encodeURIComponent(message);

      const vietqrUrl = `https://img.vietqr.io/image/${bankCode}-${accountNumber}-basic.png?amount=${amount}&addInfo=${encodedMessage}`;

      console.log("✅ [generate VietQR] URL QR đã tạo:", vietqrUrl);

      return res.json({
        qrImage: vietqrUrl,
        accountNumber,
        accountName,
        bankCode,
        message,
      });
    } catch (error) {
      console.error(
        "❌ [generate VietQR] Lỗi khi sinh QR VietQR:",
        error.message || error
      );
      res.status(500).json({ message: "Không thể tạo VietQR." });
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
          ], // ✅ thêm dòng này ],
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
          // Thêm include cho ReturnRequest nếu bạn muốn hiển thị trạng thái trả hàng
          {
            model: ReturnRequest, // Giả sử bạn có model ReturnRequest
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
        processing: "Đang xử lý", // Thêm trạng thái này
        shipping: "Đang giao", // Thêm trạng thái này
        delivered: "Đã giao", // Thêm trạng thái này
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
        // Thêm các trường thời gian
        confirmedAt: order.confirmedAt, // Thêm trường này
        shippedAt: order.shippedAt, // Thêm trường này
        deliveredAt: order.deliveredAt, // Thêm trường này
        completedAt: order.completedAt, // Thêm trường này
        cancelledAt: order.cancelledAt, // Thêm trường này
        returnedAt: order.returnedAt, // Thêm trường này (nếu có ReturnRequest)

        paymentMethod: order.paymentMethod
          ? {
              id: order.paymentMethod.id,
              name: order.paymentMethod.name,
              code: order.paymentMethod.code,
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
        returnRequest: order.returnRequest || null, // Thêm returnRequest
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
  static async zaloCallback(req, res) {
    try {
      const data = req.body || req.query;
      const { apptransid, status, zp_trans_id } = data;

      console.log("📥 [ZaloPay Callback] Nhận callback:", data);

      if (!apptransid) {
        return res.status(400).send("Thiếu apptransid");
      }

      const order = await Order.findOne({ where: { orderCode: apptransid } });

      if (!order) {
        return res.status(404).send("Không tìm thấy đơn hàng.");
      }

      if (status === "1") {
        order.paymentStatus = "paid";
        order.paymentTime = new Date();

        // ✅ Lưu lại mã giao dịch thực tế của ZaloPay
        if (zp_trans_id) order.zaloTransId = zp_trans_id;

        await order.save();
        console.log("✅ Cập nhật đơn hàng thành công:", order.orderCode);
      }

      const redirectUrl = `${process.env.BASE_URL}/order-confirmation?orderCode=${order.orderCode}`;
      return res.redirect(redirectUrl);
    } catch (error) {
      console.error("❌ Lỗi xử lý ZaloPay callback:", error);
      return res.status(500).send("Server Error");
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
      const isFromFrontend = Boolean(raw);

      // Parse query params (raw từ FE fetch hoặc query từ redirect)
      const qs = raw
        ? require("querystring").parse(raw, null, null, {
            decodeURIComponent: (v) => v, // KHÔNG decode 2 lần
          })
        : req.query;

      const vnpTxnRef = qs.vnp_TxnRef; // Đây là vnpOrderId
      const rspCode = qs.vnp_ResponseCode;
      const secureHash = qs.vnp_SecureHash;

      console.log("[VNPay CALLBACK] vnpTxnRef:", vnpTxnRef);
      console.log("[VNPay CALLBACK] Response Code:", rspCode);

      // 1. Kiểm tra chữ ký
      const isValid = vnpayService.verifySignature(qs, secureHash);
      if (!isValid) {
        console.warn("❌ Sai chữ ký!");
        return res.status(400).end("INVALID_CHECKSUM");
      }

      // 2. Tìm đơn theo vnpOrderId
      const order = await Order.findOne({
        where: {
          vnpOrderId: {
            [Op.like]: `${vnpTxnRef}%`, // dùng LIKE để match bản ghi có thêm timestamp
          },
        },
      });
      if (!order) {
        console.warn("❌ Không tìm thấy đơn với vnpOrderId:", vnpTxnRef);
        return res.status(404).end("ORDER_NOT_FOUND");
      }

      // 3. Nếu thanh toán thành công
      if (rspCode === "00") {
        order.paymentStatus = "paid";
        order.paymentTime = new Date();
        order.vnpTransactionId = qs.vnp_TransactionNo;
        await order.save();
        console.log(
          `✅ Đơn ${order.orderCode} đã thanh toán VNPay thành công.`
        );
      } else {
        // Giữ trạng thái "waiting", để CRON xử lý sau hoặc cho phép thanh toán lại
        console.log(
          `🔁 Đơn ${order.orderCode} bị huỷ hoặc lỗi VNPay, giữ trạng thái waiting.`
        );
      }

      // 4. Nếu gọi từ frontend (fetch) → chỉ trả kết quả đơn giản
      if (isFromFrontend) return res.end("OK");

      // 5. Nếu redirect từ VNPay → điều hướng về trang xác nhận
      const redirectUrl = `${process.env.BASE_URL}/order-confirmation?orderCode=${order.orderCode}`;
      return res.redirect(redirectUrl);
    } catch (err) {
      console.error("[VNPay CALLBACK] Lỗi xử lý:", err);
      return res.status(500).end("ERROR");
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
  static async stripePay(req, res) {
    try {
      const { orderId } = req.body;
      console.log(
        `[stripePay] Bắt đầu xử lý yêu cầu thanh toán Stripe cho Order ID: ${orderId}`
      );

      const order = await Order.findByPk(orderId);
      if (!order) {
        console.warn(
          `[stripePay] Không tìm thấy đơn hàng với Order ID: ${orderId}`
        );
        return res.status(404).json({ message: "Không tìm thấy đơn hàng" });
      }
      console.log(
        `[stripePay] Đã tìm thấy đơn hàng: ${order.orderCode} với tổng giá: ${order.finalPrice}`
      );

      // Đảm bảo rằng process.env.CLIENT_URL có scheme (http:// hoặc https://)
      // Đây là điểm mấu chốt để khắc phục lỗi "Invalid URL: An explicit scheme must be provided."
      // Bạn nên kiểm tra và sửa biến môi trường CLIENT_URL trong file .env của mình.
      // Ví dụ: CLIENT_URL=https://yourdomain.com hoặc CLIENT_URL=http://localhost:3000
      if (
        !process.env.CLIENT_URL.startsWith("http://") &&
        !process.env.CLIENT_URL.startsWith("https://")
      ) {
        console.error(
          `[stripePay] Lỗi cấu hình CLIENT_URL: Thiếu scheme (http:// hoặc https://).`
        );
        console.error(
          `[stripePay] CLIENT_URL hiện tại: ${process.env.CLIENT_URL}`
        );
        return res
          .status(500)
          .json({
            message:
              "Lỗi cấu hình URL máy khách. Vui lòng kiểm tra biến môi trường CLIENT_URL.",
          });
      }

      const successUrl = `${process.env.CLIENT_URL}/order-confirmation?orderCode=${order.orderCode}`;
      const cancelUrl = `${process.env.CLIENT_URL}/checkout`;

      console.log(`[stripePay] Success URL: ${successUrl}`);
      console.log(`[stripePay] Cancel URL: ${cancelUrl}`);
      console.log(
        `[stripePay] Chuẩn bị tạo Stripe Checkout Session với giá: ${Math.round(
          order.finalPrice
        )} VND`
      );

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency: "vnd",
              unit_amount: Math.round(order.finalPrice), // đơn vị nhỏ nhất (ví dụ: 10000 VND -> 10000)
              product_data: {
                name: `Thanh toán đơn hàng ${order.orderCode}`,
                description: `Mã đơn hàng: ${order.orderCode}, Tổng tiền: ${order.finalPrice} VND`,
              },
            },
            quantity: 1,
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          orderId: order.id,
          orderCode: order.orderCode,
        },
      });

      console.log(
        `[stripePay] Đã tạo Stripe Checkout Session thành công. Session ID: ${session.id}`
      );
      console.log(
        `[stripePay] Chuyển hướng người dùng đến URL: ${session.url}`
      );
      return res.json({ url: session.url });
    } catch (error) {
      console.error(
        "[stripePay] Đã xảy ra lỗi khi tạo session thanh toán Stripe:",
        error
      );
      // Log chi tiết lỗi Stripe nếu có
      if (error.type === "StripeInvalidRequestError") {
        console.error(
          `[stripePay] Lỗi StripeInvalidRequestError: ${error.message}`
        );
        console.error(`[stripePay] Param lỗi: ${error.param}`);
        console.error(`[stripePay] Doc URL: ${error.doc_url}`);
      }
      return res
        .status(500)
        .json({
          message: "Không thể tạo session thanh toán Stripe",
          error: error.message,
        });
    }
  }
  static async handleStripeWebhook(req, res) {
    console.log("--- [Stripe Webhook] Request Received ---");
    console.log("Headers:", req.headers);
    // req.body ở đây *phải* là một Buffer (dạng raw), không phải JSON đã parse
    console.log(
      "Raw Body (should be Buffer/Text):",
      req.body
        ? req.body.toString().substring(0, 500) + "..."
        : "Body is empty/not buffer"
    ); // Log 500 ký tự đầu của body
    console.log("Stripe-Signature Header:", req.headers["stripe-signature"]);

    const sig = req.headers["stripe-signature"];

    let event;
    try {
      // stripe.webhooks.constructEvent cần raw body, KHÔNG phải JSON đã parse
      event = stripe.webhooks.constructEvent(
        req.body, // Đảm bảo đây là Buffer hoặc chuỗi raw
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
      console.log(
        `✅ [Stripe Webhook] Event Constructed Successfully. Type: ${event.type}`
      );
    } catch (err) {
      console.error(
        "❌ [Stripe Webhook] Signature Verification Failed or Event Construction Error:",
        err.message
      );
      // Ghi lại toàn bộ lỗi nếu có để debug
      console.error("[Stripe Webhook] Full Error:", err);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Xử lý các loại sự kiện khác nhau
    switch (event.type) {
      case "checkout.session.completed":
        const session = event.data.object;
        const { orderCode, orderId } = session.metadata || {};

        console.log(
          `✨ [Stripe Webhook] Checkout Session Completed Event Received!`
        );
        console.log(`Session ID: ${session.id}`);
        console.log(`Payment Status (from Stripe): ${session.payment_status}`);
        console.log(`Metadata - OrderCode: ${orderCode}, OrderID: ${orderId}`);
        console.log(`Customer Email: ${session.customer_details?.email}`);
        console.log(`Amount Total: ${session.amount_total}`); // amount_total là cent/vnd, bạn cần chia lại nếu lưu theo đơn vị lớn

        if (!orderCode) {
          console.warn(
            `[Stripe Webhook] Metadata 'orderCode' missing from session for Session ID: ${session.id}`
          );
          return res.status(400).send("Metadata orderCode missing.");
        }

        const t = await sequelize.transaction(); // Bắt đầu transaction
        try {
          const order = await Order.findOne({
            where: { orderCode },
            transaction: t,
          });
          if (!order) {
            console.warn(
              `[Stripe Webhook] Order not found in DB for OrderCode: ${orderCode}`
            );
            await t.rollback();
            return res.status(404).send("Order not found.");
          }
          console.log(
            `[Stripe Webhook] Found Order in DB. Current Status: ${order.status}, PaymentStatus: ${order.paymentStatus}`
          );

          // Kiểm tra nếu thanh toán đã được xử lý trước đó để tránh trùng lặp
          if (order.paymentStatus === "paid" && order.status === "processing") {
            console.log(
              `[Stripe Webhook] Order ${orderCode} already marked as paid/processing. Skipping update.`
            );
            await t.commit(); // Commit transaction dù không thay đổi gì
            return res.status(200).send("OK - Already processed.");
          }

          // Lấy PaymentMethodId cho Stripe
          // Đảm bảo bạn có một record 'Stripe' trong bảng PaymentMethods của mình
          const stripePaymentMethod = await PaymentMethod.findOne({
            where: { code: "stripe" }, // Giả sử code cho Stripe là 'stripe'
            transaction: t,
          });

          if (!stripePaymentMethod) {
            console.error(
              `[Stripe Webhook] ERROR: PaymentMethod with code 'stripe' not found in database!`
            );
            await t.rollback();
            return res
              .status(500)
              .send(
                "Internal Server Error: Stripe payment method not configured."
              );
          }

          // Cập nhật trạng thái đơn hàng
          order.status = "processing"; // Hoặc 'completed' nếu bạn muốn thanh toán xong là hoàn thành luôn
          order.paymentStatus = "paid";
          order.paymentTime = new Date();
          order.stripeSessionId = session.id; // Lưu Stripe Session ID
          order.paymentMethodId = stripePaymentMethod.id; // Gán ID phương thức thanh toán Stripe

          await order.save({ transaction: t });
          console.log(
            `[Stripe Webhook] ✅ Order ${orderCode} updated to status '${order.status}' and paymentStatus '${order.paymentStatus}'.`
          );

          // Gửi email xác nhận, thông báo cho admin, v.v.
          // ... (ví dụ: email cho user)
          const user = await order.getUser(); // Giả sử mối quan hệ User với Order
          if (user) {
            const emailHtml = `
                  <h2>Đơn hàng ${
                    order.orderCode
                  } của bạn đã thanh toán thành công!</h2>
                  <p>Xin chào ${user.fullName || "khách hàng"},</p>
                  <p>Chúng tôi đã nhận được thanh toán cho đơn hàng của bạn.</p>
                  <p>Mã đơn hàng: <b>${order.orderCode}</b></p>
                  <p>Tổng tiền đã thanh toán: <b>${order.finalPrice.toLocaleString(
                    "vi-VN"
                  )}₫</b></p>
                  <p>Phương thức thanh toán: <b>Stripe</b></p>
                  <p>Đơn hàng của bạn đang được xử lý và sẽ sớm được giao.</p>
                  <br />
                  <p>Trân trọng,</p>
                  <p>Đội ngũ hỗ trợ PHT Shop</p>
              `;
            try {
              await sendEmail(
                user.email,
                `Xác nhận thanh toán đơn hàng ${order.orderCode} thành công!`,
                emailHtml
              );
              console.log(
                `[Stripe Webhook] Email xác nhận đã gửi cho ${user.email}`
              );
            } catch (emailErr) {
              console.error(
                "[Stripe Webhook] Lỗi gửi email xác nhận:",
                emailErr
              );
            }
          }

          await t.commit(); // Commit transaction nếu mọi thứ thành công
          console.log(
            `[Stripe Webhook] Transaction committed for Order ${orderCode}.`
          );
          return res.status(200).send("OK");
        } catch (err) {
          await t.rollback(); // Rollback transaction nếu có lỗi
          console.error(
            `[Stripe Webhook] ❌ Error processing checkout.session.completed for OrderCode ${orderCode}:`,
            err
          );
          return res.status(500).send("Server Error processing event.");
        }

      case "payment_intent.succeeded":
        // Đây là sự kiện cho Payment Intent (nếu bạn dùng Payment Element/Card Element)
        // Hiện tại code của bạn dùng Checkout Session, nhưng nếu mở rộng bạn sẽ cần cái này.
        console.log(
          "✨ [Stripe Webhook] Payment Intent Succeeded Event Received."
        );
        console.log("Payment Intent ID:", event.data.object.id);
        // Logic xử lý Payment Intent (nếu có)
        return res.status(200).send("OK"); // Trả về 200 để Stripe biết bạn đã nhận

      case "payment_intent.payment_failed":
        // Xử lý khi Payment Intent thất bại
        console.log(
          "⚠️ [Stripe Webhook] Payment Intent Failed Event Received."
        );
        console.log("Payment Intent ID:", event.data.object.id);
        // Logic xử lý thất bại (cập nhật trạng thái đơn hàng về failed, gửi thông báo...)
        return res.status(200).send("OK");

      // Thêm các trường hợp khác nếu cần (ví dụ: invoice.payment_succeeded, customer.subscription.created, etc.)
      default:
        console.log(`🤷 [Stripe Webhook] Unhandled event type: ${event.type}`);
        // Luôn trả về 200 OK cho các sự kiện không xử lý để tránh Stripe gửi lại nhiều lần
        return res.status(200).send("OK - Unhandled event type.");
    }
  }
  // controllers/client/orderController.js
  // controllers/PaymentController.js
  static async momoCallback(req, res) {
    try {
      const isPost = Object.keys(req.body).length > 0;
      const data = isPost ? req.body : req.query;

      const { orderId, resultCode, transId } = data;

      console.log("🟣 [MoMo CALLBACK] HEADERS:", req.headers);
      console.log("🟡 [MoMo CALLBACK] BODY:", data);
      console.log("🔍 orderId:", orderId);
      console.log("🔍 resultCode:", resultCode);
      console.log("🔍 transId:", transId);

      const isSuccess = Number(resultCode) === 0;

      // Nếu transId không có thì không lưu (chặn redirect giả mạo)
      if (!transId) {
        console.warn("⚠️ transId không tồn tại. Bỏ qua callback từ redirect.");
        return res.end("OK");
      }

      let order = await Order.findOne({ where: { momoOrderId: orderId } });
      if (!order)
        order = await Order.findOne({ where: { orderCode: orderId } });
      if (!order) return res.end("ORDER_NOT_FOUND");

      order.paymentStatus = "paid";
      order.momoTransId = transId;
      order.paymentTime = new Date();
      await order.save();

      console.log("✅ Ghi nhận thanh toán MoMo:", order.toJSON());

      return res.end("OK");
    } catch (err) {
      console.error("[MoMo CALLBACK] ❌ Lỗi xử lý:", err);
      return res.status(500).end("ERROR");
    }
  }

  static async payAgain(req, res) {
    try {
      const { id } = req.params;
      const { bankCode = "" } = req.body;

      const order = await Order.findByPk(id, {
        include: {
          model: PaymentMethod,
          as: "paymentMethod",
          attributes: ["code"],
        },
      });

      // 1. Kiểm tra hợp lệ
      if (
        !order ||
        order.paymentStatus !== "waiting" ||
        order.status !== "processing"
      ) {
        return res
          .status(400)
          .json({ message: "Đơn không hợp lệ để thanh toán lại" });
      }

      const gateway = order.paymentMethod.code.toLowerCase();
      let payUrl = null;

      switch (gateway) {
        case "momo": {
          const momoOrderId = `${order.orderCode}${Date.now()
            .toString()
            .slice(-6)}`;
          const momoRes = await momoService.createPaymentLink({
            orderId: momoOrderId,
            amount: order.finalPrice,
            orderInfo: `Thanh toán lại đơn ${order.orderCode}`,
          });

          if (momoRes.resultCode !== 0)
            return res.status(400).json({ message: "MoMo lỗi", momoRes });

          order.momoOrderId = momoOrderId;
          payUrl = momoRes.payUrl;
          break;
        }

        case "vnpay": {
          const suffix = moment().format("HHmmss"); // hoặc Date.now().toString().slice(-6)
          const vnpOrderId = `${order.orderCode}${suffix}`; // KHÔNG DÙNG DẤU `-`

          order.vnpOrderId = vnpOrderId;

          const amount = order.finalPrice;
          const orderInfo = `Thanh toán lại đơn ${order.orderCode}`;

          payUrl = vnpayService.createPaymentLink({
            orderId: vnpOrderId,
            amount,
            orderInfo,
            bankCode,
          });

          // 🔍 LOG THÔNG TIN DEBUG
          console.log("\n--- [payAgain: VNPAY] ---");
          console.log("✅ orderCode:", order.orderCode);
          console.log("✅ vnpOrderId:", vnpOrderId);
          console.log("✅ amount:", amount);
          console.log("✅ bankCode:", bankCode);
          console.log("✅ orderInfo:", orderInfo);
          console.log("✅ payUrl:", payUrl);
          console.log("--------------------------\n");

          break;
        }

        case "zalopay": {
          const zaloRes = await zaloPayService.createPaymentLink({
            orderId: order.orderCode,
            amount: order.finalPrice,
            orderInfo: order.orderCode,
          });

          if (zaloRes.return_code !== 1)
            return res.status(400).json({ message: "ZaloPay lỗi", zaloRes });

          payUrl = zaloRes.order_url;
          break;
        }
case "stripe": {
  const successUrl = `${process.env.CLIENT_URL}/order-confirmation?orderCode=${order.orderCode}`;
  const cancelUrl = `${process.env.CLIENT_URL}/checkout`;

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "vnd",
          unit_amount: Math.round(order.finalPrice),
          product_data: {
            name: `Thanh toán lại đơn hàng ${order.orderCode}`,
            description: `Mã: ${order.orderCode}, Tổng tiền: ${order.finalPrice} VND`,
          },
        },
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      orderId: order.id,
      orderCode: order.orderCode,
    },
  });

  order.stripeSessionId = session.id;
  payUrl = session.url;

  console.log("\n--- [payAgain: STRIPE] ---");
  console.log("✅ orderCode:", order.orderCode);
  console.log("✅ amount:", order.finalPrice);
  console.log("✅ sessionId:", session.id);
  console.log("✅ payUrl:", payUrl);
  console.log("--------------------------\n");

  break;
}

        case "viettel_money": {
          const billCode = `VT${order.orderCode}${Date.now()
            .toString()
            .slice(-6)}`;
          payUrl = viettelMoneyService.createPaymentLink({
            orderId: order.orderCode,
            billCode,
            amount: order.finalPrice,
            orderInfo: `Thanh toán lại đơn ${order.orderCode}`,
          });
          break;
        }

        default:
          return res.status(400).json({
            message: "Phương thức thanh toán không hỗ trợ thanh toán lại",
          });
      }

      await order.save(); // 💾 Lưu vnpOrderId / momoOrderId nếu có

      return res.json({ payUrl });
    } catch (err) {
      console.error("[payAgain]", err);
      return res
        .status(500)
        .json({ message: "Không tạo được link thanh toán lại" });
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
      const { id } = req.params;

      console.log("DEBUG: req.body nhận được:", req.body);
      console.log("DEBUG: Kiểu của req.body:", typeof req.body);

      const { reason } = req.body || {};
      const reasonText = typeof reason === "string" ? reason : reason?.reason;

      console.log("DEBUG: reasonText:", reasonText);
      console.log("DEBUG: Kiểu của reasonText:", typeof reasonText);

      if (!reasonText?.trim()) {
        return res
          .status(400)
          .json({ message: "Lý do huỷ đơn không được bỏ trống" });
      }

      // Tìm đơn hàng cần hủy
      const order = await Order.findByPk(id);
      if (!order) {
        await t.rollback();
        return res.status(404).json({ message: "Không tìm thấy đơn hàng" });
      }

      // Nếu đơn đã bị huỷ rồi thì không xử lý nữa
      if (order.status === "cancelled") {
        await t.rollback();
        return res.status(400).json({ message: "Đơn hàng đã bị huỷ trước đó" });
      }

      // Cập nhật trạng thái đơn hàng
      order.status = "cancelled";
      order.cancelReason = reasonText;
      await order.save({ transaction: t });

      // Có thể thêm log, notification, hoàn trả coupon, v.v.

      await t.commit();
      return res.status(200).json({ message: "Huỷ đơn hàng thành công" });
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
            model: Order,
            as: "order",
            where: { userId },
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
        if (trackingCode?.trim())
          returnRequest.trackingCode = trackingCode.trim();
        returnRequest.status = "awaiting_pickup";
      } else {
        // GHN tới lấy – trạng thái vẫn là `approved`
        returnRequest.status = "approved";
      }

      await returnRequest.save();

      return res.json({
        message: "Đã cập nhật phương thức hoàn hàng",
        data: returnRequest,
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
      const { id } = req.params;
      const userId = req.user.id;

      // 1️⃣ Tìm ReturnRequest + Order + ShippingAddress + District + Province + Ward + ShippingProvider
      const returnReq = await ReturnRequest.findOne({
        where: { id },
        include: [
          {
            model: Order,
            as: "order",
            where: { userId },
            include: [
              {
                model: OrderItem,
                as: "items",
                include: {
                  model: Sku,
                  attributes: ["weight", "length", "width", "height"],
                },
              },
              {
                model: UserAddress,
                as: "shippingAddress",
                include: [
                  { model: Province, as: "province" },
                  {
                    model: District,
                    as: "district",
                    include: [{ model: Province, as: "Province" }],
                  },
                  { model: Ward, as: "ward" },
                ],
              },
              {
                model: ShippingProvider,
                as: "shippingProvider",
                attributes: ["id", "code", "name"],
              },
            ],
          },
        ],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!returnReq)
        return res
          .status(404)
          .json({ message: "Không tìm thấy yêu cầu trả hàng" });

      const order = returnReq.order;
      const addr = order.shippingAddress;

      // 2️⃣ Xác định provinceId an toàn
      let provinceId = null;
      if (addr.province?.id) {
        provinceId = addr.province.id;
      } else if (addr.district?.province?.id) {
        provinceId = addr.district.province.id;
      } else {
        throw new Error(
          "Không tìm thấy provinceId từ địa chỉ, hãy kiểm tra include & DB!"
        );
      }

      // 3️⃣ Ví dụ: tra ProviderProvince (mapping)
      const provMapResult = await ProviderProvince.findOne({
        where: {
          providerId: order.shippingProvider.id,
          provinceId: provinceId,
        },
      });

      if (!provMapResult) {
        throw new Error(
          `KHÔNG TÌM THẤY mapping ProviderProvince cho providerId=${order.shippingProvider.id}, provinceId=${provinceId}`
        );
      }

      console.log(
        "✅ ProviderProvince found:",
        provMapResult.providerProvinceCode
      );

      // TODO: Book GHN tại đây (gọi API GHN & xử lý response)
      // Ví dụ: const ghnRes = await ghnService.createReturnPickup(...);

      // ✅ 4️⃣ Sau khi book GHN THÀNH CÔNG ⇒ update status ReturnRequest
      returnReq.status = "awaiting_pickup";
      await returnReq.save({ transaction: t });

      await t.commit();
      return res.json({
        message: "Đã book GHN & cập nhật trạng thái trả hàng: awaiting_pickup!",
      });
    } catch (err) {
      await t.rollback();
      console.error("[bookReturnPickup]", err);
      return res.status(500).json({ message: err.message || "Server Error" });
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
        orderId: order.orderCode,
        billCode: `VT-${order.orderCode}`,
        amount: order.finalPrice,
        orderInfo: `Thanh toán đơn ${order.orderCode}`,
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
      const data = Object.keys(req.body).length > 0 ? req.body : req.query;

      if (!viettelMoneyService.verifySignature(data)) {
        return res.status(400).end("INVALID_SIGN");
      }

      const { order_id, error_code, payment_status, vt_transaction_id } = data;

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
  // Trong OrderController.getShippingOptions
  // controllers/client/orderController.js
  // -------------------------------------
  // ... (các import và phần trên giữ nguyên)

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

  static async getPaymentMethods(req, res) {
    try {
      const methods = await PaymentMethod.findAll({
        where: { isActive: true },
        attributes: ["id", "code", "name"],
        order: [["id", "ASC"]],
      });

      return res.json({
        message: "Lấy danh sách phương thức thanh toán thành công",
        data: methods,
      });
    } catch (err) {
      console.error("[getPaymentMethods] Lỗi:", err);
      return res.status(500).json({
        message: "Không thể lấy danh sách phương thức thanh toán",
      });
    }
  }
}

module.exports = OrderController;
