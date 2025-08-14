// src/controllers/ai/aiSchema.js
const { z } = require('zod');

// cell trong bảng: ép mọi thứ về string
const Cell = z.union([z.string(), z.number(), z.boolean(), z.null()]).transform(v =>
  v === null ? '' : String(v)
);

const OptionValue = z.object({
  type: z.string().optional(),
  value: z.string().optional(),
  colorCode: z.string().optional()
}).passthrough();

const FlashSaleInfo = z.object({
  flashSaleId: z.number().int().optional(),
  salePrice: z.union([z.number(), z.string()]).optional(),
  flashSaleEndTime: z.string().optional(),
  maxPerUser: z.number().int().optional(),
  quantity: z.number().int().optional(),
  soldQuantity: z.number().int().optional(),
}).passthrough();

const ProductCard = z.object({
  id: z.union([z.number().int(), z.string()]),
  name: z.string(),
  slug: z.string(),
  image: z.string().nullable().optional(),
  price: z.union([z.number(), z.string()]),
  oldPrice: z.union([z.number(), z.string()]).nullable().optional(),
  discount: z.union([z.number(), z.string()]).nullable().optional(),
  inStock: z.boolean(),
  status: z.string(),
  category: z.string().nullable().optional(),
  brand: z.string().nullable().optional(),
  optionValues: z.array(OptionValue).default([]),
  rating: z.union([z.number(), z.string()]).optional(),
  soldCount: z.union([z.number(), z.string()]).optional(),
  quantity: z.union([z.number(), z.string()]).optional(),
  badge: z.string().nullable().optional(),
  badgeImage: z.string().nullable().optional(),
  flashSaleInfo: FlashSaleInfo.optional()
}).passthrough();

const TableData = z.object({
  headers: z.array(z.string()),
  rows: z.array(z.array(Cell))
}).passthrough();

const ProductGrid = z.object({
  title: z.string().default('Sản phẩm đề xuất'),
  products: z.array(ProductCard),
  descriptionTop: z.string().optional(),
  table: TableData.optional(),
  noteAfterGrid: z.string().optional()
}).passthrough();

const ProductGridOnly = z.object({
  title: z.string().default('Sản phẩm đề xuất'),
  products: z.array(ProductCard),
  noteAfterGrid: z.string().optional()
}).passthrough();

const Media = z.object({
  mediaUrl: z.string(),
  type: z.string().optional(),
  sortOrder: z.union([z.number(), z.string()]).optional()
}).passthrough();

const VariantMini = z.object({ type: z.string().optional() }).passthrough();
const VariantValueMini = z.object({
  value: z.string().optional(),
  variant: VariantMini.optional(),
  colorCode: z.string().optional()
}).passthrough();
const SkuVariantValueMini = z.object({ variantValue: VariantValueMini.optional() }).passthrough();

const ProductSku = z.object({
  id: z.union([z.number().int(), z.string()]),
  skuCode: z.string().optional(),
  price: z.union([z.number(), z.string()]),
  originalPrice: z.union([z.number(), z.string()]).nullable().optional(),
  stock: z.union([z.number().int(), z.string()]),
  ProductMedia: z.array(Media).default([]),
  variantValues: z.array(SkuVariantValueMini).default([]),
  discount: z.union([z.number(), z.string()]).optional(),
  hasDeal: z.boolean().optional(),
  flashSaleInfo: FlashSaleInfo.optional()
}).passthrough();

const ProductDetailContent = z.object({
  id: z.union([z.number().int(), z.string()]),
  name: z.string(),
  slug: z.string(),
  thumbnail: z.string().nullable().optional(),
  brand: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  skus: z.array(ProductSku).default([]),
  defaultSku: ProductSku.nullable().optional(),
  rating: z.union([z.number(), z.string()]).optional(),
  soldCount: z.union([z.number(), z.string()]).optional(),
}).passthrough();

const ChatResponseSchema = z.object({
  type: z.enum(['text', 'product_grid', 'product_grid_only', 'table_only', 'product_detail']),
  content: z.union([z.string(), ProductGrid, ProductGridOnly, TableData, ProductDetailContent]),
  isProductDetail: z.boolean().default(false),
  replyMessage: z.string().nullable().optional()
}).strict();

module.exports = { ChatResponseSchema };
