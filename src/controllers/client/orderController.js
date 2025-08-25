const {
  Order,
  OrderItem,
  sequelize,
  FlashSaleCategory,
  UserAddress,
  Province,
  Wallet,
  WalletTransaction,
  Product,
  Coupon,
  Category,
  CouponUser,
  User,
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
  ProviderProvince,
  ProviderDistrict,
  ProviderWard,
  Sku,
  PaymentMethod,
} = require("../../models");
const sendEmail = require("../../utils/sendEmail");
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const axios = require("axios");
const momoService = require("../../services/client/momoService");
const zaloPayService = require("../../services/client/zalopayService");
const vnpayService = require("../../services/client/vnpayService");
const viettelMoneyService = require("../../services/client/viettelMoneyService");
const { Sequelize, Op } = require("sequelize");
const speakeasy = require("speakeasy");
 const { getTrackingByClientCode, getTrackingByOrderCode } = require("../../services/client/drivers/ghnService");

const {
  generateOrderConfirmationHtml,
} = require("../../utils/emailTemplates/orderConfirmationTemplate");
const {
  generateOrderCancellationHtml,
} = require("../../utils/emailTemplates/orderCancellationTemplate");
const mjml2html = require("mjml");
const refundGateway = require("../../utils/refundGateway");
const { processSkuPrices } = require("../../helpers/priceHelper");
const ghnService = require("../../services/client/drivers/ghnService");
const ghtkService = require('../../services/client/drivers/ghtkService');

const moment = require("moment");
const ShippingService = require("../../services/client/shippingService");
async function finalizeCancellation(order, transaction, res, reason = null) {
  order.status = "cancelled";
  order.cancelledAt = new Date();
  if (reason && typeof reason === "string") {
    order.cancelReason = reason.trim();
  }
  await order.save({ transaction });

  await transaction.commit();

  return res.status(200).json({
    message: "Huỷ đơn hàng thành công",
    orderId: order.id,
  });
}

class OrderController {
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
        shippingProviderId,
        shippingService,
        shippingLeadTime,
        shippingFee: bodyShippingFee,
        usePoints = false,
        pointsToSpend = 0,
      } = req.body;
      if (!req.body.shippingProviderId) {
        return res.status(400).json({
          message: "Vui lòng chọn phương thức vận chuyển trước khi đặt hàng.",
        });
      }

      const provider = await ShippingProvider.findByPk(
        req.body.shippingProviderId
      );
      if (!provider || !provider.isActive) {
        return res.status(400).json({
          message: "Phương thức vận chuyển không hợp lệ hoặc không khả dụng.",
        });
      }

      if (!addressId || !items?.length || !paymentMethodId) {
        return res.status(400).json({
          message:
            "Thiếu dữ liệu đơn hàng (địa chỉ, sản phẩm, hoặc phương thức thanh toán).",
        });
      }

      const [validPayment, selectedAddress] = await Promise.all([
        PaymentMethod.findByPk(paymentMethodId),
        UserAddress.findOne({
          where: { id: addressId, userId: user.id },
          include: [
            { model: Province, as: "province" },
            { model: District, as: "district" },
            { model: Ward, as: "ward" },
          ],
        }),
      ]);

      if (!validPayment) {
        return res
          .status(400)
          .json({ message: "Phương thức thanh toán không hợp lệ." });
      }
      if (!selectedAddress) {
        return res
          .status(400)
          .json({ message: "Địa chỉ người dùng không hợp lệ." });
      }
      /** 🔐 BẮT BUỘC GA KHI THANH TOÁN VÍ NỘI BỘ */
      if (validPayment.code?.toLowerCase() === "internalwallet") {
        // lấy mã 6 số từ body
        const gaToken = (req.body.gaToken || "").trim();

        // lấy secret GA của user
        const userRow = await User.findByPk(user.id, {
          attributes: ["wallet2FASecret"],
        });
        if (!userRow?.wallet2FASecret) {
          return res.status(403).json({
            message: "Bạn cần bật Google Authenticator để thanh toán bằng ví.",
          });
        }

        // validate format + verify TOTP
        if (!/^\d{6}$/.test(gaToken)) {
          return res.status(400).json({
            message: "Thiếu hoặc sai mã Google Authenticator (6 số).",
          });
        }

        const ok = speakeasy.totp.verify({
          secret: userRow.wallet2FASecret,
          encoding: "base32",
          token: gaToken,
          window: 1, // +/-30s
        });

        if (!ok) {
          return res.status(400).json({
            message: "Mã Google Authenticator không hợp lệ hoặc đã hết hạn.",
          });
        }
      }
      const now = new Date();
      const skuIdsToFetch = items.map((i) => i.skuId);

      const skuList = await Sku.findAll({
        where: { id: skuIdsToFetch },
        include: [
          {
            model: Product,
            as: "product",
            include: [{ model: Category, as: "category" }],
          },
          {
            model: FlashSaleItem,
            as: "flashSaleSkus",
            required: false,
            include: {
              model: FlashSale,
              as: "flashSale",
              where: {
                isActive: true,
                startTime: { [Op.lte]: now },
                endTime: { [Op.gte]: now },
              },
              required: true,
            },
          },
        ],
      });

      if (skuList.length !== skuIdsToFetch.length) {
        return res.status(400).json({
          message: "Một hoặc nhiều sản phẩm không tồn tại trong hệ thống.",
        });
      }

      const skuMap = new Map(skuList.map((s) => [s.id, s]));
      if (!validPayment) {
        await t.rollback();
        return res
          .status(400)
          .json({ message: "Phương thức thanh toán không hợp lệ." });
      }

      // SỬA LỖI TRUY VẤN: Lấy các FlashSaleItem đang hoạt động bằng cách include model FlashSale
      const allActiveFlashSaleItems = await FlashSaleItem.findAll({
        where: { isActive: true }, // Kiểm tra isActive của FlashSaleItem
        include: [
          {
            model: FlashSale,
            as: "flashSale",
            where: {
              isActive: true,
              startTime: { [Op.lte]: now },
              endTime: { [Op.gte]: now },
            },
            required: true,
          },
        ],
      });
      const allActiveFlashSaleItemsMap = new Map();
      for (const item of allActiveFlashSaleItems) {
        if (!allActiveFlashSaleItemsMap.has(item.skuId)) {
          allActiveFlashSaleItemsMap.set(item.skuId, []);
        }
        allActiveFlashSaleItemsMap.get(item.skuId).push(item);
      }

      // SỬA LỖI TRUY VẤN: Lấy các Category Deal đang hoạt động bằng cách include model FlashSale
      const allActiveCategoryDeals = await FlashSaleCategory.findAll({
        where: { isActive: true }, // Kiểm tra isActive của FlashSaleCategory
        include: [
          {
            model: FlashSale,
            as: "flashSale",
            where: {
              isActive: true,
              startTime: { [Op.lte]: now },
              endTime: { [Op.gte]: now },
            },
            required: true,
          },
        ],
      });
      const allActiveCategoryDealsMap = new Map();
      allActiveCategoryDeals.forEach((deal) => {
        const existingDeals =
          allActiveCategoryDealsMap.get(deal.categoryId) || [];
        existingDeals.push(deal);
        allActiveCategoryDealsMap.set(deal.categoryId, existingDeals);
      });
      let totalPrice = 0;
      const orderItemsToCreate = [];
      const orderItemsForEmail = [];
      for (const it of items) {
        const sku = skuMap.get(it.skuId);
        if (!sku) {
          return res
            .status(400)
            .json({ message: `Không tìm thấy SKU ${it.skuId}` });
        }
        if (it.quantity > sku.stock) {
          return res.status(400).json({
            message: `Sản phẩm "${sku.skuCode}" chỉ còn ${sku.stock} trong kho.`,
          });
        }
        const fsItemsForSku = allActiveFlashSaleItemsMap.get(sku.id) || [];
        const skuData = {
          id: sku.id,
          originalPrice: sku.originalPrice,
          price: sku.price,
          Product: { category: { id: sku.product.categoryId } },
          flashSaleSkus: fsItemsForSku,
        };
        const priceResult = processSkuPrices(
          skuData,
          allActiveFlashSaleItemsMap,
          allActiveCategoryDealsMap
        );

        totalPrice += priceResult.price * it.quantity;

        let flashSaleItemId = null;
        let flashSaleIdForOrderItem = null;

        if (
          priceResult.flashSaleInfo?.type === "item" &&
          !priceResult.flashSaleInfo.isSoldOut
        ) {
          flashSaleIdForOrderItem = priceResult.flashSaleInfo.flashSaleId;
          const bestFsItem = fsItemsForSku.find(
            (fsItem) => fsItem.flashSaleId === flashSaleIdForOrderItem
          );
          flashSaleItemId = bestFsItem?.id || null;
        }

        orderItemsToCreate.push({
          skuId: it.skuId,
          quantity: it.quantity,
          price: priceResult.price,
          flashSaleId: flashSaleItemId,
        });
        orderItemsForEmail.push({
          productName: sku.product.name,
          quantity: it.quantity,
          price: priceResult.price,
        });
      }

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

        if (!couponRecord) {
          return res.status(400).json({
            message: "Mã giảm giá không hợp lệ hoặc đã hết hiệu lực.",
          });
        }

        const usedByOthers = await Order.count({
          where: {
            couponId: couponRecord.id,
            status: { [Op.notIn]: ["cancelled", "failed"] },
          },
        });

        if (
          couponRecord.totalQuantity &&
          usedByOthers >= couponRecord.totalQuantity
        ) {
          return res
            .status(400)
            .json({ message: "Mã giảm giá đã hết lượt sử dụng." });
        }

        const couponUser = await CouponUser.findOne({
          where: { userId: user.id, couponId: couponRecord.id },
          transaction: t,
          lock: t.LOCK.UPDATE,
        });

        if (
          couponUser &&
          couponUser.used >= (couponRecord.maxUsagePerUser || 1)
        ) {
          await t.rollback();
          return res
            .status(400)
            .json({ message: "Bạn đã sử dụng mã này tối đa." });
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
          ) {
            couponDiscount = couponRecord.maxDiscountValue;
          }
        }
      }

      let shippingFee = Number(bodyShippingFee) || 0;
      let finalServiceCode = shippingService;
      let finalProviderId = shippingProviderId;
      let calculatedLeadTime = shippingLeadTime
        ? new Date(shippingLeadTime)
        : null;

      if (shippingFee === 0 || !shippingProviderId) {
        let weight = 0,
          maxL = 0,
          maxW = 0,
          maxH = 0;
        for (const item of orderItemsToCreate) {
          const sku = skuMap.get(item.skuId);
          weight += (sku.weight || 500) * item.quantity;
          maxL = Math.max(maxL, sku.length || 10);
          maxW = Math.max(maxW, sku.width || 10);
          maxH = Math.max(maxH, sku.height || 10);
        }
        weight = Math.max(1, weight);

        const defaultProvider = await ShippingProvider.findOne({
          where: { code: "ghn" },
        });
        if (!defaultProvider) {
          throw new Error("Hãng vận chuyển mặc định không được tìm thấy.");
        }
        finalProviderId = defaultProvider.id;

        const calcFeeParams = {
          providerId: finalProviderId,
          toProvince: selectedAddress.province.id,
          toDistrict: selectedAddress.district.id,
          toWard: selectedAddress.ward.id,
          weight,
          length: maxL,
          width: maxW,
          height: maxH,
          provinceName: selectedAddress.province.name,
          districtName: selectedAddress.district.name,
          wardName: selectedAddress.ward.name,
          serviceCode: finalServiceCode,
        };

        const {
          fee,
          leadTime,
          serviceCode: newServiceCode,
        } = await ShippingService.calcFee(calcFeeParams);
        shippingFee = fee;
        calculatedLeadTime = leadTime;
        finalServiceCode = newServiceCode || finalServiceCode;
        finalProviderId = defaultProvider.id;
      }

      shippingDiscount = Math.min(shippingDiscount, shippingFee);

      let pointDiscountAmount = 0;
      if (usePoints && pointsToSpend > 0) {
        const usablePoints =
          (await UserPoint.sum("points", { where: { userId: user.id } })) -
          (await UserPoint.sum("points", {
            where: { userId: user.id, type: "spend" },
          }));

        if (usablePoints < pointsToSpend) {
          await t.rollback();
          return res
            .status(400)
            .json({ message: `Bạn chỉ có ${usablePoints} điểm khả dụng.` });
        }

        const pointsConversionRate = 4000;
        pointDiscountAmount = pointsToSpend * pointsConversionRate;

        const tempFinalPriceForPointCheck =
          totalPrice - couponDiscount + shippingFee - shippingDiscount;
        if (pointDiscountAmount > tempFinalPriceForPointCheck) {
          pointDiscountAmount = tempFinalPriceForPointCheck;
        }
      }

      const finalPrice = Math.max(
        0,
        totalPrice -
          couponDiscount +
          shippingFee -
          shippingDiscount -
          pointDiscountAmount
      );

      const paymentStatus = [
        "momo",
        "vnpay",
        "zalopay",
        "atm",
        "stripe",
      ].includes(validPayment.code.toLowerCase())
        ? "waiting"
        : validPayment.code.toLowerCase() === "internalwallet"
        ? "paid"
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
          pointDiscount: pointDiscountAmount,
          shippingProviderId: finalProviderId,
          shippingService: finalServiceCode,
          shippingLeadTime: calculatedLeadTime,
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
      
      // 
      // ---------------- TẠO VẬN ĐƠN ----------------
      try {
        // tính khối lượng + kích thước đơn hàng
        let weight = 0, maxL = 0, maxW = 0, maxH = 0;
        for (const item of orderItemsToCreate) {
          const sku = skuMap.get(item.skuId);
          weight += (sku.weight || 500) * item.quantity;
          maxL = Math.max(maxL, sku.length || 10);
          maxW = Math.max(maxW, sku.width || 10);
          maxH = Math.max(maxH, sku.height || 10);
        }
        weight = Math.max(1, weight);

        const fullUserAddress = [
          selectedAddress.streetAddress,
          selectedAddress.ward?.name,
          selectedAddress.district?.name,
          selectedAddress.province?.name,
        ].filter(Boolean).join(", ");

        let deliveryRes = null;

        if (provider.code === "ghn") {
          // GHN
          deliveryRes = await ghnService.createDeliveryOrder({
            from_name: "Cyberzone Shop",
            from_phone: "0878999894",
            from_address: process.env.SHOP_ADDRESS,
            to_name: selectedAddress.fullName,
            to_phone: selectedAddress.phone,
            to_address: fullUserAddress,
            to_province_id: selectedAddress.province.id,
            to_district_id: selectedAddress.district.id,
            to_ward_id: Number(selectedAddress.ward.id),
            weight,
            length: maxL,
            width: maxW,
            height: maxH,
            cod_amount: validPayment.code.toLowerCase() === "cod" ? finalPrice : 0,
            client_order_code: newOrder.orderCode,
            items: orderItemsForEmail,
            content: "Đơn hàng từ Cyberzone",
            situation: "shop_pays",
          });
       } else if (provider.code === "ghtk") {
  const normalizedWeight = Math.max(0.1, weight / 1000); // gram → kg
  deliveryRes = await ghtkService.createDropoffOrder({
    client_order_code: newOrder.orderCode,
    from_name: "Cyberzone Shop",
    from_phone: "0878999894",
    from_address: process.env.SHOP_ADDRESS,
    from_province_name: process.env.SHOP_PROVINCE || "TP. Hồ Chí Minh",
    from_district_name: process.env.SHOP_DISTRICT || "Thành phố Thủ Đức",
    to_name: selectedAddress.fullName,
    to_phone: selectedAddress.phone,
    to_address: fullUserAddress,
    to_province_name: selectedAddress.province.name,
    to_district_name: selectedAddress.district.name,
    to_ward_name: selectedAddress.ward?.name || undefined,
    hamlet: "Khác",
    weight: normalizedWeight,
    length: maxL,
    width: maxW,
    height: maxH,
    items: orderItemsForEmail,
    content: "Đơn hàng từ Cyberzone",
  });
}


        if (deliveryRes) {
          await newOrder.update({
            trackingCode: deliveryRes.trackingCode,
            labelUrl: deliveryRes.labelUrl,
            shippingLeadTime: deliveryRes.expectedDelivery || calculatedLeadTime,
          }, { transaction: t });
        }
      } catch (err) {
        console.error("Lỗi tạo vận đơn:", err.message);
        // tuỳ logic: rollback toàn bộ hay vẫn commit đơn không có vận đơn
      }
      // ---------------- END VẬN ĐƠN ----------------

// 
      if (validPayment.code.toLowerCase() === "internalwallet") {
        const wallet = await Wallet.findOne({
          where: { userId: user.id },
          transaction: t,
          lock: t.LOCK.UPDATE,
        });

        if (!wallet || Number(wallet.balance) < finalPrice) {
          await t.rollback();
          return res
            .status(400)
            .json({ message: "Số dư ví không đủ để thanh toán." });
        }

        // Trừ tiền
        wallet.balance = Number(wallet.balance) - finalPrice;
        await wallet.save({ transaction: t });

        // Ghi giao dịch
        await WalletTransaction.create(
          {
            walletId: wallet.id,
            type: "purchase",
            amount: finalPrice,
            description: `Thanh toán đơn hàng ${
              newOrder?.orderCode || "[chưa tạo]"
            }`,
          },
          { transaction: t }
        );
      }
      if (validPayment.code.toLowerCase() === "vnpay") {
        newOrder.vnpOrderId = `${newOrder.orderCode}-${Date.now()}`;
        await newOrder.save({ transaction: t });
      }

      for (const item of orderItemsToCreate) {
        const sku = skuMap.get(item.skuId);
        await OrderItem.create(
          { orderId: newOrder.id, ...item },
          { transaction: t }
        );
        await sku.decrement("stock", { by: item.quantity, transaction: t });

        if (item.flashSaleId) {
          const fsItemLocked = await FlashSaleItem.findOne({
            where: { id: item.flashSaleId },
            transaction: t,
            lock: t.LOCK.UPDATE,
          });
          if (fsItemLocked) {
            const newQuantity = Math.max(
              0,
              (fsItemLocked.quantity || 0) - item.quantity
            );
            const newSoldCount = (fsItemLocked.soldCount || 0) + item.quantity;
            await fsItemLocked.update(
              {
                quantity: newQuantity,
                soldCount: newSoldCount,
              },
              { transaction: t }
            );
          }
        }
      }

      if (couponRecord) {
        const [couponUser] = await CouponUser.findOrCreate({
          where: { userId: user.id, couponId: couponRecord.id },
          defaults: { used: 0 },
          transaction: t,
          lock: t.LOCK.UPDATE,
        });

        await couponUser.increment("used", { by: 1, transaction: t });
        await couponRecord.increment("usedCount", { by: 1, transaction: t });
      }

      if (cartItemIds.length) {
        await CartItem.destroy({ where: { id: cartItemIds }, transaction: t });
      }

      if (usePoints && pointsToSpend > 0 && pointDiscountAmount > 0) {
        await UserPoint.create(
          {
            userId: user.id,
            orderId: newOrder.id,
            points: -pointsToSpend,
            type: "spend",
            description: `Sử dụng ${pointsToSpend} điểm cho đơn ${newOrder.orderCode}`,
          },
          { transaction: t }
        );
      }
      const rewardPointsConversionRate = 4000;
      const rewardPoints = Math.floor(finalPrice / rewardPointsConversionRate);
      if (rewardPoints > 0) {
        await UserPoint.create(
          {
            userId: user.id,
            orderId: newOrder.id,
            points: rewardPoints,
            type: "earn",
            description: `Tặng ${rewardPoints} điểm từ đơn ${newOrder.orderCode}`,
            expiresAt: new Date(Date.now() + 1 * 60 * 1000),
          },
          { transaction: t }
        );
      }

      const payCode = validPayment.code.toLowerCase();

      let title = "Đơn hàng đã được tạo";
      let message = `Đơn ${newOrder.orderCode} đã được tạo.`;

      if (paymentStatus === "paid") {
        title = "Đặt hàng thành công";
        message = `Đơn ${newOrder.orderCode} đã được đặt thành công.`;
      } else if (["momo", "vnpay", "zalopay", "stripe"].includes(payCode)) {
        title = "Đơn hàng đã tạo – chờ thanh toán";
        message = `Đơn ${newOrder.orderCode} đã được tạo. Vui lòng thanh toán trong 15 phút để tránh hủy đơn tự động.`;
      } else if (payCode === "atm") {
        title = "Đơn hàng đã được tạo – chờ xác nhận";
        message = `Đơn ${newOrder.orderCode} đã được tạo. Chờ admin duyệt thanh toán.`;
      } else if (payCode === "cod") {
        title = "Đơn hàng đã được tạo";
        message = `Đơn ${newOrder.orderCode} đã được tạo. Vui lòng thanh toán khi nhận hàng.`;
      }

      const clientNotification = await Notification.create(
        {
          title,
          message,
          slug: `order-${newOrder.orderCode}`,
          type: "order",
          targetRole: "client",
          targetId: newOrder.id,
          link: `/user-profile/orders/${newOrder.orderCode}`,
          isGlobal: false,
        },
        { transaction: t }
      );

      await NotificationUser.create(
        {
          notificationId: clientNotification.id,
          userId: user.id,
          isRead: false,
        },
        { transaction: t }
      );

      const buyer = await User.findByPk(user.id, {
        attributes: ["fullName"],
        transaction: t,
      });

      await Notification.create(
        {
          title: "Có đơn hàng mới",
          message: `Đơn ${newOrder.orderCode} vừa được đặt bởi ${
            buyer?.fullName || "Khách hàng"
          }.`,
          slug: `order-admin-${newOrder.orderCode}`,
          type: "order",
          targetRole: "admin",
          targetId: newOrder.id,
          link: `/admin/orders/${newOrder.id}`,
          isGlobal: true,
        },
        { transaction: t }
      );

      const addressParts = [
        selectedAddress.streetAddress,
        selectedAddress.ward ? selectedAddress.ward.name : null,
        selectedAddress.district ? selectedAddress.district.name : null,
        selectedAddress.province ? selectedAddress.province.name : null,
      ].filter((part) => part);

      const fullUserAddress = addressParts.join(", ");

      const mjmlContent = generateOrderConfirmationHtml({
        orderCode: newOrder.orderCode,
        finalPrice: newOrder.finalPrice,
        totalPrice: newOrder.totalPrice,
        paymentMethodName: validPayment.name,
        shippingFee: newOrder.shippingFee,
        couponDiscount: newOrder.couponDiscount,
        pointDiscountAmount: newOrder.pointDiscount,
        rewardPoints,
        userName: selectedAddress.fullName,
        userPhone: selectedAddress.phone,
        userAddress: fullUserAddress,
        orderItems: orderItemsForEmail,
        companyName: "Cyberzone",
        companyLogoUrl:
          "https://res.cloudinary.com/dzrp2hsvh/image/upload/v1753761547/uploads/ohs6h11zyavrv2haky9f.png",
        companyAddress: "Trương Vĩnh Nguyên, phường Cái Răng, Cần Thơ",
        companyPhone: "0878999894",
        companySupportEmail: "contact@cyberzone.com",
        orderDetailUrl: `https://your-frontend-domain.com/user-profile/orders/${newOrder.orderCode}`,
      });

      const { html: emailHtml } = mjml2html(mjmlContent);
      try {
        await sendEmail(
          user.email,
          `Đơn hàng ${newOrder.orderCode} của bạn`,
          emailHtml
        );
      } catch (emailErr) {
        console.error("Lỗi gửi email:", emailErr);
      }

      await t.commit();

      return res.status(201).json({
        message: "Đặt hàng thành công",
        orderId: newOrder.id,
        orderCode: newOrder.orderCode,
        couponDiscount,
        shippingDiscount,
        pointDiscountAmount,
        rewardPoints,
        trackingCode: newOrder.trackingCode,
  labelUrl: newOrder.labelUrl,
        finalPrice: newOrder.finalPrice,
        shippingFee,
        shippingProviderId: finalProviderId,
        shippingService: finalServiceCode,
        shippingLeadTime: calculatedLeadTime,
      });
    } catch (err) {
      await t.rollback();
      let errorMessage = "Lỗi khi tạo đơn hàng";
      if (axios.isAxiosError(err) && err.response?.data?.message) {
        errorMessage = `Lỗi từ hãng vận chuyển: ${err.response.data.message}`;
      } else if (err.message) {
        errorMessage = err.message;
      }
      console.error("Lỗi tạo đơn hàng:", err);
      return res.status(500).json({ message: errorMessage });
    }
  }

 
static async getById(req, res) {
  try {
    const user = req.user;
    const raw = (req.params.code ?? req.params.id ?? req.query.code ?? "")
      .toString()
      .trim();
    if (!raw) return res.status(400).json({ message: "Thiếu mã đơn hàng" });

    const isNumeric = /^\d+$/.test(raw);
    const where = {
      ...(user?.id ? { userId: user.id } : {}),
      [Op.or]: [
        ...(isNumeric ? [{ id: Number(raw) }] : []),
        { orderCode: raw },
        { momoOrderId: raw },
        { vnpOrderId: raw },
      ],
    };

    const order = await Order.findOne({
      where,
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
          model: ShippingProvider,
          as: "shippingProvider",
          attributes: ["id", "name", "code"],
        },
        { model: ReturnRequest, as: "returnRequest" },
      ],
    });

    if (!order)
      return res.status(404).json({ message: "Không tìm thấy đơn hàng" });

    const [earnedPoint, spentPoint] = await Promise.all([
      UserPoint.findOne({
        where: {
          userId: user?.id ?? order.userId,
          orderId: order.id,
          type: "earn",
        },
      }),
      UserPoint.findOne({
        where: {
          userId: user?.id ?? order.userId,
          orderId: order.id,
          type: "spend",
        },
      }),
    ]);

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

    // ⚡ Gọi tracking từ GHN
    let ghnTracking = null;
    if (order.shippingProvider?.code === "ghn") {
      try {
        if (order.orderCode) {
          ghnTracking = await getTrackingByClientCode(order.orderCode);
        }
        if (!ghnTracking && order.trackingCode) {
          ghnTracking = await getTrackingByOrderCode(order.trackingCode);
        }
      } catch (err) {
        console.warn("[Order getById] GHN tracking warn:", err.message);
      }
    }

    const result = {
      id: order.id,
      orderCode: order.orderCode,
      status: order.status,
      statusText: statusTextMap[order.status] || "Không xác định",
      totalPrice: order.totalPrice,
      finalPrice: order.finalPrice,
      shippingFee: order.shippingFee,
      shippingDiscount: order.shippingDiscount,
      couponDiscount: order.couponDiscount,
      productDiscount,
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
      rewardPoints: earnedPoint?.points || 0,
      usedPoints: spentPoint?.points || 0,
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

      // ✅ Tracking GHN nếu có
      tracking: ghnTracking,
    };

    return res.json({ message: "Lấy đơn hàng thành công", data: result });
  } catch (error) {
    console.error("Lỗi khi lấy chi tiết đơn hàng:", error);
    return res.status(500).json({ message: "Lỗi máy chủ khi lấy đơn hàng" });
  }
}

  static async getByCodePublic(req, res) {
    try {
      const orderCode = req.params.code?.trim();

      const order = await Order.findOne({
        where: {
          [Op.or]: [
            { orderCode },
            { momoOrderId: orderCode },
            { vnpOrderId: orderCode },
            { payosOrderId: orderCode }, // hỗ trợ PayOS numeric code
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
                  attributes: ["id", "name", "thumbnail"],
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
            model: ShippingProvider,
            as: "shippingProvider",
            attributes: ["id", "name", "code"],
          },
          { model: ReturnRequest, as: "returnRequest" },
        ],
      });

      if (!order) {
        return res.status(404).json({ message: "Không tìm thấy đơn hàng" });
      }

      // Mapping dữ liệu giống getById
      const result = {
        id: order.id,
        orderCode: order.orderCode,
        paymentStatus: order.paymentStatus,
        paymentTime: order.paymentTime,
        orderStatus: order.orderStatus,
        totalPrice: order.totalPrice,
        finalPrice: order.finalPrice,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        payosOrderId: order.payosOrderId,
        payosTransactionId: order.payosTransactionId,
        momoOrderId: order.momoOrderId,
        vnpOrderId: order.vnpOrderId,
        shippingAddress: order.shippingAddress
          ? {
              fullName: order.shippingAddress.fullName,
              phone: order.shippingAddress.phone,
              address: order.shippingAddress.address,
              province: order.shippingAddress.province?.name,
              district: order.shippingAddress.district?.name,
              ward: order.shippingAddress.ward?.name,
            }
          : null,
        paymentMethod: order.paymentMethod,
        shippingProvider: order.shippingProvider,
        items:
          order.items?.map((item) => ({
            id: item.id,
            quantity: item.quantity,
            price: item.price,
            discount: item.discount,
            finalPrice: item.finalPrice,
            product: item.Sku?.product
              ? {
                  id: item.Sku.product.id,
                  name: item.Sku.product.name,
                  thumbnail: item.Sku.product.thumbnail,
                }
              : null,
          })) || [],
        returnRequest: order.returnRequest || null,
      };

      return res.json({ message: "Lấy đơn hàng thành công", data: result });
    } catch (error) {
      console.error("❌ Lỗi khi lấy đơn hàng public:", error);
      return res.status(500).json({ message: "Lỗi máy chủ" });
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
      const page = Math.max(parseInt(req.query.page ?? "1", 10), 1);
      const limit = Math.max(parseInt(req.query.limit ?? "10", 10), 1);
      const offset = (page - 1) * limit;

      const { rows: ordersFromDb, count: totalItems } =
        await Order.findAndCountAll({
          where: { userId },
          include: [
            {
              model: OrderItem,
              as: "items",
              include: [
                {
                  model: Sku,
                  required: false,
                  attributes: ["id", "skuCode", "originalPrice", "stock"],
                  include: [
                    {
                      model: Product,
                      as: "product",
                      required: false,
                      paranoid: false,
                      attributes: ["id", "name", "thumbnail"],
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
                "cancelledBy",
              ],
              include: [
                {
                  model: ReturnRequestItem,
                  as: "items",
                  attributes: ["skuId", "quantity"],
                  required: false,
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
            {
              model: UserPoint,
              as: "pointLogs",
              where: { type: "earn" },
              required: false,
              attributes: ["points"],
            },
          ],
          order: [["createdAt", "DESC"]],
          limit,
          offset,
          distinct: true,
        });

      const formattedOrders = (ordersFromDb || []).map((order) => ({
        id: order.id,
        status: order.status,
        paymentStatus: order.paymentStatus,
        finalPrice: order.finalPrice,
        orderCode: order.orderCode,
        createdAt: order.createdAt,
        trackingCode: order.trackingCode || null,
  expectedDelivery: order.shippingLeadTime
    ? new Date(order.shippingLeadTime).toISOString()
    : null,
        rewardPoints:
          order.pointLogs && order.pointLogs.length > 0
            ? order.pointLogs.reduce((sum, p) => sum + p.points, 0)
            : 0,
        returnRequest: order.returnRequest
          ? {
              id: order.returnRequest.id,
              status: order.returnRequest.status,
              returnCode: order.returnRequest.returnCode,
              deadlineChooseReturnMethod:
                order.returnRequest.deadlineChooseReturnMethod,
              returnMethod: order.returnRequest.returnMethod || null,
              cancelledBy: order.returnRequest.cancelledBy || null,
              items:
                order.returnRequest.items?.map((item) => ({
                  skuId: item.skuId,
                  quantity: item.quantity,
                })) || [],
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
              province: { name: order.shippingAddress.province?.name },
            }
          : null,
        products: order.items.map((item) => {
          const productInfo = item.Sku?.product;
          const skuInfo = item.Sku;
          const pricePaid = item.price;
          const originalPriceFromSku = skuInfo?.originalPrice || 0;
          const rawStock = skuInfo?.stock;
          const stockNum =
            rawStock === null || rawStock === undefined
              ? null
              : Number(rawStock);
          const isOutOfStock =
            stockNum === null || Number.isNaN(stockNum) || stockNum <= 0;
          return {
            skuId: item.skuId,
            name: productInfo?.name || "Sản phẩm không tồn tại",
            imageUrl: productInfo?.thumbnail || "/images/default.jpg",
            quantity: item.quantity,
            price: pricePaid,
            originalPrice: originalPriceFromSku || priceToShow,

            variation: skuInfo?.skuCode || "",
            isOutOfStock,
          };
        }),
      }));

      return res.json({
        message: "Lấy danh sách đơn hàng thành công",
        data: formattedOrders,
        pagination: {
          totalItems,
          totalPages: Math.ceil(totalItems / limit),
          currentPage: page,
          limit,
        },
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

      if (["shipping", "delivered", "completed"].includes(order.status)) {
        await t.rollback();
        return res
          .status(400)
          .json({ message: "Đơn hàng không thể huỷ ở trạng thái hiện tại" });
      }

      const paid = order.paymentStatus === "paid";
      const payCode = order.paymentMethod?.code?.toLowerCase();

      if (paid && ["momo", "vnpay", "zalopay", "stripe"].includes(payCode)) {
        const payload = {
          orderCode: order.orderCode,
          amount: order.finalPrice,
        };

        if (payCode === "momo") {
          if (!order.momoTransId)
            return res
              .status(400)
              .json({ message: "Thiếu thông tin giao dịch MoMo" });
          payload.momoTransId = order.momoTransId;
        } else if (payCode === "vnpay") {
          if (!order.vnpTransactionId || !order.paymentTime)
            return res
              .status(400)
              .json({ message: "Thiếu thông tin giao dịch VNPay" });
          payload.vnpTransactionId = order.vnpTransactionId;
          payload.originalAmount = order.finalPrice;
          payload.transDate = order.paymentTime;
        } else if (payCode === "stripe") {
          if (!order.stripePaymentIntentId)
            return res
              .status(400)
              .json({ message: "Thiếu stripePaymentIntentId" });
          payload.stripePaymentIntentId = order.stripePaymentIntentId;
        } else if (payCode === "zalopay") {
          if (!order.zaloTransId || !order.zaloAppTransId)
            return res
              .status(400)
              .json({ message: "Thiếu thông tin giao dịch ZaloPay" });
          payload.zp_trans_id = order.zaloTransId;
          payload.app_trans_id = order.zaloAppTransId;
          payload.amount = Math.round(Number(order.finalPrice));
        }

        const { ok, transId } = await refundGateway(payCode, payload);
        if (!ok) {
          await t.rollback();
          return res.status(400).json({ message: "Hoàn tiền thất bại" });
        }

        order.paymentStatus = "refunded";
        order.gatewayTransId = transId || null;
      } else if (
        (payCode === "payos" && paid) ||
        payCode === "cod" ||
        (payCode === "internalwallet" && paid) ||
        (payCode === "atm" && paid)
      ) {
        const wallet = await Wallet.findOne({
          where: { userId: order.userId },
          transaction: t,
        });
        if (!wallet) {
          await t.rollback();
          return res
            .status(400)
            .json({ message: "Không tìm thấy ví người dùng" });
        }

        wallet.balance = (
          Number(wallet.balance || 0) + Number(order.finalPrice || 0)
        ).toFixed(2);
        await wallet.save({ transaction: t });

        await WalletTransaction.create(
          {
            userId: order.userId,
            walletId: wallet.id,
            orderId: order.id,
            type: "refund",
            amount: order.finalPrice,
            description: `Hoàn tiền do huỷ đơn hàng ${
              order.orderCode
            } (${payCode.toUpperCase()})`,
          },
          { transaction: t }
        );

        order.paymentStatus = "refunded";
        order.gatewayTransId = null;
      } else {
        order.paymentStatus = "unpaid";
      }

      order.status = "cancelled";
      order.cancelReason = reasonText.trim();
      await order.save({ transaction: t });

      const orderItems = await OrderItem.findAll({
        where: { orderId: order.id },
        transaction: t,
      });

      for (const item of orderItems) {
        if (item.flashSaleId) {
          await FlashSaleItem.update(
            {
              quantity: Sequelize.literal(`quantity + ${item.quantity}`),
              soldCount: Sequelize.literal(`soldCount - ${item.quantity}`),
            },
            { where: { id: item.flashSaleId }, transaction: t }
          );
        }

        await Sku.increment(
          { stock: item.quantity },
          { where: { id: item.skuId }, transaction: t }
        );
      }

      await UserPoint.destroy({
        where: { orderId: order.id, userId: order.userId, type: "earn" },
        transaction: t,
      });

      if (order.couponId != null) {
        await CouponUser.decrement("used", {
          by: 1,
          where: { userId: order.userId, couponId: order.couponId },
          transaction: t,
        });

        await Coupon.decrement("usedCount", {
          by: 1,
          where: { id: order.couponId },
          transaction: t,
        });
      }

      const slug = `user-cancel-order-${order.orderCode}`;
      let clientNotif;

      const existingNotif = await Notification.findOne({ where: { slug } });

      if (!existingNotif) {
        clientNotif = await Notification.create(
          {
            title: "Đơn hàng bị huỷ",
            message: `Đơn ${
              order.orderCode
            } đã bị huỷ. Lý do: ${reasonText.trim()}`,
            slug,
            type: "order",
            targetRole: "client",
            targetId: order.id,
            link: `/user-profile/orders/${order.orderCode}`,
            isGlobal: false,
          },
          { transaction: t }
        );

        await NotificationUser.create(
          { notificationId: clientNotif.id, userId: order.userId },
          { transaction: t }
        );
      } else {
        clientNotif = existingNotif;
      }

      const adminNotif = await Notification.create(
        {
          title: "Có đơn hàng bị huỷ",
          message: `Đơn ${
            order.orderCode
          } vừa bị huỷ bởi người dùng. Lý do: ${reasonText.trim()}`,
          slug: `admin-cancel-order-${order.orderCode}`,
          type: "order",
          targetRole: "admin",
          targetId: order.id,
          link: `/admin/orders/${order.id}`,
          isGlobal: true,
        },
        { transaction: t }
      );

      req.app.locals.io
        .to(`user-${order.userId}`)
        .emit("new-client-notification", clientNotif);

      req.app.locals.io
        .to("admin-room")
        .emit("new-admin-notification", adminNotif);
      const user = await User.findByPk(order.userId, { transaction: t });
      if (user?.email) {
        const emailMjmlContent = generateOrderCancellationHtml({
          orderCode: order.orderCode,
          cancelReason: order.cancelReason,
          userName: user.fullName || user.email || "Khách hàng",
          orderDetailUrl: `https://your-frontend-domain.com/user-profile/orders/${order.orderCode}`,
          companyName: "Cyberzone",
          companyLogoUrl:
            "https://res.cloudinary.com/dzrp2hsvh/image/upload/v1753761547/uploads/ohs6h11zyavrv2haky9f.png",
          companyAddress: "Trương Vĩnh Nguyên, phường Cái Răng, Cần Thơ",
          companyPhone: "0878999894",
          companySupportEmail: "contact@cyberzone.com",
        });

        const { html: emailHtml } = mjml2html(emailMjmlContent);
        try {
          await sendEmail(
            user.email,
            `Đơn hàng ${order.orderCode} đã bị hủy`,
            emailHtml
          );
        } catch (emailErr) {
          console.error(
            `[cancel] Lỗi gửi email huỷ đơn ${order.orderCode}:`,
            emailErr
          );
        }
      }

      await t.commit();
      return res
        .status(200)
        .json({ message: "Huỷ đơn hàng thành công", orderId: order.id });
    } catch (err) {
      await t.rollback();
      console.error("[cancel][ERROR]", err);
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
              include: [{ model: Product, as: "product" }],
            },
          ],
        },
        {
          model: PaymentMethod,
          as: "paymentMethod",
          attributes: ["id", "name", "code"],
        },
      ],
      attributes: [
        "id",
        "orderCode",
        "status",
        "totalPrice",
        "finalPrice",          // ✅ thêm
        "paymentStatus",       // ✅ thêm
        "shippingProviderId",
        "shippingServiceId",
        "shippingFee",
   
       
        "createdAt",
        "updatedAt",
      ],
    });

    if (!order)
      return res.status(404).json({ message: "Không tìm thấy đơn hàng" });

    const plain = order.get({ plain: true });

    // fallback nếu finalPrice null → lấy totalPrice
    if (!plain.finalPrice || plain.finalPrice === 0) {
      plain.finalPrice = plain.totalPrice || plain.items.reduce(
        (acc, item) => acc + item.price * item.quantity,
        0
      );
    }

    // build địa chỉ
    const ward = plain.shippingAddress?.wardId
      ? await Ward.findByPk(plain.shippingAddress.wardId)
      : null;
    const district = plain.shippingAddress?.districtId
      ? await District.findByPk(plain.shippingAddress.districtId)
      : null;
    const province = plain.shippingAddress?.provinceId
      ? await Province.findByPk(plain.shippingAddress.provinceId)
      : null;

    const fullAddress = [
      plain.shippingAddress?.streetAddress,
      ward?.name,
      district?.name,
      province?.name,
    ].filter(Boolean).join(", ");

    const responseData = {
      id: plain.id,
      code: plain.orderCode,
      status: plain.status,
      paymentStatus: plain.paymentStatus,
      createdAt: plain.createdAt,
      updatedAt: plain.updatedAt,
      shippingProviderId: plain.shippingProviderId,
      shippingServiceId: plain.shippingServiceId,
      shippingFee: plain.shippingFee,
      totalPrice: plain.totalPrice,
      finalPrice: plain.finalPrice, // ✅ frontend hiển thị luôn có
      paymentMethod: plain.paymentMethod?.name || "Không rõ",
      paymentMethodCode: plain.paymentMethod?.code || null,
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

      const district = await District.findByPk(districtId, {
        include: [Province],
      });
      const ward = await Ward.findByPk(wardId);

      if (!district || !district.Province)
        return res.status(400).json({ message: "Không tìm thấy tỉnh/huyện." });
      if (!ward)
        return res.status(400).json({ message: "Không tìm thấy phường/xã." });

      const toProvinceId = district.Province.id;
      const toDistrictId = district.id;
      const toWardId = ward.id;
      const toProvinceName = district.Province.name;
      const toDistrictName = district.name;
      const toWardName = ward.name;

      const skuList = await Sku.findAll({
        where: { id: items.map((i) => i.skuId) },
      });
      const skuMap = Object.fromEntries(skuList.map((s) => [s.id, s]));
      let weight = 0,
        maxL = 0,
        maxW = 0,
        maxH = 0;
      const orderValue = items.reduce((sum, it) => {
        const sku = skuMap[it.skuId];
        if (!sku) return sum;
        weight += (sku.weight || 500) * it.quantity;
        maxL = Math.max(maxL, sku.length || 10);
        maxW = Math.max(maxW, sku.width || 10);
        maxH = Math.max(maxH, sku.height || 10);
        return sum + (it.price || 0) * (it.quantity || 1);
      }, 0);
      weight ||= 1;
      maxL ||= 1;
      maxW ||= 1;
      maxH ||= 1;

      const providers = await ShippingProvider.findAll({
        where: { isActive: true },
      });
      if (!providers.length)
        return res
          .status(404)
          .json({ message: "Không có hãng vận chuyển nào đang hoạt động." });

      const options = await Promise.all(
        providers.map(async (p) => {
          try {
            console.log("[getShippingOptions] Tổng weight:", weight, "gram");

            const { fee, leadTime } = await ShippingService.calcFee({
              providerId: p.id,
              toProvince: toProvinceId,
              toDistrict: toDistrictId,
              toWard: toWardId,
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
              `[getShippingOptions] Bỏ qua ${p.name} (${p.code}) – Lỗi: ${err.message}`
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
