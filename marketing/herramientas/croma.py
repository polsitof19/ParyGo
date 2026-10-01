"""Quita el fondo verde (#00FF00) de renders 3D: alfa suave + despill + recorte al contorno.
Uso: python croma.py entrada.png salida.png
"""
import sys

import numpy as np
from PIL import Image

im = np.array(Image.open(sys.argv[1]).convert("RGB")).astype(np.float32)
r, g, b = im[..., 0], im[..., 1], im[..., 2]
exceso = g - np.maximum(r, b)                        # cuánto "más verde" es cada píxel
alfa = np.clip(1 - (exceso - 25) / 70, 0, 1)         # verde fuerte → 0, sin verde → 1, borde suave
im[..., 1] = np.minimum(g, np.maximum(r, b) + 8)     # despill: el verde no supera a rojo/azul
out = np.dstack([im, alfa * 255]).clip(0, 255).astype(np.uint8)
img = Image.fromarray(out, "RGBA")
img = img.crop(img.getchannel("A").point(lambda v: 255 if v > 30 else 0).getbbox())
img.save(sys.argv[2])
print(sys.argv[2], img.size)
