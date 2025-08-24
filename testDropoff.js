const axios = require("axios");

// ⚠️ Config GHN
const GHN_TOKEN = process.env.GHN_TOKEN || "d66cf435-f4ac-11ef-ac14-f2515dcc8e8f";
const GHN_SHOP_ID = process.env.GHN_SHOP_ID || "3677180";

const headers = {
  token: GHN_TOKEN,
  ShopId: GHN_SHOP_ID,
  "Content-Type": "application/json",
};

// Hàm fake getGhnCodesFromLocalDb (test nhanh)
async function getGhnCodesFromLocalDb({ province, district, ward }) {
  return {
    ghnDistId: district, // 👈 tạm lấy luôn id FE truyền vào
    ghnWardCode: ward,
  };
}

// Build full address helper
function buildFullAddress(address, ward, district, province) {
  return [address, ward, district, province].filter(Boolean).join(", ");
}

// --- Hàm tạo đơn Drop-off ---
async function createDropoffOrder(payload) {
  const { ghnDistId: fromDistrictGhnCode, ghnWardCode: fromWardGhnCode } =
    await getGhnCodesFromLocalDb({
      province: payload.from_province_id,
      district: payload.from_district_id,
      ward: payload.from_ward_id,
    });

  // 🔥 Lấy service_type_id
  const { data: serviceRes } = await axios.post(
    "https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/available-services",
    {
      shop_id: Number(GHN_SHOP_ID),
      from_district: Number(fromDistrictGhnCode),
      to_district: Number(payload.to_district_id),
    },
    { headers, timeout: 8000 }
  );

  const service = serviceRes?.data?.[0];
  if (!service) throw new Error("GHN: Không tìm thấy dịch vụ khả dụng.");

  // 🚚 Station ID fix cứng (thay bằng station thật của bạn)
  const fallbackStationId = 1001;

  const createOrderPayload = {
    service_type_id: service.service_type_id,
    payment_type_id: payload.situation === "customer_pays" ? 2 : 1,
    required_note: "KHONGCHOXEMHANG",
    pick_option: "post_office",
    pick_station_id: fallbackStationId,

    from_name: payload.from_name,
    from_phone: payload.from_phone,
    from_address: buildFullAddress(
      payload.from_address,
      payload.wardName,
      payload.districtName,
      payload.provinceName
    ),
    from_ward_code: fromWardGhnCode,
    from_district_id: Number(fromDistrictGhnCode),

    to_name: payload.to_name,
    to_phone: payload.to_phone,
    to_address: buildFullAddress(
      payload.to_address,
      payload.to_wardName,
      payload.to_districtName,
      payload.to_provinceName
    ),
    to_ward_code: payload.to_ward_code,
    to_district_id: Number(payload.to_district_id),

    weight: Math.max(1, payload.weight),
    length: Math.max(1, payload.length),
    width: Math.max(1, payload.width),
    height: Math.max(1, payload.height),

    cod_amount: 0,
    client_order_code: payload.client_order_code,
    content: payload.items
      ? payload.items.map(it => `${it.productName} x${it.quantity}`).join(", ")
      : (payload.content || "Đơn hàng test Dropoff"),
  };

  console.log("📦 Payload gửi GHN:", JSON.stringify(createOrderPayload, null, 2));

  const { data: responseData } = await axios.post(
    "https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/create",
    createOrderPayload,
    { headers, timeout: 10000 }
  );

  console.log("📩 Response GHN:", JSON.stringify(responseData, null, 2));

  return responseData;
}

// --- TEST ---
(async () => {
  try {
    const res = await createDropoffOrder({
      from_name: "Nguyễn Khải",
      from_phone: "0909000999",
      from_address: "123 Đường ABC",
      from_province_id: 201, // Hà Nội (ví dụ)
      from_district_id: 1442,
      from_ward_id: "20101",

      to_name: "Shop Cyberzone",
      to_phone: "0911222333",
      to_address: "456 Đường XYZ",
      to_provinceName: "Hồ Chí Minh",
      to_district_id: 1450,
      to_ward_code: "21009",

      weight: 100,
      length: 20,
      width: 20,
      height: 20,

      client_order_code: "TEST-DROPOFF-01",
      situation: "customer_pays",
      items: [{ productName: "Áo Polo", quantity: 1 }],
    });

    console.log("✅ Tạo đơn thành công:", res);
  } catch (err) {
    console.error("❌ Lỗi tạo đơn:", err.response?.data || err.message);
  }
})();
