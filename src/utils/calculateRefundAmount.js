// utils/calculateRefundAmount.js
module.exports = function calculateRefundAmount(returnRequest) {
  const order = returnRequest.order;
  const orderItems = order?.items || [];
  const returnItems = returnRequest.items || [];

  // 1. Tổng tiền hàng gốc (chưa trừ giảm giá)
  const totalItemsSubtotal = orderItems.reduce(
    (sum, i) => sum + Number(i.price) * Number(i.quantity),
    0
  );

  // 2. Tổng tiền hàng bị trả
  const returnedSubtotal = returnItems.reduce((sum, r) => {
    const matched = orderItems.find(o => o.skuId === r.skuId);
    if (!matched) return sum;
    const qty = Math.min(Number(r.quantity), Number(matched.quantity));
    return sum + Number(matched.price) * qty;
  }, 0);

  // 3. Giảm giá từ coupon + điểm
  const couponDiscount = Number(order?.couponDiscount || 0);
  const pointDiscount  = Number(order?.pointDiscount || 0);

  // 4. Tổng tiền khách thực trả cho hàng
  const itemsCashPaid = Math.max(0, totalItemsSubtotal - couponDiscount - pointDiscount);

  // 5. Hoàn tiền theo tỷ lệ
  let refundAmount = 0;
  if (totalItemsSubtotal > 0) {
    refundAmount = (returnedSubtotal / totalItemsSubtotal) * itemsCashPaid;
  }

  // 6. Nếu trả hết & seller_pays → cộng phí ship
  const isReturningAll = orderItems.every(oi => {
    const ri = returnItems.find(r => r.skuId === oi.skuId);
    return ri && Number(ri.quantity) === Number(oi.quantity);
  });
  if (isReturningAll && returnRequest.situation === "seller_pays") {
    refundAmount += Number(order?.shippingFee || 0);
  }

  // 7. Chặn không vượt quá số đã thanh toán
  refundAmount = Math.round(refundAmount);
  refundAmount = Math.min(refundAmount, Number(order?.finalPrice || refundAmount));

  return refundAmount;
};
