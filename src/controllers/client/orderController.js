const { Order, OrderItem, sequelize, UserAddress, Province, District, Ward, Sku, PaymentMethod } = require('../../models');
const axios = require('axios');

class OrderController {
  
static async getAvailableService(fromDistrict, toDistrict) {
  try {
    console.log(`[GHN Service] Requesting available services for from_district: ${fromDistrict}, to_district: ${toDistrict}`);
    const response = await axios.post(
      'https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/available-services',
      {
        shop_id: Number(process.env.GHN_SHOP_ID), 
        from_district: Number(fromDistrict),
        to_district: Number(toDistrict),
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Token': process.env.GHN_TOKEN,
        },
      }
    );

    const service = response.data.data?.[0];
    if (!service) {

      throw new Error('Không có dịch vụ giao hàng khả dụng');
    }

 
    return service.service_type_id;
  } catch (error) {

    throw new Error('Không lấy được dịch vụ giao hàng');
  }
}

  // 🔹 Tính phí giao hàng
  static async calculateFee({ toDistrict, toWard, weight, length, width, height, serviceTypeId }) {
  try {
    

    const response = await axios.post(
      'https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/fee',
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
          'Content-Type': 'application/json',
          'Token': process.env.GHN_TOKEN,
          'ShopId': process.env.GHN_SHOP_ID,
        },
      }
    );

    return response.data.data.total;
  } catch (error) {
    console.error('GHN Fee Error:', error?.response?.data || error.message);
    throw new Error('Không tính được phí vận chuyển');
  }
}

static async getShippingFee(req, res) {
  try {


    const { districtId, wardCode, items } = req.body;


    const districtIdNumber = Number(districtId);

    if (!districtIdNumber || !wardCode || !items || items.length === 0) {
      return res.status(400).json({ message: 'Thiếu thông tin tính phí' });
    }

    const skuList = await Sku.findAll({ where: { id: items.map(i => i.skuId) } });
    const skuMap = {};
    skuList.forEach(s => skuMap[s.id] = s);

    let totalWeight = 0, maxLength = 0, maxWidth = 0, maxHeight = 0;
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
      serviceTypeId
    });

    return res.json({ shippingFee });

  } catch (err) {
    console.error("Fee error:", err);
    return res.status(500).json({ message: "Không tính được phí vận chuyển" });
  }
}



  // 🔸 Tạo đơn hàng (COD hoặc phương thức khác)
  static async createOrder(req, res) {
    const t = await sequelize.transaction();

    try {
      const user = req.user;
      const { addressId, items, note, paymentMethodId } = req.body;

      if (!addressId || !items || items.length === 0 || !paymentMethodId) {
        return res.status(400).json({ message: 'Thiếu dữ liệu đơn hàng' });
      }

 
      const validPayment = await PaymentMethod.findByPk(paymentMethodId);
      if (!validPayment) {
        return res.status(400).json({ message: 'Phương thức thanh toán không hợp lệ' });
      }

   
      const selectedAddress = await UserAddress.findOne({
        where: { id: addressId, userId: user.id },
        include: [
          { model: Province, as: 'province' },
          { model: District, as: 'district' },
          { model: Ward, as: 'ward' },
        ],
      });

      if (!selectedAddress) {
        return res.status(404).json({ message: 'Không tìm thấy địa chỉ giao hàng' });
      }

     
      const skuList = await Sku.findAll({
        where: { id: items.map(i => i.skuId) },
      });

      const skuMap = {};
      skuList.forEach(sku => {
        skuMap[sku.id] = sku;
      });

      for (const item of items) {
        const sku = skuMap[item.skuId];
        if (!sku) {
          return res.status(400).json({ message: `Không tìm thấy SKU: ${item.skuId}` });
        }

        if (item.quantity > sku.stock) {
          return res.status(400).json({ message: `Sản phẩm "${sku.skuCode}" không đủ hàng (hiện còn: ${sku.stock})` });
        }
      }

      
      let totalWeight = 0, maxLength = 0, maxWidth = 0, maxHeight = 0;
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
        status: 'pending',
      }, { transaction: t });

   
      for (const item of items) {
        await OrderItem.create({
          orderId: newOrder.id,
          skuId: item.skuId,
          quantity: item.quantity,
          price: item.price,
        }, { transaction: t });

        await skuMap[item.skuId].decrement('stock', { by: item.quantity, transaction: t });
      }

      await t.commit();
      return res.status(201).json({ message: 'Đặt hàng thành công', orderId: newOrder.id });

    } catch (error) {
      await t.rollback();
      console.error("Lỗi tạo đơn hàng:", error);
      return res.status(500).json({ message: 'Lỗi khi tạo đơn hàng' });
    }
  }
}

module.exports = OrderController;
