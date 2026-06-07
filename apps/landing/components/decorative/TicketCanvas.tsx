'use client';

import { useEffect, useRef } from 'react';

// Glossy 3D ticket for the hero. Built on three.js, loaded LAZILY:
//  - three is dynamic-import()ed only when the hero is near the viewport, so it
//    never lands in the initial bundle.
//  - Skipped entirely on prefers-reduced-motion or when WebGL is unavailable →
//    the static SVG fallback (rendered by the parent) stays visible.
//  - dpr capped at 1.8, paused/destroyed when offscreen → light on mobile.
//  - Reacts to the mouse (parallax), the scroll (gentle turn + zoom) and hover
//    (the ticket "lifts" a touch).
export function TicketCanvas({ mountId }: { mountId: string }) {
  const cleanupRef = useRef<() => void>(() => {});

  useEffect(() => {
    const mount = document.getElementById(mountId);
    if (!mount) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return; // fallback SVG remains visible

    let disposed = false;
    let started = false;

    async function start() {
      if (started || disposed) return;
      started = true;
      let THREE: typeof import('three');
      try {
        THREE = await import('three');
      } catch (err) {
        console.warn('[TicketCanvas] three import failed → static fallback', err);
        return; // bundle failed → keep fallback
      }
      if (disposed || !mount) return;

      // Wait for the brand font so the canvas ticket label renders crisp.
      try {
        if (document.fonts?.ready) await document.fonts.ready;
      } catch {
        /* ignore */
      }
      if (disposed) return;

      const css = getComputedStyle(document.documentElement);
      const display = (css.getPropertyValue('--font-bricolage') || 'Bricolage Grotesque').trim();
      const bodyFont = (css.getPropertyValue('--font-hanken') || 'Hanken Grotesk').trim();

      const W = mount.clientWidth || 480;
      const H = mount.clientHeight || 480;

      let renderer: import('three').WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
      } catch (err) {
        console.warn('[TicketCanvas] WebGL unavailable → static fallback', err);
        return; // no WebGL → keep fallback
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
      renderer.setSize(W, H, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      mount.appendChild(renderer.domElement);
      mount.classList.add('has3d');

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 100);
      camera.position.set(0, 0, 6.4);
      const group = new THREE.Group();
      scene.add(group);

      // --- ticket face texture (canvas) ---
      const c = document.createElement('canvas');
      c.width = 700;
      c.height = 440;
      const g = c.getContext('2d')!;
      g.fillStyle = '#FFFFFF';
      g.fillRect(0, 0, 700, 440);
      const grd = g.createLinearGradient(0, 0, 0, 150);
      grd.addColorStop(0, '#FF8E5E');
      grd.addColorStop(1, '#FF6A3D');
      g.fillStyle = grd;
      g.fillRect(0, 0, 700, 150);
      g.textBaseline = 'middle';
      g.fillStyle = '#FFFFFF';
      g.font = `800 54px ${display}, sans-serif`;
      g.fillText('parygo.', 40, 78);
      g.fillStyle = '#231C17';
      g.font = `800 46px ${display}, sans-serif`;
      g.fillText('VERANO SUNSET', 40, 220);
      g.fillStyle = '#FF6A3D';
      g.font = `800 40px ${display}, sans-serif`;
      g.fillText('NOCHE 04', 40, 268);
      g.fillStyle = '#6B5F54';
      g.font = `500 20px ${bodyFont}, sans-serif`;
      g.fillText('SÁB 24 ENE · CLUB DELMAR · LIMA', 40, 312);
      g.fillStyle = '#231C17';
      g.font = `700 22px ${bodyFont}, sans-serif`;
      g.fillText('★ ADMIT ONE', 40, 372);
      g.fillStyle = '#A89B8C';
      g.font = `500 16px ${bodyFont}, sans-serif`;
      g.fillText('TKT / VS04-2026', 40, 404);

      g.strokeStyle = '#EFE6D6';
      g.lineWidth = 3;
      g.setLineDash([8, 8]);
      g.beginPath();
      g.moveTo(520, 20);
      g.lineTo(520, 420);
      g.stroke();
      g.setLineDash([]);

      const qx = 558, qy = 150, qs = 110;
      const cells = 11, cs = qs / cells;
      let seed = 98765;
      const rnd = () => {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
      };
      g.fillStyle = '#231C17';
      for (let y = 0; y < cells; y++)
        for (let x = 0; x < cells; x++) {
          if ((x < 3 && y < 3) || (x > 7 && y < 3) || (x < 3 && y > 7)) continue;
          if (rnd() < 0.5) g.fillRect(qx + x * cs, qy + y * cs, cs, cs);
        }
      const mk = (mxp: number, myp: number) => {
        g.fillStyle = '#231C17';
        g.fillRect(qx + mxp * cs, qy + myp * cs, cs * 3, cs * 3);
        g.fillStyle = '#FFF';
        g.fillRect(qx + (mxp + 0.7) * cs, qy + (myp + 0.7) * cs, cs * 1.6, cs * 1.6);
        g.fillStyle = '#FF6A3D';
        g.fillRect(qx + (mxp + 1.1) * cs, qy + (myp + 1.1) * cs, cs * 0.8, cs * 0.8);
      };
      mk(0, 0); mk(8, 0); mk(0, 8);
      g.fillStyle = '#6B5F54';
      g.font = `700 15px ${bodyFont}, sans-serif`;
      g.textAlign = 'center';
      g.fillText('ESCANEA', 593, 300);
      g.fillText('EN PUERTA', 593, 320);
      g.textAlign = 'left';

      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;

      // --- rounded ticket geometry ---
      const w = 2.7, h = 1.7, r = 0.18;
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

      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: 0.12, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 4, curveSegments: 24,
      });
      geo.computeBoundingBox();
      const bb = geo.boundingBox!;
      const uv = geo.attributes.uv as import('three').BufferAttribute | undefined;
      const pos = geo.attributes.position as import('three').BufferAttribute | undefined;
      if (uv && pos) {
        for (let i = 0; i < uv.count; i++) {
          const x = pos.getX(i), y = pos.getY(i);
          uv.setXY(i, (x - bb.min.x) / (bb.max.x - bb.min.x), (y - bb.min.y) / (bb.max.y - bb.min.y));
        }
        uv.needsUpdate = true;
      }

      const front = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.28, metalness: 0.0, clearcoat: 0.9, clearcoatRoughness: 0.18, reflectivity: 0.4 });
      const side = new THREE.MeshPhysicalMaterial({ color: '#FF6A3D', roughness: 0.35, metalness: 0.0, clearcoat: 0.8, clearcoatRoughness: 0.2 });
      const ticket = new THREE.Mesh(geo, [front, side]);
      group.add(ticket);

      const sphereA = new THREE.Mesh(new THREE.SphereGeometry(0.22, 32, 32), new THREE.MeshPhysicalMaterial({ color: '#5B6CFF', roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.1 }));
      sphereA.position.set(1.7, 1.05, 0.6);
      group.add(sphereA);
      const sphereB = new THREE.Mesh(new THREE.SphereGeometry(0.15, 32, 32), new THREE.MeshPhysicalMaterial({ color: '#FFFFFF', roughness: 0.25, clearcoat: 1 }));
      sphereB.position.set(-1.6, -0.95, 0.7);
      group.add(sphereB);

      scene.add(new THREE.AmbientLight('#fff4e8', 0.85));
      const key = new THREE.DirectionalLight('#ffffff', 1.5);
      key.position.set(3, 4, 5);
      scene.add(key);
      const warm = new THREE.DirectionalLight('#FFB48E', 0.7);
      warm.position.set(-4, -1, 2);
      scene.add(warm);
      const rim = new THREE.PointLight('#5B6CFF', 0.6, 20);
      rim.position.set(-3, 2, -2);
      scene.add(rim);

      // --- interaction state ---
      let mx = 0, my = 0;
      let scrollT = 0; // 0..1 across the hero
      let hover = 0, hoverTarget = 0;

      const onMove = (e: MouseEvent) => {
        const rc = mount.getBoundingClientRect();
        mx = ((e.clientX - rc.left) / rc.width - 0.5) * 2;
        my = ((e.clientY - rc.top) / rc.height - 0.5) * 2;
      };
      const onScroll = () => {
        const rc = mount.getBoundingClientRect();
        // progress as the hero visual scrolls up through the viewport
        scrollT = Math.min(1, Math.max(0, (window.innerHeight - rc.top) / (window.innerHeight + rc.height)));
      };
      const onEnter = () => { hoverTarget = 1; };
      const onLeave = () => { hoverTarget = 0; };
      const onResize = () => {
        const nW = mount.clientWidth, nH = mount.clientHeight;
        camera.aspect = nW / nH;
        camera.updateProjectionMatrix();
        renderer.setSize(nW, nH, false);
      };
      window.addEventListener('mousemove', onMove, { passive: true });
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onResize);
      mount.addEventListener('pointerenter', onEnter);
      mount.addEventListener('pointerleave', onLeave);
      onScroll();

      let animId = 0;
      const animate = (t: number) => {
        if (disposed) return;
        const time = t * 0.001;
        hover += (hoverTarget - hover) * 0.08;
        // base float + mouse parallax
        group.position.y = Math.sin(time * 0.9) * 0.12 + hover * 0.12;
        // refinamiento 3: el scroll gira y acerca suave el ticket
        group.rotation.y += (mx * 0.5 + scrollT * 0.6 - group.rotation.y) * 0.05 + 0.0015;
        group.rotation.x += ((my * 0.3 - 0.04) - group.rotation.x) * 0.05;
        group.rotation.z = Math.sin(time * 0.6) * 0.02;
        // refinamiento 4: "se despega" al hover (+ leve acercamiento al scroll)
        const s = 1 + hover * 0.05 + scrollT * 0.06;
        group.scale.setScalar(s);
        renderer.render(scene, camera);
        animId = requestAnimationFrame(animate);
      };
      animId = requestAnimationFrame(animate);

      cleanupRef.current = () => {
        cancelAnimationFrame(animId);
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onResize);
        mount.removeEventListener('pointerenter', onEnter);
        mount.removeEventListener('pointerleave', onLeave);
        scene.traverse((o) => {
          const mesh = o as import('three').Mesh;
          if (mesh.geometry) mesh.geometry.dispose();
          const mat = mesh.material;
          if (mat) Array.isArray(mat) ? mat.forEach((m) => m.dispose()) : mat.dispose();
        });
        tex.dispose();
        renderer.dispose();
        if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
        mount.classList.remove('has3d');
        started = false;
      };
    }

    // Lazy: only spin up the 3D when the hero is near the viewport.
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            // Schedule reliably on ALL browsers. We deliberately DON'T use
            // requestIdleCallback here: on desktop Chrome the hero's continuous
            // CSS animations starve the idle queue, so start() never fired and
            // the 3D stayed on the fallback — while mobile Safari (no rIC) hit
            // the timer path and worked. A plain timer mounts on both. The 3D
            // is already off the critical path (lazy dynamic import + this IO).
            window.setTimeout(() => start(), 50);
          } else {
            cleanupRef.current();
            cleanupRef.current = () => {};
          }
        }
      },
      { rootMargin: '150px 0px' }
    );
    io.observe(mount);

    return () => {
      disposed = true;
      io.disconnect();
      cleanupRef.current();
      cleanupRef.current = () => {};
    };
  }, [mountId]);

  return null;
}
