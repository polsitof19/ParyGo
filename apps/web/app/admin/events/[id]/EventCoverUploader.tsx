'use client';

import { useEffect, useRef, useState } from 'react';
import { pareceCaptura, medirImagen } from '@/lib/flyer';
import { useFormStatus } from 'react-dom';
import { useFormFeedback } from '@/components/useFormFeedback';
import { ImagePlus } from 'lucide-react';
import { setEventCoverAction, type CoverState } from './cover-actions';

const initial: CoverState = { ok: false, message: null };

export function EventCoverUploader({ eventId, currentUrl, readOnly = false }: { eventId: string; currentUrl: string | null; readOnly?: boolean }) {
  const [state, action] = useFormFeedback(setEventCoverAction, initial);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [avisoFlyer, setAvisoFlyer] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return f ? URL.createObjectURL(f) : null; });
    setFileName(f?.name ?? null);
    // Aviso de captura de pantalla. NO bloquea la subida.
    setAvisoFlyer(null);
    if (f) {
      const { width, height } = await medirImagen(f);
      const v = pareceCaptura(width, height);
      if (v.esCaptura) setAvisoFlyer(v.motivo);
    }
  }
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const shown = preview ?? currentUrl;

  return (
    <form action={action}>
      <input type="hidden" name="event_id" value={eventId} />
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div
          style={{
            width: 132, height: 176, borderRadius: 'var(--r-ctl)', overflow: 'hidden', flexShrink: 0,
            border: '1px solid var(--line)', background: 'var(--paper-2)', display: 'grid', placeItems: 'center',
          }}
        >
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt="flyer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span className="s-muted-3" style={{ fontSize: 12, textAlign: 'center', padding: 8 }}>Sin flyer</span>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          {readOnly ? (
            <p className="s-card__desc">
              {currentUrl ? 'Flyer actual del evento (solo lectura).' : 'Este evento no tiene flyer cargado (solo lectura).'}
            </p>
          ) : (
            <>
              <p className="s-card__desc" style={{ marginBottom: 10 }}>
                Sube el flyer del evento (PNG, JPG o WEBP · vertical o cuadrado · máx 10 MB). Se ve grande en la portada del evento y en tu página de marca.
              </p>
              {/* Input nativo escondido + boton de texto del sistema: el
                  "Choose File" gris de WebKit no es parte de ningun sistema. */}
              <div className="s-file">
                <input id="cover-file" ref={inputRef} type="file" name="cover" accept="image/png,image/jpeg,image/webp" onChange={onPick} className="s-file__input" />
                <label htmlFor="cover-file" className="s-btn s-btn--soft s-btn--sm s-file__btn">
                  {currentUrl ? 'Elegir otra imagen' : 'Elegir imagen'}
                </label>
                <span className="s-file__name">{fileName ?? (currentUrl ? 'El actual' : 'Ninguno elegido')}</span>
              </div>
              <p className="s-hint">
                Sube el <strong>archivo original</strong> del flyer, no una captura de
                pantalla: la captura trae la barra del teléfono y sale borrosa en grande.
              </p>
              {avisoFlyer && (
                <p className="s-err" style={{ marginTop: 8 }}>
                  Esto parece una captura de pantalla. {avisoFlyer} Puedes subirlo igual,
                  pero si tienes el archivo original va a verse mucho mejor.
                </p>
              )}
              <div style={{ marginTop: 12 }}>
                <SubmitBtn hasFile={Boolean(fileName)} hasCurrent={Boolean(currentUrl)} />
              </div>
              {state.message && <p className={state.ok ? 's-hint s-hint--ok' : 's-err'} style={{ marginTop: 8 }}>{state.message}</p>}
            </>
          )}
        </div>
      </div>
    </form>
  );
}

function SubmitBtn({ hasFile, hasCurrent }: { hasFile: boolean; hasCurrent: boolean }) {
  const { pending } = useFormStatus();
  // Había dos botones "Cambiar flyer" (elegir y subir) y confundían: el de
  // elegir dice "Elegir imagen" y este aparece recién con una imagen elegida.
  if (!hasFile && !pending) return null;
  return (
    <button type="submit" className="s-btn s-btn--primary s-btn--sm" disabled={pending}>
      <ImagePlus className="h-4 w-4" /> {pending ? 'Subiendo…' : hasCurrent ? 'Guardar flyer nuevo' : 'Guardar flyer'}
    </button>
  );
}
