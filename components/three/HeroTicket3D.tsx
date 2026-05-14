'use client';

import { useEffect, useRef } from 'react';
import type { BufferAttribute } from 'three';

// Procedural ticket texture painted into a 2D canvas; uploaded as a Three.js
// CanvasTexture so we never need to ship a PNG. Mirrors the design source.
function paintTicketTexture(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 720;
  const g = c.getContext('2d');
  if (!g) return c;

  // background gradient
  const grd = g.createLinearGradient(0, 0, 0, 720);
  grd.addColorStop(0, '#1a0e22');
  grd.addColorStop(1, '#0a0a14');
  g.fillStyle = grd;
  g.fillRect(0, 0, 512, 720);

  // border
  g.strokeStyle = '#FF1F8F';
  g.lineWidth = 2;
  g.strokeRect(8, 8, 496, 704);

  // PARYGO header
  g.fillStyle = '#FFFFFF';
  g.font = 'bold 56px Anton, Impact, sans-serif';
  g.textAlign = 'center';
  g.fillText('PARYGO', 256, 76);

  g.fillStyle = '#B4B4C0';
  g.font = '14px "JetBrains Mono", monospace';
  g.fillText('· TICKETING ·', 256, 102);

  // event title
  g.fillStyle = '#FFFFFF';
  g.font = '700 38px Anton, Impact, sans-serif';
  g.fillText('DENSITY', 256, 170);
  g.fillStyle = '#FF1F8F';
  g.fillText('NOCHE 04', 256, 212);

  g.fillStyle = '#B4B4C0';
  g.font = '14px "JetBrains Mono", monospace';
  g.fillText('SAB 24 MAY · 22:00', 256, 244);

  // QR pseudo-pattern
  const qrSize = 240;
  const qx = 256 - qrSize / 2;
  const qy = 290;
  g.fillStyle = '#FFFFFF';
  g.fillRect(qx - 8, qy - 8, qrSize + 16, qrSize + 16);

  const cells = 24;
  const cs = qrSize / cells;

  let seed = 1234567;
  const rnd = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  g.fillStyle = '#0a0a14';
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      if (
        (x < 7 && y < 7) ||
        (x > 16 && y < 7) ||
        (x < 7 && y > 16)
      ) {
        continue;
      }
      if (rnd() < 0.48) g.fillRect(qx + x * cs, qy + y * cs, cs, cs);
    }
  }

  const marker = (mx: number, my: number) => {
    g.fillStyle = '#0a0a14';
    g.fillRect(qx + mx * cs, qy + my * cs, cs * 7, cs * 7);
    g.fillStyle = '#FFFFFF';
    g.fillRect(qx + (mx + 1) * cs, qy + (my + 1) * cs, cs * 5, cs * 5);
    g.fillStyle = '#0a0a14';
    g.fillRect(qx + (mx + 2) * cs, qy + (my + 2) * cs, cs * 3, cs * 3);
  };
  marker(0, 0);
  marker(17, 0);
  marker(0, 17);

  // perforation
  g.strokeStyle = '#2A2A38';
  g.setLineDash([6, 6]);
  g.beginPath();
  g.moveTo(40, 570);
  g.lineTo(472, 570);
  g.stroke();
  g.setLineDash([]);

  // stub
  g.fillStyle = '#FFFFFF';
  g.font = 'bold 18px "JetBrains Mono", monospace';
  g.textAlign = 'center';
  g.fillText('· ADMIT ONE ·', 256, 612);

  g.fillStyle = '#B4B4C0';
  g.font = '12px "JetBrains Mono", monospace';
  g.fillText('TKT/A8F4-92K-2026', 256, 638);

  // barcode
  g.fillStyle = '#FFFFFF';
  const bx = 100;
  const by = 660;
  const bw = 312;
  for (let i = 0; i < 60; i++) {
    const w = Math.max(1, Math.floor(rnd() * 4));
    g.fillRect(bx + i * (bw / 60), by, w, 28);
  }

  return c;
}

export default function HeroTicket3D() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<{
    cleanup: (() => void) | null;
    mounted: boolean;
  }>({ cleanup: null, mounted: false });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mount = mountRef.current;
    if (!mount) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    let cancelled = false;

    const init = async () => {
      if (stateRef.current.mounted || cancelled) return;
      // Dynamic Three.js import — keeps it out of the main chunk.
      const THREE = await import('three');
      if (cancelled || stateRef.current.mounted) return;
      stateRef.current.mounted = true;

      const W = mount.clientWidth;
      const H = mount.clientHeight;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(32, W / H, 0.1, 100);
      camera.position.set(0, 0, 6);

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
      renderer.setSize(W, H, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      mount.appendChild(renderer.domElement);

      // ticket shape with rounded corners
      const w = 1.6;
      const h = 2.4;
      const r = 0.12;
      const shape = new THREE.Shape();
      shape.moveTo(-w / 2 + r, -h / 2);
      shape.lineTo(w / 2 - r, -h / 2);
      shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
      shape.lineTo(w / 2, h / 2 - r);
      shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
      shape.lineTo(-w / 2 + r, h / 2);
      shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
      shape.lineTo(-w / 2, -h / 2 + r);
      shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);

      const geom = new THREE.ExtrudeGeometry(shape, {
        depth: 0.06,
        bevelEnabled: true,
        bevelThickness: 0.012,
        bevelSize: 0.012,
        bevelSegments: 2,
        curveSegments: 12,
      });

      // remap UVs onto front face
      geom.computeBoundingBox();
      const bb = geom.boundingBox!;
      const uvAttr = geom.attributes.uv as BufferAttribute;
      const posAttr = geom.attributes.position as BufferAttribute;
      for (let i = 0; i < uvAttr.count; i++) {
        const x = posAttr.getX(i);
        const y = posAttr.getY(i);
        uvAttr.setXY(
          i,
          (x - bb.min.x) / (bb.max.x - bb.min.x),
          1 - (y - bb.min.y) / (bb.max.y - bb.min.y)
        );
      }
      uvAttr.needsUpdate = true;

      const canvas = paintTicketTexture();
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;

      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        metalness: 0.45,
        roughness: 0.4,
        emissive: new THREE.Color('#220714'),
        emissiveIntensity: 0.6,
      });

      const mesh = new THREE.Mesh(geom, mat);
      scene.add(mesh);

      const key = new THREE.DirectionalLight('#ffe7d4', 1.2);
      key.position.set(2, 3, 4);
      scene.add(key);
      const rim = new THREE.DirectionalLight('#FF1F8F', 0.9);
      rim.position.set(-3, -2, 1);
      scene.add(rim);
      const fill = new THREE.DirectionalLight('#00E5FF', 0.35);
      fill.position.set(-1, 2, 2);
      scene.add(fill);
      scene.add(new THREE.AmbientLight('#202028', 0.4));

      mount.classList.add('has-3d');

      let mouseX = 0;
      let mouseY = 0;
      const onMove = (ev: MouseEvent) => {
        const rect = mount.getBoundingClientRect();
        mouseX = ((ev.clientX - rect.left) / rect.width - 0.5) * 2;
        mouseY = ((ev.clientY - rect.top) / rect.height - 0.5) * 2;
      };
      document.addEventListener('mousemove', onMove);

      const onResize = () => {
        const W2 = mount.clientWidth;
        const H2 = mount.clientHeight;
        camera.aspect = W2 / H2;
        camera.updateProjectionMatrix();
        renderer.setSize(W2, H2, false);
      };
      window.addEventListener('resize', onResize);

      let animId = 0;
      const animate = (t: number) => {
        mesh.rotation.y += 0.004;
        mesh.rotation.x += (mouseY * 0.25 - mesh.rotation.x) * 0.04;
        mesh.position.y = Math.sin(t * 0.0008) * 0.06;
        mesh.position.x += (mouseX * 0.18 - mesh.position.x) * 0.04;
        renderer.render(scene, camera);
        animId = requestAnimationFrame(animate);
      };
      animId = requestAnimationFrame(animate);

      stateRef.current.cleanup = () => {
        cancelAnimationFrame(animId);
        document.removeEventListener('mousemove', onMove);
        window.removeEventListener('resize', onResize);
        geom.dispose();
        mat.dispose();
        tex.dispose();
        renderer.dispose();
        if (renderer.domElement.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
        mount.classList.remove('has-3d');
        stateRef.current.mounted = false;
      };
    };

    const destroy = () => {
      const fn = stateRef.current.cleanup;
      if (fn) {
        fn();
        stateRef.current.cleanup = null;
      }
    };

    const scheduleInit = () => {
      const w = window as typeof window & {
        requestIdleCallback?: (cb: () => void) => void;
      };
      if (typeof w.requestIdleCallback === 'function') {
        w.requestIdleCallback(() => init());
      } else {
        window.setTimeout(() => init(), 100);
      }
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            scheduleInit();
          } else {
            destroy();
          }
        }
      },
      { rootMargin: '200px 0px' }
    );
    io.observe(mount);

    return () => {
      cancelled = true;
      io.disconnect();
      destroy();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      id="heroVisual"
      className="hero-visual relative aspect-[4/5] w-full max-w-[460px] justify-self-end z-[1]"
      style={{ marginRight: '-2vw' }}
    >
      <span
        className="absolute pointer-events-none z-0"
        style={{
          inset: '8% -8% 8% -8%',
          background:
            'radial-gradient(circle at 50% 50%, rgba(255,31,143,0.32), transparent 55%)',
          filter: 'blur(30px)',
        }}
        aria-hidden="true"
      />
      {/* Static SVG fallback shown until Three.js mounts */}
      <div
        className="absolute inset-[8%] grid place-items-center border border-border rounded-xl z-[1] hero-fallback"
        style={{
          background: 'linear-gradient(180deg, #1a1020, #0a0a14)',
        }}
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 220 280"
          xmlns="http://www.w3.org/2000/svg"
          style={{ width: '70%', height: 'auto' }}
        >
          <defs>
            <linearGradient id="hero-tg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#1a0e22" />
              <stop offset="100%" stopColor="#0a0a14" />
            </linearGradient>
          </defs>
          <rect
            x="20"
            y="20"
            width="180"
            height="240"
            rx="10"
            fill="url(#hero-tg)"
            stroke="#FF1F8F"
            strokeWidth="1.5"
            opacity="0.9"
          />
          <text
            x="110"
            y="48"
            textAnchor="middle"
            fontFamily="Anton, Impact, sans-serif"
            fontSize="16"
            fill="#fff"
            letterSpacing="2"
          >
            PARYGO
          </text>
          <line
            x1="20"
            y1="180"
            x2="200"
            y2="180"
            stroke="#2A2A38"
            strokeDasharray="3 3"
          />
          <text
            x="110"
            y="210"
            textAnchor="middle"
            fontFamily="JetBrains Mono, monospace"
            fontSize="10"
            fill="#B4B4C0"
            letterSpacing="3"
          >
            ADMIT ONE
          </text>
          <text
            x="110"
            y="230"
            textAnchor="middle"
            fontFamily="JetBrains Mono, monospace"
            fontSize="8"
            fill="#6B6B7A"
            letterSpacing="2"
          >
            TKT/A8F4-92K
          </text>
        </svg>
      </div>
      <style>{`
        .hero-visual.has-3d .hero-fallback { display: none; }
        .hero-visual canvas { display: block; width: 100% !important; height: 100% !important; position: relative; z-index: 2; }
      `}</style>
    </div>
  );
}
