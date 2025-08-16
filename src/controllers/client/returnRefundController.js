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
const ghnService = require('../../services/client/drivers/ghnService');

const sendEmail = require("../../utils/sendEmail"); // Điều chỉnh đường dẫn utils cho đúng
const refundGateway = require("../../utils/refundGateway"); // Điều chỉnh đường dẫn utils cho đúng
const ShippingService = require("../../services/client/shippingService"); // Điều chỉnh đường dẫn services cho đúng

const { Op } = require("sequelize");

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
            return res.status(400).json({ message: "Vui lòng chọn lý do hoàn hàng" });
        }

        let parsedItems;
        try {
            parsedItems = JSON.parse(itemsToReturn);
            if (!Array.isArray(parsedItems) || parsedItems.length === 0) {
                throw new Error();
            }
        } catch {
            await t.rollback();
            return res.status(400).json({ message: "Vui lòng chọn ít nhất một sản phẩm để trả" });
        }

        const skuIds = parsedItems.map((item) => item.skuId);

        // ✅ Cập nhật: Thêm User vào include để tránh lỗi
        const order = await Order.findOne({
            where: { id: parsedOrderId, userId },
            include: [
                { model: OrderItem, as: "items", attributes: ["skuId", "quantity"] },
              
            ],
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        if (!order) {
            await t.rollback();
            return res.status(404).json({ message: "Không tìm thấy đơn hàng" });
        }

        if (!["completed", "delivered"].includes(order.status)) {
            await t.rollback();
            return res.status(400).json({ message: "Chỉ có thể trả hàng với đơn đã giao hoặc hoàn thành" });
        }

        const validSkuIds = order.items.map((i) => i.skuId);
        const invalidSkuIds = skuIds.filter((id) => !validSkuIds.includes(id));
        if (invalidSkuIds.length > 0) {
            await t.rollback();
            return res.status(400).json({ message: `Sản phẩm trả hàng không nằm trong đơn: ${invalidSkuIds.join(", ")}` });
        }

        const existing = await ReturnRequest.findOne({
            where: {
                orderId: parsedOrderId
            }
        });

        if (existing && !(existing.status === 'cancelled' && existing.cancelledBy === 'user')) {
            await t.rollback();
            return res.status(400).json({ message: "Đơn hàng đã có yêu cầu trả hàng trước đó" });
        }

        const imageFiles = Array.isArray(req.files?.images) ? req.files.images : [];
        const videoFiles = Array.isArray(req.files?.videos) ? req.files.videos : [];

        if (imageFiles.length === 0) {
            await t.rollback();
            return res.status(400).json({ message: "Vui lòng tải lên ít nhất 1 hình ảnh bằng chứng" });
        }
        if (imageFiles.length > 6) {
            await t.rollback();
            return res.status(400).json({ message: "Chỉ được tải lên tối đa 6 hình ảnh" });
        }
        if (videoFiles.length > 1) {
            await t.rollback();
            return res.status(400).json({ message: "Chỉ được tải lên 1 video" });
        }

        const imageUrls = imageFiles.map((f) => f.path).join(",") || null;
        const videoUrls = videoFiles.map((f) => f.path).join(",") || null;

        const returnReq = await ReturnRequest.create({
            orderId: parsedOrderId,
            reason,
            detailedReason: detailedReason?.trim() || null,
            evidenceImages: imageUrls,
            evidenceVideos: videoUrls,
            status: "pending",
            returnCode: "RR" + Date.now(),
        }, { transaction: t });

        for (const item of parsedItems) {
            if (!item.quantity || item.quantity <= 0) {
                await t.rollback();
                return res.status(400).json({ message: `Số lượng không hợp lệ cho SKU ${item.skuId}` });
            }

            await ReturnRequestItem.create({
                returnRequestId: returnReq.id,
                skuId: item.skuId,
                quantity: item.quantity,
            }, { transaction: t });
        }

        const adminNotifTitle = 'Có yêu cầu trả hàng mới';
        const adminNotifMessage = `Đơn hàng ${order.orderCode} có yêu cầu trả hàng mới. Vui lòng xem xét và xử lý.`;

        // ✅ Cập nhật: Đảm bảo order.user tồn tại trước khi tạo notification
        if (order.user?.id) {
            const adminNotification = await Notification.create({
                title: adminNotifTitle,
                message: adminNotifMessage,
                slug: `admin-return-request-${returnReq.id}`,
                type: 'order',
                targetRole: 'admin',
                targetId: returnReq.id,
                link: `/admin/return-requests/${returnReq.id}`,
                isGlobal: true,
            }, { transaction: t });

            req.app.locals.io.to('admin-room').emit('new-admin-notification', adminNotification);
        }

        await t.commit();
        return res.status(201).json({
            message: "Đã gửi yêu cầu trả hàng thành công",
            data: returnReq,
        });

    } catch (err) {
        if (!t.finished) {
            await t.rollback();
        }
        // ✅ Cập nhật: Log lỗi chi tiết để dễ dàng gỡ lỗi
        console.error("🔥 Lỗi server khi gửi yêu cầu trả hàng:", err);
        return res.status(500).json({ message: "Lỗi server khi gửi yêu cầu trả hàng" });
    }
}



 
static async getReturnRequestDetail(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    console.log(`📥 [getReturnRequestDetail] ID: ${id} | UserID: ${userId}`);

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
        attributes: ['code', 'name']
      }
    ],
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
  {
    model: RefundRequest,
    as: "refundRequest", 
    attributes: ['id', 'amount', 'status', 'refundedAt', 'responseNote', 'createdAt'],
    required: false
  }
]

    });

    if (!returnRequest || !returnRequest.order || returnRequest.order.userId !== userId) {
      return res.status(404).json({ message: "Không tìm thấy đơn trả hàng" });
    }

    const orderItems = returnRequest.order.items;
    const returnItems = returnRequest.items;

    console.log("🧾 Order Items:", orderItems.map(o => ({
      id: o.id,
      skuId: o.skuId,
      price: o.price,
      quantity: o.quantity
    })));

    console.log("🔄 Return Items:", returnItems.map(r => ({
      id: r.id,
      skuId: r.skuId,
      quantity: r.quantity
    })));

    let refundAmount = 0;

    for (const returnItem of returnItems) {
      const matchedOrderItem = orderItems.find(item => item.skuId === returnItem.skuId);
      if (matchedOrderItem) {
        const itemTotal = Number(matchedOrderItem.price) * returnItem.quantity;
        console.log(`💰 SKU ${returnItem.skuId}: ${matchedOrderItem.price} * ${returnItem.quantity} = ${itemTotal}`);
        refundAmount += itemTotal;
      }
    }

    const totalOrderQuantity = orderItems.reduce((sum, item) => sum + item.quantity, 0);
    const totalReturnQuantity = returnItems.reduce((sum, item) => sum + item.quantity, 0);

    console.log(`📦 Tổng SL order: ${totalOrderQuantity} | SL trả: ${totalReturnQuantity}`);

    if (totalOrderQuantity === totalReturnQuantity) {
      const shippingFee = Number(returnRequest.order.shippingFee) || 0;
      console.log(`🚚 Hoàn thêm phí ship: ${shippingFee}`);
      refundAmount += shippingFee;
    }

    console.log(`✅ Tổng tiền hoàn lại: ${refundAmount}`);

    // ✅ Xác định hoàn tiền vào đâu
    const order = returnRequest.order;
    let refundDestination = "Không rõ";

    if (order.paymentStatus === 'unpaid' || order.paymentMethodId === 1) {
      refundDestination = "Chưa thanh toán";
    } else if (order.momoOrderId) {
      refundDestination = "Ví MoMo";
    } else if (order.vnpTransactionId) {
      refundDestination = "VNPAY";
    } else if (order.zaloTransId) {
      refundDestination = "ZaloPay";
    } else if (order.stripePaymentIntentId) {
      refundDestination = "Thẻ quốc tế (Stripe)";
    }

    const response = {
      ...returnRequest.toJSON(),
      refundAmount,
      refundDestination
    };

    return res.json({ data: response });
  } catch (error) {
    console.error("❌ Lỗi lấy chi tiết đơn trả hàng:", error);
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
      return res.status(404).json({ message: "Không tìm thấy yêu cầu trả hàng" });
    }

    if (!["pending", "approved"].includes(returnRequest.status)) {
      return res.status(400).json({ message: "Không thể hủy yêu cầu ở trạng thái hiện tại" });
    }

    returnRequest.status = "cancelled";
    returnRequest.responseNote = "Người dùng tự hủy yêu cầu";
    returnRequest.cancelledBy = "user"; // 👈 thêm dòng này
    await returnRequest.save();

    return res.json({ message: "Đã hủy yêu cầu trả hàng thành công" });
  } catch (err) {
    console.error("[cancelReturnRequest]", err);
    return res.status(500).json({ message: "Lỗi server khi hủy yêu cầu trả hàng" });
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
        {
          model: Order,
          as: "order",
          where: { userId },
          required: true,
        },
      ],
    });

    if (!returnRequest) {
      return res.status(404).json({ message: "Không tìm thấy yêu cầu trả hàng" });
    }

    if (returnRequest.returnMethod) {
      return res.status(400).json({
        message: "Bạn đã chọn phương thức trả hàng rồi. Không thể thay đổi nữa.",
      });
    }

    if (returnRequest.status !== "approved") {
      return res.status(400).json({
        message: "Chỉ có thể chọn phương thức hoàn hàng khi yêu cầu ở trạng thái đã duyệt",
      });
    }

    if (
      returnRequest.deadlineChooseReturnMethod &&
      new Date() > new Date(returnRequest.deadlineChooseReturnMethod)
    ) {
      return res.status(400).json({
        message: "Đã quá hạn chọn phương thức hoàn hàng, yêu cầu đã hết hiệu lực",
      });
    }

    if (!["ghn_pickup", "self_send"].includes(returnMethod)) {
      return res.status(400).json({ message: "Phương thức hoàn hàng không hợp lệ" });
    }

    returnRequest.returnMethod = returnMethod;
    returnRequest.dateChooseReturnMethod = new Date();

    if (returnMethod === "self_send") {
      returnRequest.status = "awaiting_pickup";
    } else {
      returnRequest.status = "approved";
    }

    await returnRequest.save();

    return res.json({
      message: "Đã cập nhật phương thức hoàn hàng",
      data: returnRequest,
    });
  } catch (err) {
    console.error("[chooseReturnMethod]", err);
    return res.status(500).json({ message: "Lỗi server khi chọn phương thức hoàn hàng" });
  }
}



  
static async bookReturnPickup(req, res) {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const userId = req.user.id;

    console.log("🔄 [bookReturnPickup] Bắt đầu xử lý - ReturnRequest ID:", id, "UserID:", userId);

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

    if (!returnReq) {
      console.warn("❌ Không tìm thấy ReturnRequest hoặc không thuộc user");
      await t.rollback();
      return res.status(404).json({ message: "Không tìm thấy yêu cầu trả hàng" });
    }

    const order = returnReq.order;
    const addr = order.shippingAddress;
    let providerCode = order.shippingProvider?.code?.toLowerCase() || "ghn";

    console.log("✅ Tìm thấy ReturnRequest & Order:", order.id);
    console.log("🚚 Đơn vị vận chuyển (DB):", providerCode);

    // Ép về GHN nếu khác
    if (providerCode !== "ghn") {
      console.warn(`[bookReturnPickup] providerCode trong DB = ${providerCode}, ép sang 'ghn' để xử lý`);
      providerCode = "ghn";
    }

    // === 1. Mapping tỉnh/huyện/xã về mã GHN
    const { ghnWardCode, ghnDistId, ghnProvId } = await ghnService.getGhnCodesFromLocalDb({
      province: addr.province?.id,
      district: addr.district?.id,
      ward: addr.ward?.id,
    });

    console.log("📦 Mapping GHN codes:", {
      ghnProvId,
      ghnDistId,
      ghnWardCode,
    });

    // === 2. Lấy trọng số và kích thước
    const items = order.items;
    if (!items?.length) {
      await t.rollback();
      throw new Error("Không có sản phẩm nào trong đơn hàng để trả");
    }

    const totalWeight = items.reduce((sum, item) => sum + (item.sku?.weight || 100), 0);
    const totalLength = Math.max(10, items.reduce((sum, item) => sum + (item.sku?.length || 10), 0));
    const totalWidth = Math.max(10, items.reduce((sum, item) => sum + (item.sku?.width || 10), 0));
    const totalHeight = Math.max(10, items.reduce((sum, item) => sum + (item.sku?.height || 10), 0));

    console.log("📐 Kích thước gói hàng:", {
      totalWeight,
      totalLength,
      totalWidth,
      totalHeight,
    });

    // === 3. Payload gửi GHN
    const ghnPayload = {
      from_name: addr?.name || "Khách hàng",
      from_phone: addr?.phone || "0123456789",
      from_address: addr?.address || "Địa chỉ không xác định",
      from_district_id: addr.district?.id,
      from_ward_id: addr.ward?.id,
      from_province_id: addr.province?.id,

      to_name: process.env.SHOP_NAME || "Kho Shop",
      to_phone: process.env.SHOP_PHONE || "0987654321",
      to_address: process.env.SHOP_ADDRESS || "Kho mặc định",
      to_ward_code: process.env.SHOP_WARD_CODE,
      to_district_id: process.env.SHOP_DISTRICT_CODE,

      weight: totalWeight,
      length: totalLength,
      width: totalWidth,
      height: totalHeight,
      client_order_code: `RTN-${id}-${Date.now()}`,
      content: "Trả hàng từ khách",
    };

    console.log("📤 Payload gửi GHN:", ghnPayload);

    // === 4. Gọi GHN API bookPickup
    const { trackingCode, labelUrl } = await ghnService.bookPickup(ghnPayload);

    console.log("✅ GHN trả về trackingCode:", trackingCode);

    // === 5. Cập nhật ReturnRequest
    returnReq.status = "awaiting_pickup";
    returnReq.trackingCode = trackingCode;
    await returnReq.save({ transaction: t });

    await t.commit();
    console.log("✅ Đã cập nhật trạng thái returnRequest & commit DB");

    return res.json({
      message: "Đã book GHN & cập nhật trạng thái trả hàng.",
      trackingCode,
      labelUrl,
    });
  } catch (err) {
    await t.rollback();
    console.error("❌ [bookReturnPickup]", err);
    return res.status(500).json({ message: err.message || "Server Error" });
  }
}

/**
 * @description Lấy yêu cầu trả hàng theo mã yêu cầu (returnCode)
 * @route GET /api/client/return-refund/by-code/:code
 * @access Private (Auth user)
 */
static async getReturnRequestByCode(req, res) {
  try {
    const { code } = req.params;
    const userId = req.user.id;

    const returnRequest = await ReturnRequest.findOne({
      where: { returnCode: code },
      include: [
        {
          model: Order,
          as: 'order',
          where: { userId }
        },
        {
          model: ReturnRequestItem,
          as: 'items',
          include: [
            {
              model: Sku,
              as: 'sku',
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

    if (!returnRequest) {
      return res.status(404).json({ message: 'Không tìm thấy yêu cầu trả hàng' });
    }

    return res.json({ data: returnRequest });
  } catch (err) {
    console.error('[getReturnRequestByCode]', err);
    return res.status(500).json({ message: 'Lỗi server khi lấy yêu cầu trả hàng theo mã' });
  }
}




}

module.exports = ReturnRefundController;
