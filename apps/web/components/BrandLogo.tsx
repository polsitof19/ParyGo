'use client';

import { useEffect, useRef, useState } from 'react';
import { optimizedImage } from '@/lib/imageUrl';

// =============================================================
// BrandLogo — render unificado del logo de marca (regla HÍBRIDA)
// =============================================================
// Un solo lugar decide cómo se ve el logo en todas las superficies:
//   - Imagen ~cuadrada (ratio 0.8–1.25): object-fit COVER → llena el círculo
//     (look "avatar", como WhatsApp). Caso ícono (hoesky, ensayo-paul).
//   - Imagen ancha (wordmark): object-fit CONTAIN + fondo neutro → el nombre
//     no se recorta. Caso logo-con-texto (p. ej. code, demotest).
//   - El ratio se detecta en el cliente (naturalWidth/naturalHeight) al cargar;
//     así funciona con los logos YA subidos sin migración ni backfill.
// El chip (fondo casi-blanco) + el anillo separan cualquier color de logo de la
// barra de marca (arregla el "rosa flotando sobre cyan"). Solo presentación.

// Color del chip. Se usa en dos formatos (hex para background, rgba para el
// halo del boxShadow); mantenerlos en sync desde acá.
const CHIP_HEX = '#fffdfb';
const CHIP_RGBA = 'rgba(255,253,251,.9)';

type Props = {
  src: string;
  alt: string;
  size?: number; // diámetro en px
  eager?: boolean; // above-the-fold (header)
  ring?: boolean; // anillo de separación sobre barras de color
};

export function BrandLogo({ src, alt, size = 36, eager = false, ring = true }: Props) {
  // Default COVER: la mayoría de logos son íconos ~cuadrados → render correcto al
  // instante. Un wordmark ancho corrige a CONTAIN en cuanto se mide (flash mínimo).
  const [fit, setFit] = useState<'cover' | 'contain'>('cover');
  const imgRef = useRef<HTMLImageElement>(null);

  // px del origen: 3× el tamaño para nitidez en retina, con piso de 96px para que
  // logos chicos (28px topbar) no se pixelen.
  const px = Math.max(Math.round(size * 3), 96);
  const optimized = optimizedImage(src, { width: px, quality: 85 }) ?? src;

  function measure(img: HTMLImageElement) {
    if (!img.naturalWidth || !img.naturalHeight) return;
    const r = img.naturalWidth / img.naturalHeight;
    setFit(r >= 0.8 && r <= 1.25 ? 'cover' : 'contain');
  }

  // Red de seguridad para imágenes CACHEADAS: si el navegador ya tenía la imagen,
  // el evento `load` pudo dispararse ANTES de la hidratación (onLoad nunca corre).
  // Medimos también al montar si la imagen ya está completa. Sin esto, un wordmark
  // cacheado quedaría atascado en 'cover' (recortado) en visitas repetidas.
  useEffect(() => {
    if (imgRef.current?.complete) measure(imgRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <span
      style={{
        width: size,
        height: size,
        flex: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '50%',
        overflow: 'hidden',
        background: CHIP_HEX,
        boxShadow: ring
          ? `inset 0 0 0 1px rgba(0,0,0,.06), 0 0 0 2px ${CHIP_RGBA}, 0 1px 3px rgba(0,0,0,.16)`
          : 'inset 0 0 0 1px rgba(0,0,0,.06)',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={optimized}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        onLoad={(e) => measure(e.currentTarget)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: fit,
          // el wordmark respira un poco (11%) para no pegarse al anillo
          padding: fit === 'contain' ? '11%' : 0,
        }}
      />
    </span>
  );
}
