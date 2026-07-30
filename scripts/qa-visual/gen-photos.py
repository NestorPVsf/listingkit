"""Genera 5 fotos sinteticas reconocibles (grid + numero + horizonte) para QA
visual de deformacion/recorte. Salida: scripts/qa-visual/photos/demo-N.jpg
"""
from PIL import Image, ImageDraw, ImageFont
import os

OUT = os.path.join(os.path.dirname(__file__), "photos")
os.makedirs(OUT, exist_ok=True)

COLORS = [
    ("#2a6f77", "#e8d9b5"),
    ("#7a4b2a", "#f2e8d5"),
    ("#3d5a3d", "#eef2e6"),
    ("#5a3d5a", "#f2e6f2"),
    ("#7a2a2a", "#f5e6e6"),
]

W, H = 1600, 1067  # ratio 3:2, distinto de todos los targets (1080x1350 etc) para detectar crop/deform

for i in range(5):
    bg, fg = COLORS[i]
    img = Image.new("RGB", (W, H), bg)
    d = ImageDraw.Draw(img)
    # horizonte marcado (linea horizontal) a 40% de altura -> detecta flip/rotacion
    horizon_y = int(H * 0.4)
    d.rectangle([0, horizon_y, W, H], fill=fg)
    # grid de referencia cada 100px para detectar stretch
    for x in range(0, W, 100):
        d.line([(x, 0), (x, H)], fill=(0, 0, 0), width=1)
    for y in range(0, H, 100):
        d.line([(0, y), (W, y)], fill=(0, 0, 0), width=1)
    # marco rojo grueso en el borde exterior -> si se corta, se ve
    d.rectangle([0, 0, W - 1, H - 1], outline=(255, 0, 0), width=12)
    # circulo centrado -> si se deforma, se ve elipse
    r = 200
    cx, cy = W // 2, H // 2
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(255, 255, 0), width=10)
    # numero grande de foto
    try:
        font = ImageFont.truetype("arial.ttf", 220)
    except Exception:
        font = ImageFont.load_default()
    text = f"FOTO {i + 1}"
    bbox = d.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text(((W - tw) / 2, (H - th) / 2 - bbox[1]), text, fill=(255, 255, 255), font=font)

    path = os.path.join(OUT, f"demo-{i + 1}.jpg")
    img.save(path, "JPEG", quality=90)
    print(path)
