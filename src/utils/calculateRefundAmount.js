// utils/calculateRefundAmount.js
module.exports = function calculateRefundAmount(returnRequest) {
  const orderItems = returnRequest.order?.items || [];
  const returnItems = returnRequest.items || [];

  let refundAmount = 0;

  for (const returnItem of returnItems) {
    const matched = orderItems.find(o => o.skuId === returnItem.skuId);
    if (matched) {
      refundAmount += Number(matched.price) * returnItem.quantity;
    }
  }

  const totalOrdered = orderItems.reduce((sum, i) => sum + i.quantity, 0);
  const totalReturned = returnItems.reduce((sum, i) => sum + i.quantity, 0);

  if (totalOrdered === totalReturned) {
    refundAmount += Number(returnRequest.order?.shippingFee || 0);
  }

  return Math.round(refundAmount);
};
