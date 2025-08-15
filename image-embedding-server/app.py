from flask import Flask, request, jsonify
from flask_cors import CORS
import torch, clip
from PIL import Image, UnidentifiedImageError
import io, os, logging

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)

origins = [o.strip() for o in (os.getenv("CORS_ORIGIN") or "*").split(",")]
CORS(app, origins=origins, supports_credentials=True)

device = "cuda" if torch.cuda.is_available() else "cpu"

# Lazy load model
model = None
preprocess = None

def get_model():
    global model, preprocess
    if model is None or preprocess is None:
        app.logger.info("Loading CLIP model...")
        # Đổi ViT-B/32 → RN50 nếu vẫn bị OOM
        model_loaded, preprocess_loaded = clip.load("ViT-B/32", device=device)
        model_loaded.eval()
        model, preprocess = model_loaded, preprocess_loaded
    return model, preprocess

@app.get("/health")
def health():
    return jsonify(ok=True)

@app.post("/embed")
def embed_image():
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

    # Load model only when needed
    model_loaded, preprocess_loaded = get_model()

    image_input = preprocess_loaded(image).unsqueeze(0).to(device)
    with torch.no_grad():
        image_features = model_loaded.encode_image(image_input)
        image_features /= image_features.norm(dim=-1, keepdim=True)
        embedding = image_features.cpu().numpy()[0].tolist()

    app.logger.info("Vector length: %d", len(embedding))
    return jsonify({"vector": embedding})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", 8000)))
