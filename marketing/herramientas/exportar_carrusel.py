"""Exporta un carrusel HTML (slides ?s=1..N, historia con &h=1920) a PNG y arma una vista previa.
Uso: python exportar_carrusel.py "ruta/Carrusel.html" prefijo [n_slides=3]
"""
import sys
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

html, prefijo = Path(sys.argv[1]).resolve(), sys.argv[2]
n = int(sys.argv[3]) if len(sys.argv) > 3 else 3
carpeta = html.parent
trabajos = [(s, 1350, f"{s}") for s in range(1, n + 1)] + [(1, 1920, "historia")]
with sync_playwright() as p:
    b = p.chromium.launch()
    for s, h, nombre in trabajos:
        pg = b.new_page(viewport={"width": 1080, "height": h})
        err = []
        pg.on("console", lambda m: m.type == "error" and err.append(m.text))
        pg.goto(f"{html.as_uri()}?s={s}&h={h}")
        pg.wait_for_load_state("networkidle")
        pg.evaluate("document.fonts.ready")
        pg.screenshot(path=carpeta / f"{prefijo}-{nombre}.png")
        print("ok", f"{prefijo}-{nombre}.png", err or "")
    b.close()
ims = [Image.open(carpeta / f"{prefijo}-{s}.png") for s in range(1, n + 1)]
vista = Image.new("RGB", (1080 * n, 1350))
for i, im in enumerate(ims):
    vista.paste(im, (i * 1080, 0))
vista.resize((540 * n, 675)).save(carpeta / "_vista.png")
