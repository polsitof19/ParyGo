"""Genera imágenes con ComfyUI local (RTX 4060, 8 GB). Sin texto: el texto y el logo los pone claude-design.

Uso:
  py herramientas/comfy.py "prompt" --fecha 2026-10-02-semaforo --nombre semaforo-1
  opciones: --formato feed|historia|cuadrado  --modelo klein|zimage  --ref foto.png [otra.png]
            --sin-fondo  --seed N  --steps N  --n 2 (variantes)
Salida: eventos/<fecha>/diseño/<nombre>.png (+ métricas de tiempo, VRAM y RAM).
"""
import argparse
import io
import json
import random
import subprocess
import sys
import threading
import time
import urllib.request
import uuid
from pathlib import Path

import psutil
from PIL import Image

COMFY = Path(r"C:\ComfyUI\ComfyUI_windows_portable")
URL = "http://127.0.0.1:8188"
RAIZ = Path(__file__).resolve().parent.parent
# tamaño nativo (múltiplo de 16) → tamaño final
FORMATOS = {"banner": ((1536, 640), (1536, 640)), "feed": ((1024, 1280), (1080, 1350)), "historia": ((1024, 1824), (1080, 1920)), "cuadrado": ((1024, 1024), (1080, 1080))}
MODELOS = {
    "klein": dict(unet="flux-2-klein-4b-fp8.safetensors", vae="flux2-vae.safetensors", steps=4, cfg=1.0),
    "zimage": dict(unet="z_image_turbo_int8_convrot.safetensors", vae="ae.safetensors", steps=8, cfg=1.0),
}
CLIP = "qwen_3_4b_fp8_mixed.safetensors"


def api(ruta, datos=None, binario=False):
    req = urllib.request.Request(URL + ruta, data=json.dumps(datos).encode() if datos else None,
                                 headers={"Content-Type": "application/json"} if datos else {})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.read() if binario else json.load(r)
    except urllib.error.HTTPError as e:  # ComfyUI devuelve 400 con el detalle del nodo que falló
        return json.loads(e.read() or b"{}") | {"error": f"HTTP {e.code}"}


def asegurar_comfy():
    try:
        api("/system_stats")
        return
    except Exception:
        pass
    print("ComfyUI no está abierto: arrancando…")
    subprocess.Popen([str(COMFY / "python_embeded" / "python.exe"), "-s", r"ComfyUI\main.py", "--windows-standalone-build"],
                     cwd=COMFY, creationflags=subprocess.CREATE_NEW_CONSOLE)
    for _ in range(120):
        time.sleep(2)
        try:
            api("/system_stats")
            return
        except Exception:
            pass
    sys.exit("ComfyUI no respondió en 4 minutos. Revisa la consola que se abrió.")


def subir_imagen(ruta):
    ruta = Path(ruta)
    limite = uuid.uuid4().hex
    cuerpo = (f"--{limite}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"{ruta.name}\"\r\n"
              f"Content-Type: image/png\r\n\r\n").encode() + ruta.read_bytes() + f"\r\n--{limite}--\r\n".encode()
    req = urllib.request.Request(URL + "/upload/image", data=cuerpo, headers={"Content-Type": f"multipart/form-data; boundary={limite}"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)["name"]


def workflow(prompt, modelo, w, h, seed, steps, refs, prefijo):
    m = MODELOS[modelo]
    n = {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": m["unet"], "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": CLIP, "type": "flux2" if modelo == "klein" else "lumina2", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": m["vae"]}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["2", 0]}},
        "5": {"class_type": "CLIPTextEncode", "inputs": {"text": "", "clip": ["2", 0]}},
    }
    pos, neg = ["4", 0], ["5", 0]
    if modelo == "klein":
        for i, ref in enumerate(refs):  # edición con referencias: LoadImage → escala → VAEEncode → ReferenceLatent
            nombre = subir_imagen(ref)
            n[f"r{i}a"] = {"class_type": "LoadImage", "inputs": {"image": nombre}}
            n[f"r{i}b"] = {"class_type": "ImageScaleToTotalPixels", "inputs": {"image": [f"r{i}a", 0], "upscale_method": "lanczos", "megapixels": 1.0, "resolution_steps": 1}}
            n[f"r{i}c"] = {"class_type": "VAEEncode", "inputs": {"pixels": [f"r{i}b", 0], "vae": ["3", 0]}}
            n[f"r{i}p"] = {"class_type": "ReferenceLatent", "inputs": {"conditioning": pos, "latent": [f"r{i}c", 0]}}
            n[f"r{i}n"] = {"class_type": "ReferenceLatent", "inputs": {"conditioning": neg, "latent": [f"r{i}c", 0]}}
            pos, neg = [f"r{i}p", 0], [f"r{i}n", 0]
        n.update({
            "6": {"class_type": "EmptyFlux2LatentImage", "inputs": {"width": w, "height": h, "batch_size": 1}},
            "7": {"class_type": "RandomNoise", "inputs": {"noise_seed": seed}},
            "8": {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "euler"}},
            "9": {"class_type": "Flux2Scheduler", "inputs": {"steps": steps, "width": w, "height": h}},
            "10": {"class_type": "CFGGuider", "inputs": {"model": ["1", 0], "positive": pos, "negative": neg, "cfg": m["cfg"]}},
            "11": {"class_type": "SamplerCustomAdvanced", "inputs": {"noise": ["7", 0], "guider": ["10", 0], "sampler": ["8", 0], "sigmas": ["9", 0], "latent_image": ["6", 0]}},
            "12": {"class_type": "VAEDecode", "inputs": {"samples": ["11", 0], "vae": ["3", 0]}},
        })
    else:
        n.update({
            "6": {"class_type": "EmptySD3LatentImage", "inputs": {"width": w, "height": h, "batch_size": 1}},
            "10": {"class_type": "ModelSamplingAuraFlow", "inputs": {"model": ["1", 0], "shift": 3.0}},
            "11": {"class_type": "KSampler", "inputs": {"model": ["10", 0], "positive": pos, "negative": neg, "latent_image": ["6", 0], "seed": seed,
                                                       "steps": steps, "cfg": m["cfg"], "sampler_name": "res_multistep", "scheduler": "simple", "denoise": 1.0}},
            "12": {"class_type": "VAEDecode", "inputs": {"samples": ["11", 0], "vae": ["3", 0]}},
        })
    n["13"] = {"class_type": "SaveImage", "inputs": {"images": ["12", 0], "filename_prefix": prefijo}}
    return n


class Medidor:
    """Pico de VRAM (nvidia-smi) y RAM (procesos de ComfyUI) mientras corre la generación."""
    def __init__(self):
        self.vram = self.ram = 0
        self.activo = True
        threading.Thread(target=self._loop, daemon=True).start()

    def _loop(self):
        while self.activo:
            try:
                out = subprocess.run(["nvidia-smi", "--query-gpu=memory.used", "--format=csv,noheader,nounits"], capture_output=True, text=True)
                self.vram = max(self.vram, int(out.stdout.strip()))
                ram = sum(p.memory_info().rss for p in psutil.process_iter(["exe"]) if (p.info["exe"] or "").startswith(str(COMFY)))
                self.ram = max(self.ram, ram // 2**20)
            except Exception:
                pass
            time.sleep(0.5)


def generar(prompt, args, seed):
    (w, h), final = FORMATOS[args.formato]
    prefijo = f"code/{args.nombre}"
    med, t0 = Medidor(), time.time()
    res = api("/prompt", {"prompt": workflow(prompt, args.modelo, w, h, seed, args.steps or MODELOS[args.modelo]["steps"], args.ref, prefijo), "client_id": uuid.uuid4().hex})
    if "error" in res:
        sys.exit(f"ComfyUI rechazó el workflow: {res['error']}\n{json.dumps(res.get('node_errors'), indent=1)}")
    pid = res["prompt_id"]
    while True:
        time.sleep(1)
        h_ = api(f"/history/{pid}")
        if pid in h_:
            if h_[pid]["status"].get("status_str") == "error":
                sys.exit("Error en ComfyUI: " + json.dumps(h_[pid]["status"].get("messages"), indent=1)[:2000])
            img = next(o["images"][0] for o in h_[pid]["outputs"].values() if "images" in o)
            break
    med.activo = False
    seg = time.time() - t0
    datos = api(f"/view?filename={img['filename']}&subfolder={img.get('subfolder', '')}&type=output", binario=True)
    im = Image.open(io.BytesIO(datos)).convert("RGB")

    carpeta = RAIZ / "eventos" / args.fecha / "diseño"
    carpeta.mkdir(parents=True, exist_ok=True)
    sufijo = f"-{seed}" if args.n > 1 else ""
    if args.sin_fondo:
        from rembg import new_session, remove  # isnet-general-use es Apache 2.0 (el default "bria" es NO comercial)
        im.resize(final, Image.LANCZOS).save(carpeta / f"{args.nombre}{sufijo}-confondo.png")
        im = remove(im, session=new_session("isnet-general-use"))
    salida = carpeta / f"{args.nombre}{sufijo}.png"
    im.resize(final, Image.LANCZOS).save(salida)
    print(f"{salida.relative_to(RAIZ)} | {seg:.1f} s | VRAM pico {med.vram} MB | RAM ComfyUI pico {med.ram} MB | seed {seed}")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("prompt")
    p.add_argument("--fecha", required=True, help="carpeta en eventos/, p.ej. 2026-10-02-semaforo")
    p.add_argument("--nombre", required=True)
    p.add_argument("--formato", default="feed", choices=FORMATOS)
    p.add_argument("--modelo", default="klein", choices=MODELOS)
    p.add_argument("--ref", nargs="*", default=[], help="imágenes de referencia (solo klein)")
    p.add_argument("--sin-fondo", action="store_true")
    p.add_argument("--seed", type=int)
    p.add_argument("--steps", type=int)
    p.add_argument("--n", type=int, default=1)
    args = p.parse_args()
    asegurar_comfy()
    for i in range(args.n):
        generar(args.prompt, args, (args.seed + i) if args.seed is not None else random.randint(0, 2**32))


if __name__ == "__main__":
    main()
