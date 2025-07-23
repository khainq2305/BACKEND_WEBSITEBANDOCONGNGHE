import clip
import torch
from PIL import Image
import requests
import mysql.connector
import io

# ✅ Kết nối CSDL MySQL
db = mysql.connector.connect(
    host="localhost",
    user="root",
    password="mysql",
    database="duantotnghiep"
)
cursor = db.cursor(dictionary=True)

# ✅ Tải model CLIP
device = "cuda" if torch.cuda.is_available() else "cpu"
model, preprocess = clip.load("ViT-B/14", device=device)

# ✅ Lấy sản phẩm chưa có vector
cursor.execute("SELECT id, thumbnail FROM products WHERE imageVector IS NULL")
products = cursor.fetchall()

print(f"🖼️ Có {len(products)} sản phẩm cần xử lý")

for p in products:
    try:
        print(f"👉 Xử lý ID {p['id']}")

        # Tải ảnh
        response = requests.get(p['thumbnail'])
        image = Image.open(io.BytesIO(response.content)).convert("RGB")
        image_input = preprocess(image).unsqueeze(0).to(device)

        # Tạo vector
        with torch.no_grad():
            embedding = model.encode_image(image_input).cpu().numpy().tolist()[0]

        # Chuyển về JSON string để lưu vào MySQL
        import json
        vector_str = json.dumps(embedding)

        # Cập nhật DB
        cursor.execute(
            "UPDATE products SET imageVector = %s WHERE id = %s",
            (vector_str, p['id'])
        )
        db.commit()
        print(f"✅ Đã lưu vector cho ID {p['id']}")

    except Exception as e:
        print(f"❌ Lỗi với ID {p['id']}: {e}")

cursor.close()
db.close()
print("🎉 Xong tất cả.")
