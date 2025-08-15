from flask import Flask, request, jsonify
from flask_cors import CORS
import torch, clip
from PIL import Image, UnidentifiedImageError
import io, os, logging
# Giới hạn luồng để giảm RAM/CPU trên máy nhỏ
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"

import torch
torch.set_num_threads(1)

# Khởi tạo Flask App
app = Flask(__name__)
logging.basicConfig(level=logging.INFO)

# Cấu hình CORS
origins = [o.strip() for o in (os.getenv("CORS_ORIGIN") or "*").split(",")]
CORS(app, origins=origins, supports_credentials=True)

# Kiểm tra thiết bị có sẵn
device = "cuda" if torch.cuda.is_available() else "cpu"
app.logger.info(f"Using device: {device}")

# Khai báo biến global cho model và preprocess
model = None
preprocess = None
MODEL_NAME = "ViT-B/32"   # thay vì "RN50"


def get_model():
    """Tải và trả về mô hình CLIP, sử dụng lazy loading."""
    global model, preprocess
    if model is None or preprocess is None:
        try:
            app.logger.info(f"Loading CLIP model: {MODEL_NAME} on {device}...")
            model_loaded, preprocess_loaded = clip.load(MODEL_NAME, device=device)
            model_loaded.eval()
            model, preprocess = model_loaded, preprocess_loaded
            app.logger.info("CLIP model loaded successfully.")
        except Exception as e:
            app.logger.error(f"Failed to load CLIP model: {e}")
            # Xử lý lỗi nếu không tải được mô hình
            raise RuntimeError(f"Failed to load CLIP model: {e}")
    return model, preprocess

@app.get("/health")
def health():
    """Endpoint để kiểm tra trạng thái sức khỏe của ứng dụng."""
    return jsonify(ok=True)

@app.post("/embed")
def embed_image():
    """Endpoint để nhận ảnh và trả về embedding vector."""
    if "image" not in request.files:
        app.logger.warning("No 'image' in request.files. Keys: %s", list(request.files.keys()))
        return jsonify({"error": "No image uploaded"}), 400

    f = request.files["image"]
    app.logger.info("Received file: %s %s %s bytes", f.filename, f.mimetype, f.content_length or 'unknown')

    try:
        image_bytes = f.read()
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except UnidentifiedImageError:
        app.logger.exception("Cannot identify image file")
        return jsonify({"error": "Invalid image data"}), 400

    # Tải mô hình khi cần
    try:
        model_loaded, preprocess_loaded = get_model()
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 500

    # Xử lý ảnh và tạo embedding
    try:
        image_input = preprocess_loaded(image).unsqueeze(0).to(device)
        with torch.no_grad():
            image_features = model_loaded.encode_image(image_input)
            image_features /= image_features.norm(dim=-1, keepdim=True)
            embedding = image_features.cpu().numpy()[0].tolist()

        app.logger.info("Vector length: %d", len(embedding))
        return jsonify({"vector": embedding})
    except Exception as e:
        app.logger.error(f"Error processing image: {e}")
        return jsonify({"error": "Error processing image"}), 500