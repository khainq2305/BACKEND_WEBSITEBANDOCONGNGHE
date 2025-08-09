from flask import Flask, request, jsonify
from flask_cors import CORS
import torch, clip
from PIL import Image
import io, os

app = Flask(__name__)

# CORS: đọc từ ENV CORS_ORIGIN="https://app.domain.com,http://localhost:5173"
origins = [o.strip() for o in (os.getenv("CORS_ORIGIN") or "*").split(",")]
CORS(app, origins=origins, supports_credentials=True)

device = "cuda" if torch.cuda.is_available() else "cpu"  # Render free: thường là CPU
model, preprocess = clip.load("ViT-B/32", device=device)

@app.get("/health")
def health():
    return jsonify(ok=True)

@app.post("/embed")
def embed_image():
    if "image" not in request.files:
        return jsonify({"error": "No image uploaded"}), 400

    image_bytes = request.files["image"].read()
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    image_input = preprocess(image).unsqueeze(0).to(device)

    with torch.no_grad():
        image_features = model.encode_image(image_input)
        image_features /= image_features.norm(dim=-1, keepdim=True)
        embedding = image_features.cpu().numpy()[0].tolist()

    return jsonify({"vector": embedding})

if __name__ == "__main__":
    # Render cấp PORT qua biến môi trường
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", 8000)))
