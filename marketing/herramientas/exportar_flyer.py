"""HTML → PNG con Playwright. Uso: python exportar_flyer.py archivo.html salida.png ANCHO ALTO"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

html, out, w, h = Path(sys.argv[1]).resolve(), sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": w, "height": h})
    errores = []
    pg.on("console", lambda m: m.type == "error" and errores.append(m.text))
    pg.goto(html.as_uri())
    pg.wait_for_load_state("networkidle")
    pg.evaluate("document.fonts.ready")
    pg.screenshot(path=out, full_page=False)
    b.close()
print("ok", out, "errores consola:", errores or "ninguno")
