// src/controllers/ai/aiStructured.js
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { ChatResponseSchema } = require("./aiSchema");

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

// Cắt bỏ ```json ... ```
function extractJson(text) {
  if (!text) return text;
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) return cleaned.slice(first, last + 1);
  return cleaned;
}

function schemaHelp() {
  return `
Bạn là trợ lý bán hàng của ZYBERZONE.
Chỉ trả về **JSON hợp lệ**, KHÔNG markdown, KHÔNG giải thích.

Schema:
{
"type": "text" | "product_grid" | "product_grid_only" | "table_only" | "product_detail" | "category_list"
  "content": (string if type='text')
           | (ProductGrid if 'product_grid')
           | (ProductGridOnly if 'product_grid_only')
           | (TableData if 'table_only')
           | (ProductDetailContent if 'product_detail'),
           | (CategoryList if 'category_list'),
  "isProductDetail": boolean,
  "replyMessage": string | null
}

QUY TẮC:
- Câu hỏi giảm giá/khuyến mãi → "product_grid", có thể kèm "table" top-5.
- TẠM THỜI **KHÔNG** dùng "product_detail". Nếu cần chi tiết, dùng "product_grid" 1 sản phẩm.
- Nếu không chắc → "text".
- "text" là HTML an toàn (p, ul, i, b), không script/style.
- Chỉ các trường trong schema. Không thêm field lạ.
`;
}

async function askLLMStructured(userMessage) {
  if (!genAI) throw new Error("Missing GEMINI_API_KEY");

  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || "gemini-1.5-flash",
  });

  const generationConfig = {
    responseMimeType: "application/json",
    temperature: 0.4,
  };

  const prompt = `${schemaHelp()}\nNgười dùng: ${userMessage}`;

  let raw = '';
  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig
    });

    raw = typeof result?.response?.text === 'function'
      ? result.response.text()
      : (result?.response?.candidates?.[0]?.content?.parts?.[0]?.text ?? '');

    const jsonText = extractJson(raw);
    const parsedJson = JSON.parse(jsonText);

    const parsed = ChatResponseSchema.safeParse(parsedJson);
    if (!parsed.success) {
      console.error('Zod validation errors:', parsed.error.errors);
      throw new Error("JSON shape not valid");
    }
    return parsed.data;
  } catch (e) {
    console.error('Gemini structured error:', e?.message, '\nRaw:', raw?.slice?.(0, 600));
    throw e;
  }
}

module.exports = { askLLMStructured };
