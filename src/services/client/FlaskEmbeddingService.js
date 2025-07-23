const fs = require("fs");
const path = require("path");
const FormData = require("form-data");
const axios = require("axios");

const FlaskEmbeddingService = {
  async generateImageEmbedding(imagePathOrUrl) {
    try {
      const formData = new FormData();

      if (/^https?:\/\//.test(imagePathOrUrl)) {
        const res = await axios.get(imagePathOrUrl, { responseType: "arraybuffer" });
        formData.append("image", Buffer.from(res.data), {
          filename: "image.jpg",
          contentType: "image/jpeg",
        });
      } else {
        const absPath = path.resolve(imagePathOrUrl);
        if (!fs.existsSync(absPath)) {
          throw new Error("❌ File không tồn tại: " + absPath);
        }
        formData.append("image", fs.createReadStream(absPath));
      }

      const res = await axios.post("http://127.0.0.1:8000/embed", formData, {
        headers: formData.getHeaders(),
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });

      const embedding = res.data.vector;
      if (!Array.isArray(embedding) || embedding.length < 100) {
        throw new Error("❌ Vector không hợp lệ hoặc quá ngắn.");
      }

      return embedding;
    } catch (err) {
      console.error("[FlaskEmbeddingService] Lỗi khi tạo vector:", err.message);
      return null;
    }
  },
};

module.exports = FlaskEmbeddingService;
