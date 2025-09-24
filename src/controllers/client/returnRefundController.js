const {
  Order,
  OrderItem,
  sequelize,
  UserAddress,
  Province,
  User,
  Product,
  ReturnRequest,
  RefundRequest,
  Sku,
  PaymentMethod,
  ReturnRequestItem,
  Notification,
  NotificationUser,
  District,
  Ward,
  ShippingProvider,
  ProviderProvince,
  ProviderDistrict,
  ProviderWard,
} = require("../../models"); // Điều chỉnh đường dẫn models cho đúng với cấu trúc dự án của bạn
const ghnService = require("../../services/client/drivers/ghnService");
const ghtkService = require("../../services/client/drivers/ghtkService"); // 💥 thêm dòng này
const sendEmail = require("../../utils/sendEmail"); // Điều chỉnh đường dẫn utils cho đúng
const refundGateway = require("../../utils/refundGateway"); // Điều chỉnh đường dẫn utils cho đúng
const ShippingService = require("../../services/client/shippingService"); // Điều chỉnh đường dẫn services cho đúng
const {
  buildFullAddress,
} = require("../../services/client/drivers/ghnService");
const { Op } = require("sequelize");
const {
  buildContentFromItems,
} = require("../../services/client/drivers/ghnService");

// Import template
const {
  generateReturnRequestHtml,
} = require("../../utils/emailTemplates/generateReturnRequestHtml");

class ReturnRefundController {
  static async requestReturn(req, res) {
    const t = await sequelize.transaction();
    try {
      const { orderId, reason, itemsToReturn, detailedReason } = req.body;
      const userId = req.user.id;

      const parsedOrderId = Number(orderId);
      if (isNaN(parsedOrderId)) {
        await t.rollback();
        return res.status(400).json({ message: "orderId không hợp lệ" });
      }

      if (!reason || reason.trim() === "") {
        await t.rollback();
        return res
          .status(400)
          .json({ message: "Vui lòng chọn lý do hoàn hàng" });
      }

      const reasonToSituation = {
        WRONG_SIZE_COLOR: "seller_pays",
        NOT_AS_DESCRIBED: "seller_pays",
        DEFECTIVE: "seller_pays",
        CHANGE_MIND: "customer_pays",
        ORDER_BY_MISTAKE: "customer_pays",
        FOUND_BETTER_PRICE: "customer_pays",
        OTHER: "customer_pays", // ✅ thêm
      };

      const situation = reasonToSituation[reason];
      if (!situation) {
        await t.rollback();
        return res.status(400).json({ message: "Lý do trả hàng không hợp lệ" });
      }

      let parsedItems;
      try {
        parsedItems = JSON.parse(itemsToReturn);
        if (!Array.isArray(parsedItems) || parsedItems.length === 0) {
          throw new Error();
        }
      } catch {
        await t.rollback();
        return res
          .status(400)
          .json({ message: "Vui lòng chọn ít nhất một sản phẩm để trả" });
      }

      const skuIds = parsedItems.map((item) => item.skuId);

      const order = await Order.findOne({
        where: { id: parsedOrderId, userId },
        include: [
          { model: User, attributes: ["id", "email"] },
          {
            model: OrderItem,
            as: "items",
            attributes: ["skuId", "quantity", "price"],
            include: [
              {
                model: Sku,
                attributes: ["id"],
                include: [
                  { model: Product, as: "product", attributes: ["id", "name"] },
                ],
              },
            ],
          },
        ],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!order) {
        await t.rollback();
        return res.status(404).json({ message: "Không tìm thấy đơn hàng" });
      }

      if (!["completed", "delivered"].includes(order.status)) {
        await t.rollback();
        return res.status(400).json({
          message: "Chỉ có thể trả hàng với đơn đã giao hoặc hoàn thành",
        });
      }

      const validSkuIds = order.items.map((i) => i.skuId);
      const invalidSkuIds = skuIds.filter((id) => !validSkuIds.includes(id));
      if (invalidSkuIds.length > 0) {
        await t.rollback();
        return res.status(400).json({
          message: `Sản phẩm trả hàng không nằm trong đơn: ${invalidSkuIds.join(
            ", "
          )}`,
        });
      }

      const existing = await ReturnRequest.findOne({
        where: { orderId: parsedOrderId },
      });
      if (
        existing &&
        !(existing.status === "cancelled" && existing.cancelledBy === "user")
      ) {
        await t.rollback();
        return res
          .status(400)
          .json({ message: "Đơn hàng đã có yêu cầu trả hàng trước đó" });
      }

      const imageFiles = Array.isArray(req.files?.images)
        ? req.files.images
        : [];
      const videoFiles = Array.isArray(req.files?.videos)
        ? req.files.videos
        : [];

      if (imageFiles.length === 0) {
        await t.rollback();
        return res
          .status(400)
          .json({ message: "Vui lòng tải lên ít nhất 1 hình ảnh bằng chứng" });
      }
      if (imageFiles.length > 6) {
        await t.rollback();
        return res
          .status(400)
          .json({ message: "Chỉ được tải lên tối đa 6 hình ảnh" });
      }
      if (videoFiles.length > 1) {
        await t.rollback();
        return res.status(400).json({ message: "Chỉ được tải lên 1 video" });
      }

      const imageUrls = imageFiles.map((f) => f.path).join(",") || null;
      const videoUrls = videoFiles.map((f) => f.path).join(",") || null;

      // 1) Tổng tiền hàng gốc (sau flashsale, chưa trừ coupon/point)
      const totalItemsSubtotal = order.items.reduce(
        (sum, oi) => sum + Number(oi.price) * Number(oi.quantity),
        0
      );

      // 2) Tổng tiền của các item chọn trả
      const selectedItemsSubtotal = parsedItems.reduce((sum, it) => {
        const oi = order.items.find((x) => x.skuId === it.skuId);
        if (!oi) return sum;
        const qty = Math.min(Number(it.quantity), Number(oi.quantity));
        return sum + Number(oi.price) * qty;
      }, 0);

      // 3) Số tiền khách thực trả cho phần hàng (đã trừ coupon & điểm)
      const couponDiscount = Number(order.couponDiscount || 0);
      const pointDiscount = Number(order.pointDiscount || 0);
      const itemsCashPaid = Math.max(
        0,
        totalItemsSubtotal - couponDiscount - pointDiscount
      );

      // 4) Tính phần hoàn cho sản phẩm theo tỷ lệ
      let refundAmount = 0;
      if (totalItemsSubtotal > 0) {
        refundAmount =
          (selectedItemsSubtotal / totalItemsSubtotal) * itemsCashPaid;
      }

      // 5) Nếu trả toàn bộ & seller_pays → cộng phí ship
      const isReturningAll = order.items.every((oi) => {
        const selected = parsedItems.find((pi) => pi.skuId === oi.skuId);
        return selected && Number(selected.quantity) === Number(oi.quantity);
      });
      if (isReturningAll && situation === "seller_pays") {
        refundAmount += Number(order.shippingFee || 0);
      }

      // 6) Chặn hoàn nhiều hơn số tiền đã trả
      refundAmount = Math.round(refundAmount);
      refundAmount = Math.min(
        refundAmount,
        Number(order.finalPrice || refundAmount)
      );

      const returnReq = await ReturnRequest.create(
        {
          orderId: parsedOrderId,
          reason,
          detailedReason: detailedReason?.trim() || null,
          evidenceImages: imageUrls,
          evidenceVideos: videoUrls,
          status: "pending",
          returnCode: "RR" + Date.now(),
          situation,
          returnFee: 0,
          refundAmount,
        },
        { transaction: t }
      );

      for (const item of parsedItems) {
        if (!item.quantity || item.quantity <= 0) {
          await t.rollback();
          return res
            .status(400)
            .json({ message: `Số lượng không hợp lệ cho SKU ${item.skuId}` });
        }
        await ReturnRequestItem.create(
          {
            returnRequestId: returnReq.id,
            skuId: item.skuId,
            quantity: item.quantity,
          },
          { transaction: t }
        );
      }

      const adminNotifTitle = "Có yêu cầu trả hàng mới";
      const adminNotifMessage = `Đơn hàng ${order.orderCode} có yêu cầu trả hàng mới. Vui lòng xem xét và xử lý.`;

      const adminNotification = await Notification.create(
        {
          title: adminNotifTitle,
          message: adminNotifMessage,
          slug: `admin-return-request-${returnReq.id}`,
          type: "order",
          targetRole: "admin",
          targetId: returnReq.id,
          link: `/admin/return-requests/${returnReq.id}`,
          isGlobal: true,
        },
        { transaction: t }
      );

      await t.commit();

      // Gửi email cho admin bằng template HTML
      const adminHtml = generateReturnRequestHtml({
        orderCode: order.orderCode,
        reason,
        detailedReason,
        situation,
        refundAmount,
        returnFee: 0,
        returnCode: returnReq.returnCode,
        orderItems: parsedItems.map((i) => {
          const oi = order.items.find((o) => o.skuId === i.skuId);
          return {
            productName: oi?.Sku?.product?.name || `SKU ${i.skuId}`,

            quantity: i.quantity,
            price: oi.price,
          };
        }),

        evidenceImages: imageFiles.map((f) => f.path),
        evidenceVideos: videoFiles.map((f) => f.path),
      });

      await sendEmail(
        process.env.ADMIN_EMAIL,
        "Có yêu cầu trả hàng mới",
        adminHtml
      );

      req.app.locals.io
        .to("admin-room")
        .emit("new-admin-notification", adminNotification);

      return res.status(201).json({
        message: "Đã gửi yêu cầu trả hàng thành công",
        data: returnReq,
      });
    } catch (err) {
      if (!t.finished) {
        await t.rollback();
      }
      console.error("🔥 Lỗi server khi gửi yêu cầu trả hàng:", err);
      return res
        .status(500)
        .json({ message: "Lỗi server khi gửi yêu cầu trả hàng" });
    }
  }

  static async getReturnRequestDetail(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const returnRequest = await ReturnRequest.findOne({
        where: { id },
        include: [
          {
            model: Order,
            as: "order",
            include: [
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
                attributes: ["code", "name"],
              },
            ],
          },
          {
            model: ReturnRequestItem,
            as: "items",
            include: [
              {
                model: Sku,
                as: "sku",
                include: [{ model: Product, as: "product" }],
              },
            ],
          },
          {
            model: RefundRequest,
            as: "refundRequest",
            attributes: [
              "id",
              "amount",
              "status",
              "refundedAt",
              "responseNote",
              "createdAt",
            ],
            required: false,
          },
        ],
      });

      if (
        !returnRequest ||
        !returnRequest.order ||
        returnRequest.order.userId !== userId
      ) {
        return res.status(404).json({ message: "Không tìm thấy đơn trả hàng" });
      }

      // Lấy số tiền hoàn từ DB
      const refundAmount = Number(returnRequest.refundAmount || 0);
      const returnFee = Number(returnRequest.returnFee || 0);

      // Xác định nơi hoàn tiền
      const order = returnRequest.order;
      const pmCode = String(order?.paymentMethod?.code || "").toLowerCase();

      let refundDestination = "Không rõ";

      if (order?.paymentStatus === "unpaid") {
        refundDestination = "Chưa thanh toán";
      } else if (pmCode === "momo") {
        refundDestination = "Ví MoMo";
      } else if (pmCode === "vnpay") {
        refundDestination = "Ví VNPay";
      } else if (pmCode === "zalopay") {
        refundDestination = "ZaloPay";
      } else if (pmCode === "atm") {
        refundDestination = "Chuyển khoản ngân hàng";
      } else if (pmCode === "stripe") {
        refundDestination = "Thẻ quốc tế (Stripe)";
      } else if (["internalwallet", "cod", "payos"].includes(pmCode)) {
        refundDestination = "Tài khoản CYBERZONE";
      } else if (!pmCode) {
        if (order?.momoOrderId) refundDestination = "Ví MoMo";
        else if (order?.vnpTransactionId) refundDestination = "Ví VNPay";
        else if (order?.zaloTransId) refundDestination = "ZaloPay";
        else if (order?.stripePaymentIntentId)
          refundDestination = "Thẻ quốc tế (Stripe)";
      }

      // Thông tin vận chuyển/hoàn trả
      const shipmentInfo = {
        provider: returnRequest.returnProviderCode || "ghn", // 👈 fallback luôn "ghn"
        returnMethod: returnRequest.returnMethod || null, // 👈 thêm dòng này
        serviceName: returnRequest.returnServiceName || null,
        trackingCode: returnRequest.trackingCode || null,
        labelUrl: returnRequest.returnLabelUrl || null,
        dropoffType: returnRequest.returnDropoffType || null,
        expectedDeliveryAt: returnRequest.expectedDeliveryAt || null,
        returnFee,
      };
      let trackingInfo = null;
      try {
        if (
          shipmentInfo.provider?.toLowerCase() === "ghn" &&
          shipmentInfo.trackingCode
        ) {
          trackingInfo = await ghnService.getTrackingByOrderCode(
            shipmentInfo.trackingCode
          );
        }
      } catch (trackingErr) {
        console.warn("Không lấy được tracking GHN:", trackingErr.message);
      }

      const response = {
        ...returnRequest.toJSON(),
        refundAmount, // lấy trực tiếp từ DB
        refundDestination,
        tracking: trackingInfo, // 👈 thay vì chỉ logs
        shipmentInfo,
      };

      return res.json({ data: response });
    } catch (error) {
      console.error("getReturnRequestDetail error:", error);
      return res.status(500).json({ message: "Lỗi server" });
    }
  }

  static async cancelReturnRequest(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const returnRequest = await ReturnRequest.findOne({
        where: { id },
        include: {
          model: Order,
          as: "order",
          where: { userId },
          required: true,
        },
      });

      if (!returnRequest) {
        return res
          .status(404)
          .json({ message: "Không tìm thấy yêu cầu trả hàng" });
      }

      if (!["pending", "approved"].includes(returnRequest.status)) {
        return res
          .status(400)
          .json({ message: "Không thể hủy yêu cầu ở trạng thái hiện tại" });
      }

      returnRequest.status = "cancelled";
      returnRequest.responseNote = "Người dùng tự hủy yêu cầu";
      returnRequest.cancelledBy = "user"; // 👈 thêm dòng này
      await returnRequest.save();

      return res.json({ message: "Đã hủy yêu cầu trả hàng thành công" });
    } catch (err) {
      console.error("[cancelReturnRequest]", err);
      return res
        .status(500)
        .json({ message: "Lỗi server khi hủy yêu cầu trả hàng" });
    }
  }

  static async chooseReturnMethod(req, res) {
    try {
      const { id } = req.params;
      const { returnMethod } = req.body;
      const userId = req.user.id;

      const returnRequest = await ReturnRequest.findOne({
        where: { id },
        include: [
          { model: Order, as: "order", where: { userId }, required: true },
        ],
      });

      if (!returnRequest) {
        return res
          .status(404)
          .json({ message: "Không tìm thấy yêu cầu trả hàng" });
      }
      if (returnRequest.returnMethod) {
        return res.status(400).json({
          message:
            "Bạn đã chọn phương thức trả hàng rồi. Không thể thay đổi nữa.",
        });
      }
      if (returnRequest.status !== "approved") {
        return res.status(400).json({
          message:
            "Chỉ có thể chọn phương thức hoàn hàng khi yêu cầu ở trạng thái đã duyệt",
        });
      }
      if (
        returnRequest.deadlineChooseReturnMethod &&
        new Date() > new Date(returnRequest.deadlineChooseReturnMethod)
      ) {
        return res.status(400).json({
          message:
            "Đã quá hạn chọn phương thức hoàn hàng, yêu cầu đã hết hiệu lực",
        });
      }
      if (!["ghn_pickup", "self_send"].includes(returnMethod)) {
        return res
          .status(400)
          .json({ message: "Phương thức hoàn hàng không hợp lệ" });
      }

      // ✅ Chỉ lưu method + thời điểm. KHÔNG đổi status ở đây.
      returnRequest.returnMethod = returnMethod;
      returnRequest.dateChooseReturnMethod = new Date();
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

  static async bookReturnPickup(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;
      const userId = req.user.id;

      console.log(
        "🔄 [bookReturnPickup] Start - ReturnRequest ID:",
        id,
        "UserID:",
        userId
      );

      // 1. Tìm ReturnRequest + Order
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
                include: [
                  {
                    model: Sku,
                    attributes: ["weight", "length", "width", "height"],
                    include: [
                      { model: Product, as: "product", attributes: ["name"] },
                    ],
                  },
                ],
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

      if (!returnReq) {
        await t.rollback();
        return res
          .status(404)
          .json({ message: "Không tìm thấy yêu cầu trả hàng" });
      }

      const order = returnReq.order;
      const addr = order.shippingAddress;
      let providerCode = order.shippingProvider?.code?.toLowerCase() || "ghn";

      if (providerCode !== "ghn") {
        console.warn(
          `[bookReturnPickup] providerCode DB=${providerCode}, ép sang 'ghn'`
        );
        providerCode = "ghn";
      }

      // 2. Mapping GHN
      const { ghnWardCode, ghnDistId } =
        await ghnService.getGhnCodesFromLocalDb({
          province: addr.province?.id,
          district: addr.district?.id,
          ward: addr.ward?.id,
        });

      if (!ghnWardCode || !ghnDistId) {
        throw new Error("Không tìm thấy mã GHN cho địa chỉ trả hàng.");
      }

      // 3. Kích thước & trọng lượng (giống getPickupFee)
      const MIN = 10;
      const items = order.items;
      if (!items?.length)
        throw new Error("Không có sản phẩm nào trong đơn hàng để trả.");

      const totalWeight =
        items.reduce(
          (s, it) =>
            s + (Number(it?.sku?.weight) || 100) * (Number(it?.quantity) || 1),
          0
        ) || 100;

      const totalLength = Math.max(
        MIN,
        ...items.map((it) => Number(it?.sku?.length) || MIN)
      );

      const totalWidth = Math.max(
        MIN,
        ...items.map((it) => Number(it?.sku?.width) || MIN)
      );

      const totalHeight = Math.max(
        MIN,
        items.reduce(
          (s, it) =>
            s + (Number(it?.sku?.height) || MIN) * (Number(it?.quantity) || 1),
          0
        )
      );

      console.log("📦 [bookReturnPickup] Kiện hàng:", {
        totalWeight,
        totalLength,
        totalWidth,
        totalHeight,
      });

      // 4. Payload GHN
      const ghnPayload = {
        from_name: addr?.fullName || addr?.name || "Khách hàng",

        from_phone: addr?.phone || "0123456789",
        from_address: buildFullAddress(
          addr?.streetAddress || addr?.address,
          addr?.ward?.name,
          addr?.district?.name,
          addr?.province?.name
        ),

        from_district_id: addr.district?.id,
        from_ward_id: addr.ward?.id,
        from_province_id: addr.province?.id,

        to_name: process.env.SHOP_NAME || "Kho Shop",
        to_phone: process.env.SHOP_PHONE || "0987654321",
        to_address: buildFullAddress(
          process.env.SHOP_ADDRESS || "Kho mặc định",
          process.env.SHOP_WARD_NAME,
          process.env.SHOP_DISTRICT_NAME,
          process.env.SHOP_PROVINCE_NAME
        ),

        to_ward_code: process.env.SHOP_WARD_CODE,
        to_district_id: process.env.SHOP_DISTRICT_CODE,

        weight: totalWeight,
        length: totalLength,
        width: totalWidth,
        height: totalHeight,
        client_order_code: `RTN-${id}-${Date.now()}`,
        items: order.items, // 👈 thêm dòng này
        content: buildContentFromItems(order.items, "Trả hàng từ khách"),
        situation: returnReq.situation || "customer_pays",
      };

      console.log("📦 [bookReturnPickup] GHN Payload gửi đi:", ghnPayload);

      // 5. Gọi GHN service
      const { trackingCode, labelUrl, expectedDelivery, shippingFee, paidBy } =
        await ghnService.bookPickup(ghnPayload);

      if (!trackingCode) throw new Error("GHN không trả về mã vận đơn.");

      console.log("📦 [bookReturnPickup] shippingFee từ GHN:", shippingFee);

      // 6. Update DB
      returnReq.status = "awaiting_pickup";
      returnReq.trackingCode = trackingCode;
      returnReq.returnLabelUrl = labelUrl; // 👈 dùng field returnLabelUrl
      returnReq.returnFee = shippingFee; // 👈 dùng field returnFee (total_fee GHN)
      returnReq.returnFeePayer = paidBy; // 👈 ai trả phí
      // Nếu shop chịu phí thì returnFee = 0
      if (returnReq.situation === "seller_pays") {
        returnReq.returnFee = 0;
        returnReq.returnFeePayer = "seller";
      } else {
        returnReq.returnFee = shippingFee;
        returnReq.returnFeePayer = "customer";
      }

      console.log(
        "💾 [bookReturnPickup] returnFee trước khi save:",
        returnReq.returnFee
      );

      await returnReq.save({ transaction: t });

      console.log(
        "✅ [bookReturnPickup] returnFee sau khi save:",
        returnReq.returnFee
      );

      await t.commit();

      return res.json({
        message: "Đã book GHN & cập nhật trạng thái trả hàng.",
        trackingCode,
        labelUrl,
        expectedDelivery,
        shippingFee,
        paidBy,
      });
    } catch (err) {
      await t.rollback();
      console.error(
        "❌ [bookReturnPickup]",
        err?.response?.data || err.message
      );
      return res.status(500).json({ message: err.message || "Server Error" });
    }
  }

  static async getReturnRequestByCode(req, res) {
    try {
      const { code } = req.params;
      const userId = req.user.id;

      const returnRequest = await ReturnRequest.findOne({
        where: { returnCode: code },
        include: [
          {
            model: Order,
            as: "order",
            where: { userId },
          },
          {
            model: ReturnRequestItem,
            as: "items",
            include: [
              {
                model: Sku,
                as: "sku",
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

      if (!returnRequest) {
        return res
          .status(404)
          .json({ message: "Không tìm thấy yêu cầu trả hàng" });
      }

      return res.json({ data: returnRequest });
    } catch (err) {
      console.error("[getReturnRequestByCode]", err);
      return res
        .status(500)
        .json({ message: "Lỗi server khi lấy yêu cầu trả hàng theo mã" });
    }
  }

  // controllers/client/returnRefundController.js
  static async getPickupFee(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      // 1) Lấy RR + địa chỉ + items
      const rr = await ReturnRequest.findOne({
        where: { id },
        include: [
          {
            model: Order,
            as: "order",
            where: { userId },
            include: [
              {
                model: UserAddress,
                as: "shippingAddress",
                include: [
                  { model: Province, as: "province" },
                  { model: District, as: "district" },
                  { model: Ward, as: "ward" },
                ],
              },
            ],
          },
          {
            model: ReturnRequestItem,
            as: "items",
            include: [
              {
                model: Sku,
                as: "sku",
                attributes: ["weight", "length", "width", "height"],
              },
            ],
          },
        ],
      });
      if (!rr)
        return res.status(404).json({ message: "Không tìm thấy yêu cầu" });

      const addr = rr.order?.shippingAddress;
      if (!addr)
        return res.status(400).json({ message: "Thiếu địa chỉ lấy hàng" });

      // 2) Tính kiện (W/L/W/H)
      const MIN = 10;
      const items = rr.items || [];
      const weight =
        items.reduce(
          (s, it) =>
            s + (Number(it?.sku?.weight) || 100) * (Number(it?.quantity) || 1),
          0
        ) || 100;
      const length = Math.max(
        MIN,
        ...items.map((it) => Number(it?.sku?.length) || MIN)
      );
      const width = Math.max(
        MIN,
        ...items.map((it) => Number(it?.sku?.width) || MIN)
      );
      const height = Math.max(
        MIN,
        items.reduce(
          (s, it) =>
            s + (Number(it?.sku?.height) || MIN) * (Number(it?.quantity) || 1),
          0
        )
      );

      // 3) Lấy provider GHN
      const ghnProvider = await ShippingProvider.findOne({
        where: { code: "ghn" },
        attributes: ["id", "code"],
      });
      if (!ghnProvider)
        return res
          .status(400)
          .json({ message: "Không tìm thấy nhà vận chuyển GHN" });

      // 4) Resolve mã GHN thực từ DB nội bộ (nếu có)
      //    => dùng làm override để tránh lỗi "không tìm thấy mã huyện"
      const { ghnProvId, ghnDistId, ghnWardCode } =
        await ghnService.getGhnCodesFromLocalDb({
          province: addr.province?.id,
          district: addr.district?.id,
          ward: addr.ward?.id,
        });

      // 5) Gọi ShippingService (driver GHN) + bơm providerRawCodes để dùng mã GHN trực tiếp
      const { fee } = await ShippingService.calcFee({
        providerId: ghnProvider.id,

        // KH -> SHOP (trả hàng): interface calcFee hiện tại dùng to* cho địa chỉ KH
        toProvince: addr.province?.id,
        toDistrict: addr.district?.id,
        toWard: addr.ward?.id,

        weight,
        length,
        width,
        height,
        serviceCode: rr.returnServiceId || null,
        orderValue: 0,

        // 👇 Override: truyền thẳng mã GHN nếu mapping nội bộ thiếu
        providerRawCodes: {
          toDistrictId: ghnDistId || undefined, // số
          toWardCode: ghnWardCode != null ? String(ghnWardCode) : undefined, // string
        },
      });

      return res.json({
        data: { provider: "ghn", type: "pickup", fee: Number(fee || 0) },
      });
    } catch (e) {
      console.error("[getPickupFee] error:", e?.response?.data || e.message);
      return res.status(500).json({ message: "Lỗi server", error: e?.message });
    }
  }

  // GET /api/client/return-refund/:id/dropoff-services
  static async getDropoffServices(req, res) {
    const t0 = Date.now();

    // helper gộp kiện ngay trong hàm
    const computeParcel = (items = []) => {
      // Tổng cân nặng (gram)
      const totalWeight =
        items.reduce((sum, it) => {
          const w = Number(it?.sku?.weight) || 100; // fallback 100g
          const q = Number(it?.quantity) || 1;
          return sum + w * q;
        }, 0) || 100;

      // Heuristic kích thước (cm):
      //  - L = max(length các SKU)
      //  - W = max(width  các SKU)
      //  - H = tổng(height * quantity) (xếp chồng)
      const MIN = 10;
      const length = Math.max(
        MIN,
        ...items.map((it) => Number(it?.sku?.length) || MIN)
      );
      const width = Math.max(
        MIN,
        ...items.map((it) => Number(it?.sku?.width) || MIN)
      );
      const height = Math.max(
        MIN,
        items.reduce((sum, it) => {
          const h = Number(it?.sku?.height) || MIN;
          const q = Number(it?.quantity) || 1;
          return sum + h * q;
        }, 0)
      );

      return { totalWeight, length, width, height };
    };

    try {
      const { id } = req.params;
      const userId = req.user.id;
      console.log("[getDropoffServices] start", { id, userId });

      const returnReq = await ReturnRequest.findOne({
        where: { id },
        include: [
          {
            model: Order,
            as: "order",
            where: { userId },
            include: [
              {
                model: UserAddress,
                as: "shippingAddress",
                include: [
                  { model: Province, as: "province" },
                  { model: District, as: "district" },
                  { model: Ward, as: "ward" },
                ],
              },
            ],
          },
          {
            model: ReturnRequestItem,
            as: "items",
            include: [
              {
                model: Sku,
                as: "sku",
                attributes: ["weight", "length", "width", "height"],
              },
            ],
          },
        ],
      });

      if (!returnReq) {
        console.log("[getDropoffServices] returnReq not found");
        return res.status(404).json({ message: "Không tìm thấy yêu cầu" });
      }

      if (
        !(
          returnReq.status === "approved" ||
          (returnReq.status === "awaiting_pickup" &&
            returnReq.returnMethod === "self_send")
        )
      ) {
        console.log(
          "[getDropoffServices] invalid status:",
          returnReq.status,
          returnReq.returnMethod
        );
        return res.status(400).json({
          message: "Trạng thái yêu cầu không hợp lệ để lấy dịch vụ bưu cục",
        });
      }

      const addr = returnReq.order?.shippingAddress;
      if (!addr) {
        console.log("[getDropoffServices] no shippingAddress");
        return res.status(400).json({ message: "Không có địa chỉ giao hàng" });
      }

      // 👉 Tính kiện từ danh sách SKU
      const items = returnReq.items || [];
      const { totalWeight, length, width, height } = computeParcel(items);
      console.log("[getDropoffServices] parcel computed", {
        itemCount: items.length,
        totalWeight,
        length,
        width,
        height,
      });

      // ----- CHỈ GHN -----
      const code = "ghn";
      const driver = ShippingService.drivers?.[code];

      if (!driver || typeof driver.getDropoffServices !== "function") {
        console.log("[getDropoffServices] GHN driver missing or invalid");
        // fallback mock khi chưa cấu hình driver
        return res.json({
          data: [
            {
              provider: "ghn",
              providerName: "GHN (mock)",
              serviceCode: "GHN_DROPOFF",
              serviceName: "GHN - Gửi tại bưu cục (mock)",
              fee: 0,
              leadTime: 2,
              dropoffPoints: [],
            },
          ],
          tookMs: Date.now() - t0,
        });
      }

      let services = [];
      try {
        // 🚚 Truyền đủ W/L/H/Weight xuống GHN
        services = await driver.getDropoffServices({
          toProvince: addr.province?.id,
          toDistrict: addr.district?.id,
          toWard: addr.ward?.id,
          weight: totalWeight,
          length,
          width,
          height,
          orderValue: 0, // nếu có bảo hiểm thì truyền giá trị cần bảo hiểm
        });
        console.log(
          "[getDropoffServices] GHN return:",
          Array.isArray(services) ? services.length : 0
        );
      } catch (e) {
        console.error(
          "[getDropoffServices] GHN error:",
          e?.response?.data || e.message || e
        );
      }

      const data = (services || []).map((svc) => ({
        provider: code,
        providerName: "GHN",
        serviceCode: svc.code,
        serviceName: svc.name,
        fee: svc.fee ?? null,
        leadTime: svc.leadTime ?? null,
        dropoffPoints: Array.isArray(svc.dropoffPoints)
          ? svc.dropoffPoints
          : [],
      }));

      if (data.length === 0) {
        console.log("[getDropoffServices] no service from GHN, return mock");
        return res.json({
          data: [
            {
              provider: "ghn",
              providerName: "GHN (mock)",
              serviceCode: "GHN_DROPOFF",
              serviceName: "GHN - Gửi tại bưu cục (mock)",
              fee: 0,
              leadTime: 2,
              dropoffPoints: [],
            },
          ],
          tookMs: Date.now() - t0,
        });
      }

      console.log("[getDropoffServices] done", {
        count: data.length,
        tookMs: Date.now() - t0,
      });
      return res.json({ data, tookMs: Date.now() - t0 });
    } catch (err) {
      console.error("[getDropoffServices] server error", err);
      return res
        .status(500)
        .json({ message: "Lỗi server", error: err?.message });
    }
  }

  // POST /api/client/return-refund/:id/create-dropoff
  // controllers/client/returnRefundController.js
  static async createDropoffReturnOrder(req, res) {
    console.log("---");
    console.log("[createDropoffReturnOrder] Start processing request...");
    const t = await sequelize.transaction();
    try {
      const { id } = req.params;
      const { serviceCode, serviceName } = req.body;
      const userId = req.user.id;

      console.log(
        `[createDropoffReturnOrder] Request for ReturnRequest #${id} by user #${userId}`
      );
      console.log(
        `[createDropoffReturnOrder] Data from FE: serviceCode=${serviceCode}, serviceName=${serviceName}`
      );

      const rr = await ReturnRequest.findOne({
        where: { id },
        include: [
          {
            model: Order,
            as: "order",
            where: { userId },
            include: [
              {
                model: UserAddress,
                as: "shippingAddress",
                include: [
                  { model: Province, as: "province" },
                  { model: District, as: "district" },
                  { model: Ward, as: "ward" },
                ],
              },
            ],
          },
          {
            model: ReturnRequestItem,
            as: "items",
            include: [
              {
                model: Sku,
                as: "sku",
                attributes: ["weight", "length", "width", "height"],
              },
            ],
          },
        ],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!rr) {
        console.log("[createDropoffReturnOrder] Return request not found.");
        await t.rollback();
        return res
          .status(404)
          .json({ message: "Không tìm thấy yêu cầu trả hàng" });
      }
      if (rr.status !== "approved") {
        console.log(
          `[createDropoffReturnOrder] Return request #${rr.id} status is not 'approved' but '${rr.status}'.`
        );
        await t.rollback();
        return res.status(400).json({ message: "Yêu cầu chưa được duyệt" });
      }

      console.log(
        `[createDropoffReturnOrder] Found ReturnRequest #${rr.id}. Status: ${rr.status}`
      );

      const MIN = 10;
      const items = rr.items || [];
      const weight =
        items.reduce(
          (s, it) =>
            s + (Number(it?.sku?.weight) || 100) * (Number(it?.quantity) || 1),
          0
        ) || 100;
      const length = Math.max(
        MIN,
        ...items.map((it) => Number(it?.sku?.length) || MIN)
      );
      const width = Math.max(
        MIN,
        ...items.map((it) => Number(it?.sku?.width) || MIN)
      );
      const height = Math.max(
        MIN,
        items.reduce(
          (s, it) =>
            s + (Number(it?.sku?.height) || MIN) * (Number(it?.quantity) || 1),
          0
        )
      );
      console.log(
        `[createDropoffReturnOrder] Calculated package dimensions: Weight=${weight}g, L=${length}cm, W=${width}cm, H=${height}cm`
      );

      const addr = rr.order.shippingAddress;
      const basePayload = {
        from_name: addr?.fullName || addr?.name,
        from_phone: addr?.phone,
        from_address: buildFullAddress(
          addr?.streetAddress || addr?.address,
          addr?.ward?.name,
          addr?.district?.name,
          addr?.province?.name
        ),

        from_province_id: addr?.province?.id,
        from_district_id: addr?.district?.id,
        from_ward_id: addr?.ward?.id,
        to_name: process.env.SHOP_NAME,
        to_phone: process.env.SHOP_PHONE,
        to_address: buildFullAddress(
          process.env.SHOP_ADDRESS,
          process.env.SHOP_WARD_NAME,
          process.env.SHOP_DISTRICT_NAME,
          process.env.SHOP_PROVINCE_NAME
        ),

        to_ward_code: process.env.SHOP_WARD_CODE,
        to_district_id: Number(process.env.SHOP_DISTRICT_CODE),
        weight,
        length,
        width,
        height,
        client_order_code: `RET-${rr.returnCode}`,
        content:
          rr.items && rr.items.length
            ? rr.items
                .map((it) => `${it.sku?.name || "SP"} x${it.quantity}`)
                .join(", ")
            : `Trả hàng ${rr.returnCode} - ${serviceName || "GHN"}`,
      };
      console.log(
        "[createDropoffReturnOrder] API payload base created:",
        basePayload
      );

      const { trackingCode, totalFee, expectedDelivery } =
        await ghnService.createDropoffOrder(basePayload);

      const labelUrl = await ghnService.getLabel(trackingCode);

      let finalReturnFee = 0;
      if (rr.situation === "customer_pays") {
        finalReturnFee = totalFee;
      }

      await rr.update(
        {
          returnProviderCode: "ghn",
          returnServiceId: serviceCode || null,
          returnServiceName: serviceName || null,
          trackingCode,
          returnLabelUrl: labelUrl,
          returnDropoffType: "post_office",
          returnFee: finalReturnFee,
          expectedDeliveryAt: expectedDelivery,
          status: "awaiting_dropoff",
        },
        { transaction: t }
      );

      console.log(
        `[createDropoffReturnOrder] ReturnRequest #${rr.id} updated successfully.`
      );

      await t.commit();
      console.log("[createDropoffReturnOrder] Transaction committed.");
      return res.json({
        message: `Đã tạo vận đơn GHN cho trả tại bưu cục`,
        data: {
          trackingCode,
          labelUrl,
          provider: "ghn",
          serviceName,
          fee: finalReturnFee,
        },
      });
    } catch (err) {
      await t.rollback();
      console.error("[createDropoffReturnOrder] An error occurred:", err);
      return res.status(500).json({
        message: "Lỗi server khi tạo đơn bưu cục",
        error: err?.message,
      });
    } finally {
      console.log("---");
    }
  }
}

module.exports = ReturnRefundController;
