from flask import Flask, request, jsonify
from flask_cors import CORS
import torch
import clip
from PIL import Image
import io

app = Flask(__name__)
CORS(app)

device = "cuda" if torch.cuda.is_available() else "cpu"
model, preprocess = clip.load("ViT-B/32", device=device)

@app.route("/embed", methods=["POST"])
def embed_image():
    if "image" not in request.files:
        return jsonify({"error": "No image uploaded"}), 400

    image_file = request.files["image"]
    image_bytes = image_file.read()
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    image_input = preprocess(image).unsqueeze(0).to(device)

    with torch.no_grad():
        image_features = model.encode_image(image_input)
        image_features /= image_features.norm(dim=-1, keepdim=True)
        embedding = image_features.cpu().numpy()[0].tolist()

    return jsonify({"vector": embedding})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000)
