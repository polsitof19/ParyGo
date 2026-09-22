'use client';

import { useEffect, useState } from 'react';
import { brandColor, brandFillPair, brandInk } from '@/lib/brandColors';

// Campos de branding (logo + color primario) reutilizados al CREAR una marca y
// al EDITAR el branding de una marca existente. Solo UI: la subida/validación
// real ocurre server-side. Muestra preview en vivo del logo y de cómo se verá el
// color con el contraste automático (botón con texto sobre el color + acento de
// texto sobre crema).
//
// La vista previa usa brandFillPair(), el MISMO par que la PÁGINA PÚBLICA del
// comprador. Antes usaba contrastOn(), que ya no es lo que se sirve ahí: con un
// color de tono medio contrastOn devolvía blanco o tinta crudos sobre el color
// tal cual, mientras la página real aclara u oscurece el relleno hasta llegar a
// 4.5:1. O sea que la previa mostraba un botón que no era el que iba a ver el
// comprador.
// Los emails transaccionales (lib/email/*) usan el MISMO par desde el turno de
// migraciones: lo que se ve acá es lo que ve el comprador en la web y en el
// email. El color crudo de marca quedó solo donde no hay texto encima.
const ACCEPT = 'image/png,image/jpeg,image/webp';

export function BrandingFields({
  defaultColor = '#FF1F8F',
  currentLogoUrl = null,
}: {
  defaultColor?: string;
  currentLogoUrl?: string | null;
}) {
  const [color, setColor] = useState(defaultColor);
  const [hex, setHex] = useState(defaultColor);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  // Sincroniza el campo hex de texto con el selector visual (ambos sentidos).
  function onPicker(v: string) {
    setColor(v);
    setHex(v);
  }
  function onHex(v: string) {
    setHex(v);
    if (/^#[0-9A-Fa-f]{6}$/.test(v)) setColor(v);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    setLogoPreview(f ? URL.createObjectURL(f) : null);
    setFileName(f?.name ?? null);
  }
  useEffect(() => () => { if (logoPreview) URL.revokeObjectURL(logoPreview); }, [logoPreview]);

  const safe = brandColor(color);
  const par = brandFillPair(safe); // el par relleno/texto que sirve la página real
  const ink = brandInk(safe); // color como texto/acento sobre crema
  const previewLogo = logoPreview ?? currentLogoUrl;

  return (
    <>
      <div className="s-field">
        <label htmlFor="logo" className="s-label">Logo (PNG, JPG o WEBP · máx 10 MB · opcional)</label>
        <div className="s-file">
          {previewLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewLogo} alt="preview del logo" style={{ height: 52, width: 52, borderRadius: '50%', border: '1px solid var(--line)', objectFit: 'cover', background: 'var(--surface)' }} />
          ) : (
            <span className="s-avatar" style={{ background: 'var(--paper-2)', color: 'var(--ink-3)', fontSize: 10 }}>—</span>
          )}
          <input id="logo" name="logo" type="file" accept={ACCEPT} onChange={onFile} className="s-file__input" />
          <label htmlFor="logo" className="s-btn s-btn--soft s-btn--sm s-file__btn">
            {previewLogo ? 'Cambiar imagen' : 'Elegir imagen'}
          </label>
          <span className="s-file__name">{fileName ?? (currentLogoUrl ? 'La actual' : 'Ninguna elegida')}</span>
        </div>
      </div>

      <div className="s-field">
        <label htmlFor="primary_color" className="s-label">Color primario (opcional)</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            type="color"
            id="primary_color"
            value={color}
            onChange={(e) => onPicker(e.target.value)}
            aria-label="Selector de color"
            className="s-colorpick"
          />
          <input
            type="text"
            value={hex}
            onChange={(e) => onHex(e.target.value)}
            placeholder="#FFEE8C"
            aria-label="Código hex del color"
            spellCheck={false}
            className="s-input"
            style={{ maxWidth: 140, fontVariantNumeric: 'tabular-nums', textTransform: 'uppercase' }}
          />
        </div>
        {/* El value real que viaja al server (hex normalizado y válido). */}
        <input type="hidden" name="primary_color" value={/^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : safe} />
      </div>

      <div className="s-field">
        <p className="s-label">Vista previa (contraste automático)</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 12, padding: '14px 16px' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 44, padding: '0 18px', borderRadius: 999, background: par.fill, color: par.on, fontWeight: 700, fontSize: 14 }}>
            Comprar entradas
          </span>
          <span style={{ color: ink, fontWeight: 700, fontSize: 13, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            PRÓXIMO EVENTO
          </span>
          <span style={{ width: 28, height: 28, borderRadius: 'var(--r-ctl)', background: safe, border: '1px solid var(--line)' }} aria-hidden="true" />
        </div>
        <p className="s-hint">
          Así se ve el color en la página pública. Si el tono elegido no llega a
          4.5:1 con la tinta ni con el papel, el botón se aclara u oscurece solo
          hasta que se lea: es el mismo cálculo que corre en producción.
        </p>
      </div>
    </>
  );
}
