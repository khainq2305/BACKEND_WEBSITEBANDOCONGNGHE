const processSkuPrices = (skuData, allActiveFlashSaleItemsMap, allActiveCategoryDealsMap) => {
  let effectivePrice;
  let effectiveFlashSaleInfo = null;

  const rawOriginalSkuPrice = parseFloat(skuData.originalPrice || skuData.price || 0);
  const rawDefaultSkuPrice = parseFloat(skuData.price || 0);
  const displayOriginalPrice = rawOriginalSkuPrice > 0 ? rawOriginalSkuPrice : rawDefaultSkuPrice;

  // ✅ Bọc check phòng lỗi: cho phép map chứa 1 object hoặc array
  const fsItemsRaw = allActiveFlashSaleItemsMap.get(skuData.id);
  const fsItems = Array.isArray(fsItemsRaw) ? fsItemsRaw : (fsItemsRaw ? [fsItemsRaw] : []);

  // ✅ Ưu tiên chọn FlashSaleItem còn hàng đầu tiên
  let validFsItem = null;
  for (const item of fsItems) {
    const soldOut = item.quantity != null && item.soldQuantity >= item.quantity;
    if (!soldOut) {
      validFsItem = item;
      break;
    }
  }

  if (validFsItem) {
    effectivePrice = parseFloat(validFsItem.salePrice);
    effectiveFlashSaleInfo = {
      quantity: validFsItem.quantity,
      soldQuantity: validFsItem.soldQuantity,
      endTime: validFsItem.flashSaleEndTime,
      type: 'item',
      discountType: 'fixed',
      discountValue: displayOriginalPrice - effectivePrice,
      flashSaleId: validFsItem.flashSaleId,
      isSoldOut: false
    };
  }

  // ✅ Nếu không có khối FlashSale nào còn hàng, kiểm tra Deal theo category
  if (!effectiveFlashSaleInfo) {
    const productCategoryId =
      skuData.Product?.category?.id ||
      skuData.product?.category?.id ||
      skuData.productId;

    const dealsForCategory = allActiveCategoryDealsMap.get(productCategoryId) || [];

    if (dealsForCategory.length > 0) {
      let bestCategoryDealPrice = Infinity;
      let bestCategoryDealInfo = null;

      dealsForCategory.forEach(deal => {
        let currentCategoryDealPrice = displayOriginalPrice;

        if (deal.discountType === 'percent') {
          currentCategoryDealPrice = (currentCategoryDealPrice * (100 - deal.discountValue)) / 100;
        } else if (deal.discountType === 'fixed' || deal.discountType === 'amount') {
          currentCategoryDealPrice -= deal.discountValue;
        }

        currentCategoryDealPrice = Math.max(0, Math.round(currentCategoryDealPrice / 1000) * 1000);

        if (currentCategoryDealPrice < bestCategoryDealPrice) {
          bestCategoryDealPrice = currentCategoryDealPrice;
          bestCategoryDealInfo = {
            endTime: deal.endTime,
            type: 'category',
            discountType: deal.discountType,
            discountValue: deal.discountValue,
            flashSaleId: deal.flashSaleId,
            flashSaleCategoryId: deal.flashSaleCategoryId,
            isSoldOut: false
          };
        }
      });

      if (!effectiveFlashSaleInfo || bestCategoryDealPrice < effectivePrice) {
        effectivePrice = bestCategoryDealPrice;
        effectiveFlashSaleInfo = bestCategoryDealInfo;
      }
    }
  }

  // ✅ Nếu tất cả FlashSale đều sold out, vẫn trả flashSaleInfo để show trạng thái "hết hàng"
  if (!effectiveFlashSaleInfo && fsItems.length > 0) {
    const soldOutItem = fsItems[0];
    effectiveFlashSaleInfo = {
      quantity: soldOutItem.quantity,
      soldQuantity: soldOutItem.soldQuantity,
      endTime: soldOutItem.flashSaleEndTime,
      type: 'item',
      flashSaleId: soldOutItem.flashSaleId,
      isSoldOut: true
    };
  }

if (typeof effectivePrice !== 'number' || isNaN(effectivePrice) || effectivePrice <= 0) {
  if (rawDefaultSkuPrice > 0) {
    effectivePrice = rawDefaultSkuPrice;
  } else if (rawOriginalSkuPrice > 0) {
    effectivePrice = rawOriginalSkuPrice;
  } else {
    effectivePrice = 1000; // fallback cứng để khỏi lưu đơn giá = 0
    console.warn(`⚠️ SKU ${skuData.id} không có giá, dùng fallback 1000đ`);
  }
}


  const discount = (displayOriginalPrice > effectivePrice && displayOriginalPrice > 0)
    ? Math.round(100 - (effectivePrice * 100) / displayOriginalPrice)
    : 0;

  return {
    price: effectivePrice,
    salePrice: effectivePrice,
    originalPrice: displayOriginalPrice,
    flashSaleInfo: effectiveFlashSaleInfo,
    discount,
    hasDeal:
      effectiveFlashSaleInfo !== null &&
      effectiveFlashSaleInfo.flashSaleId !== undefined &&
      !effectiveFlashSaleInfo.isSoldOut
  };
};

module.exports = {
  processSkuPrices
};
