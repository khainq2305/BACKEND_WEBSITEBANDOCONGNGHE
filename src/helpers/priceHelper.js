// utils/priceHelper.js

const processSkuPrices = (skuData, allActiveFlashSaleItemsMap, allActiveCategoryDealsMap) => {
    let effectivePrice;
    let effectiveFlashSaleInfo = null;
    let isCurrentFlashSaleItemSoldOut = false;

    const rawOriginalSkuPrice = parseFloat(skuData.originalPrice || skuData.price || 0);
    const rawDefaultSkuPrice = parseFloat(skuData.price || 0);
    const displayOriginalPrice = rawOriginalSkuPrice > 0 ? rawOriginalSkuPrice : rawDefaultSkuPrice;

    const bestFsItemForSku = allActiveFlashSaleItemsMap.get(skuData.id);

    if (bestFsItemForSku) {
        isCurrentFlashSaleItemSoldOut = bestFsItemForSku.quantity != null && bestFsItemForSku.soldQuantity >= bestFsItemForSku.quantity;

        if (!isCurrentFlashSaleItemSoldOut) {
            effectivePrice = parseFloat(bestFsItemForSku.salePrice);
            effectiveFlashSaleInfo = {
                quantity: bestFsItemForSku.quantity,
                soldQuantity: bestFsItemForSku.soldQuantity,
                endTime: bestFsItemForSku.flashSaleEndTime,
                type: 'item',
                discountType: 'fixed',
                discountValue: displayOriginalPrice - effectivePrice,
                flashSaleId: bestFsItemForSku.flashSaleId,
                isSoldOut: false
            };
        }
    }

    if (!effectiveFlashSaleInfo || isCurrentFlashSaleItemSoldOut) {
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
                    currentCategoryDealPrice = currentCategoryDealPrice - deal.discountValue;
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
            } else if (bestCategoryDealPrice === effectivePrice && effectiveFlashSaleInfo?.type !== 'item') {
                effectivePrice = bestCategoryDealPrice;
                effectiveFlashSaleInfo = bestCategoryDealInfo;
            }
        }
    }

    if (!effectivePrice) {
        effectivePrice = rawDefaultSkuPrice;
    }

    if (isCurrentFlashSaleItemSoldOut && bestFsItemForSku) {
        effectiveFlashSaleInfo = {
            quantity: bestFsItemForSku.quantity,
            soldQuantity: bestFsItemForSku.soldQuantity,
            endTime: bestFsItemForSku.flashSaleEndTime,
            type: 'item',
            flashSaleId: bestFsItemForSku.flashSaleId,
            isSoldOut: true
        };
    }

    const discount = (displayOriginalPrice > effectivePrice && displayOriginalPrice > 0)
        ? Math.round(100 - (effectivePrice * 100) / displayOriginalPrice)
        : 0;

    return {
        price: effectivePrice,
        salePrice: effectivePrice,
        originalPrice: displayOriginalPrice,
        flashSaleInfo: effectiveFlashSaleInfo,
        discount: discount,
        hasDeal: effectiveFlashSaleInfo !== null && effectiveFlashSaleInfo.flashSaleId !== undefined && !effectiveFlashSaleInfo.isSoldOut
    };
};

module.exports = {
    processSkuPrices,
};