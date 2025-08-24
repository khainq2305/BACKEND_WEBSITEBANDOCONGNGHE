const processSkuPrices = (skuData, allActiveFlashSaleItemsMap, allActiveCategoryDealsMap) => {
  let effectivePrice;
  let effectiveFlashSaleInfo = null;

  const rawOriginalSkuPrice = parseFloat(skuData.originalPrice || skuData.price || 0);
  const rawDefaultSkuPrice = parseFloat(skuData.price || 0);
  const displayOriginalPrice = rawOriginalSkuPrice > 0 ? rawOriginalSkuPrice : rawDefaultSkuPrice;
  
  const fsItemsRaw = allActiveFlashSaleItemsMap.get(skuData.id);
  const fsItems = Array.isArray(fsItemsRaw) ? fsItemsRaw : (fsItemsRaw ? [fsItemsRaw] : []);
  
  let bestFsItem = null;
  let bestFsPrice = Infinity;

  for (const item of fsItems) {
    const soldOut = item.quantity != null && item.soldQuantity >= item.quantity;
    if (!soldOut) {
      const itemPrice = parseFloat(item.salePrice);
      if (itemPrice < bestFsPrice) {
        bestFsPrice = itemPrice;
        bestFsItem = item;
      }
    }
  }

  if (bestFsItem) {
    effectivePrice = bestFsPrice;
    effectiveFlashSaleInfo = {
      quantity: bestFsItem.quantity,
      soldQuantity: bestFsItem.soldQuantity,
      endTime: bestFsItem.flashSaleEndTime,
      type: 'item',
      discountType: 'fixed',
      discountValue: displayOriginalPrice - effectivePrice,
      flashSaleId: bestFsItem.flashSaleId,
      flashSaleItemId: bestFsItem.id,
      isSoldOut: false
    };
  }

  if (!effectiveFlashSaleInfo) {
    const productCategoryId = skuData.Product?.category?.id || skuData.product?.category?.id || skuData.productId;
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

  if (!effectiveFlashSaleInfo && fsItems.length > 0) {
    const soldOutItem = fsItems.find(item => item.quantity != null && item.soldQuantity >= item.quantity);
    if (soldOutItem) {
        effectiveFlashSaleInfo = {
            quantity: soldOutItem.quantity,
            soldQuantity: soldOutItem.soldQuantity,
            endTime: soldOutItem.flashSaleEndTime,
            type: 'item',
            flashSaleId: soldOutItem.flashSaleId,
            flashSaleItemId: soldOutItem.id,
            isSoldOut: true
        };
    }
  }
  
  if (typeof effectivePrice !== 'number' || isNaN(effectivePrice) || effectivePrice <= 0) {
    if (rawDefaultSkuPrice > 0) {
      effectivePrice = rawDefaultSkuPrice;
    } else if (rawOriginalSkuPrice > 0) {
      effectivePrice = rawOriginalSkuPrice;
    } else {
      effectivePrice = 1000;
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
    hasDeal: effectiveFlashSaleInfo !== null && effectiveFlashSaleInfo.flashSaleId !== undefined && !effectiveFlashSaleInfo.isSoldOut
  };
};

module.exports = {
  processSkuPrices
};