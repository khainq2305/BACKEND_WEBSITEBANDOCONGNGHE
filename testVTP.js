import axios from "axios";

const HEADERS = {
  "Content-Type": "application/json",
  "Token": "832829B87690D672E413F9B38FA85DBE", // thay token thật vào
};

async function testVTP() {
  const urlServices = "https://partner.viettelpost.vn/v2/categories/listService";
  const urlPrice = "https://partner.viettelpost.vn/v2/order/getPriceAll";

  try {
    // 1. Lấy danh sách dịch vụ
    const resService = await axios.post(
      urlServices,
      { TYPE: 2 },
      { headers: HEADERS, timeout: 10000 }
    );

    const services = Array.isArray(resService?.data?.data)
      ? resService.data.data
          .filter(s => !/thỏa thuận|Cam kết|Flashsale/i.test(s.SERVICE_NAME))
          .map(s => s.SERVICE_CODE)
          .filter(Boolean)
      : [];

    console.log("Parsed services:", services);

    if (!services.length) {
      console.error("❌ Không lấy được dịch vụ khả dụng");
      return;
    }

    // 2. Test từng service
    for (const service of services) {
      const requestBody = {
        PRODUCT_WEIGHT: 200,
        PRODUCT_PRICE: 100000,
        MONEY_COLLECTION: 0,
        ORDER_SERVICE_ADD: "",
        ORDER_SERVICE: service,
        SENDER_PROVINCE: 1, // Hồ Chí Minh
        SENDER_DISTRICT: 14, // Quận 10
        RECEIVER_PROVINCE: 96, // An Giang
        RECEIVER_DISTRICT: 969, // Châu Thành
        PRODUCT_TYPE: "HH",
        NATIONAL_TYPE: 1,
      };

      try {
        const resPrice = await axios.post(urlPrice, requestBody, {
          headers: HEADERS,
          timeout: 10000,
        });

        if (resPrice.data?.status === 200) {
          console.log(`✅ Service ${service}:`, JSON.stringify(resPrice.data, null, 2));
        } else {
          console.log(`❌ Service ${service} bỏ qua: ${resPrice.data?.message}`);
        }
      } catch (e) {
        console.log(`❌ Service ${service} lỗi:`, e.message);
      }
    }
  } catch (err) {
    console.error("❌ Lỗi:", err.message);
  }
}

testVTP();
