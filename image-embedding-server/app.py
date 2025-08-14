import os
# ↓ giảm RAM/CPU cho PyTorch (rất quan trọng trên free tier)
os.environ.setdefault("TORCH_NUM_THREADS", "1")
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")

from flask import Flask, request, jsonify
from flask_cors import CORS
import torch, clip
from PIL import Image
import io
import logging

app = Flask(__name__)

# CORS: ENV CORS_ORIGIN="https://www.cyberzone.com.vn,https://cyberzone.com.vn,http://localhost:5173"
origins = [o.strip() for o in (os.getenv("CORS_ORIGIN") or "*").split(",") if o.strip()]
CORS(app, resources={r"/*": {"origins": origins}}, supports_credentials=True)

logging.basicConfig(level=logging.INFO)
app.logger.setLevel(logging.INFO)

DEVICE = "cpu"  # free tier không có GPU
MODEL_NAME = os.getenv("MODEL_NAME", "RN50")  # RN50 nhẹ hơn ViT-B/32
_model = None
_preprocess = None

def get_model():
    """Lazy-load CLIP để giảm peak RAM khi khởi động."""
    global _model, _preprocess
    if _model is None:
        app.logger.info(f"Loading CLIP model: {MODEL_NAME} on {DEVICE} ...")
        _model, _preprocess = clip.load(MODEL_NAME, device=DEVICE)
        _model.eval()
        torch.set_num_threads(1)
        app.logger.info("CLIP model loaded.")
    return _model, _preprocess

@app.get("/health")
def health():
    return jsonify(ok=True, device=DEVICE, model=MODEL_NAME)

@app.post("/embed")
def embed_image():
    file = request.files.get("image") or request.files.get("file")
    if not file:
        return jsonify({"error": "No image uploaded (use form field 'image' or 'file')"}), 400

    try:
        image_bytes = file.read()
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        model, preprocess = get_model()
        image_input = preprocess(image).unsqueeze(0).to(DEVICE)

        with torch.no_grad():
            feats = model.encode_image(image_input)
            feats /= feats.norm(dim=-1, keepdim=True)
            vec = feats.cpu().numpy()[0].tolist()

        return jsonify({"vector": vec})
    except Exception as e:
        app.logger.exception("embed error")
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    app.run(host="0.0.0.0", port=port)
