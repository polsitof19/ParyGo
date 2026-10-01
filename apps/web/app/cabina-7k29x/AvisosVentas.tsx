'use client';

import { useEffect, useState } from 'react';
import { guardarSuscripcionAction, quitarSuscripcionAction, probarAvisoAction } from './push-actions';

// "Avisos de ventas en este teléfono" (0079). Se suscribe con el MISMO service
// worker del escáner (/scan-sw.js, scope /), que ya trae el handler de push.
// En iPhone el push solo existe con ParyGo instalado en la pantalla de inicio
// (iOS 16.4+): en Safari común se explica cómo instalarlo.
type Estado = 'cargando' | 'sin-config' | 'instalar' | 'sin-soporte' | 'bloqueado' | 'apagado' | 'activo';

const aBytes = (b64: string) => {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

async function registro() {
  await navigator.serviceWorker.register('/scan-sw.js');
  return navigator.serviceWorker.ready;
}

export function AvisosVentas({ vapid }: { vapid: string | null }) {
  const [estado, setEstado] = useState<Estado>('cargando');
  const [nota, setNota] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    (async () => {
      if (!vapid) return setEstado('sin-config');
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
      const instalada = window.matchMedia('(display-mode: standalone)').matches;
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        return setEstado(ios && !instalada ? 'instalar' : 'sin-soporte');
      }
      if (Notification.permission === 'denied') return setEstado('bloqueado');
      const reg = await registro();
      setEstado((await reg.pushManager.getSubscription()) ? 'activo' : 'apagado');
    })().catch(() => setEstado('sin-soporte'));
  }, [vapid]);

  async function activar() {
    if (!vapid) return;
    setOcupado(true);
    setNota(null);
    try {
      if ((await Notification.requestPermission()) !== 'granted') return setEstado('bloqueado');
      const reg = await registro();
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(vapid) });
      const r = await guardarSuscripcionAction(sub.toJSON(), navigator.userAgent);
      if (!r.ok) {
        await sub.unsubscribe();
        return setNota('No se pudo guardar este teléfono. Prueba otra vez.');
      }
      setEstado('activo');
      setNota('Listo. Te mandé un aviso de prueba.');
      await probarAvisoAction();
    } catch {
      setNota('No se pudo activar en este navegador.');
    } finally {
      setOcupado(false);
    }
  }

  async function probar() {
    setOcupado(true);
    const r = await probarAvisoAction().catch(() => ({ enviados: 0 }));
    setNota(r.enviados > 0 ? 'Aviso de prueba enviado.' : 'No llegó a ningún teléfono. Vuelve a activarlos.');
    setOcupado(false);
  }

  async function apagar() {
    setOcupado(true);
    const sub = await (await registro()).pushManager.getSubscription();
    if (sub) {
      await quitarSuscripcionAction(sub.endpoint);
      await sub.unsubscribe();
    }
    setEstado('apagado');
    setNota(null);
    setOcupado(false);
  }

  const texto: Record<Estado, string> = {
    cargando: 'Revisando este teléfono…',
    'sin-config': 'Falta configurar la clave de avisos (VAPID_PRIVATE_JWK) en Cloudflare.',
    instalar: 'En iPhone los avisos llegan solo con ParyGo instalado: en Safari toca Compartir → "Agregar a inicio", ábrelo desde ahí y vuelve a esta pantalla.',
    'sin-soporte': 'Este navegador no recibe avisos. Usa Chrome en Android o ParyGo instalado en iPhone.',
    bloqueado: 'Los avisos están bloqueados para ParyGo. Actívalos en los ajustes del teléfono y vuelve.',
    apagado: 'Te llega un aviso al teléfono cada vez que una marca te paga un paquete.',
    activo: 'Activados en este teléfono: cada paquete pagado te llega como aviso.',
  };

  return (
    <section className="s-section" aria-labelledby="v-avisos">
      <h2 className="s-h2 s-h2--sec" id="v-avisos">Avisos de ventas</h2>
      <p className="s-section-lead">{texto[estado]}</p>
      {estado === 'apagado' && (
        <button type="button" className="s-btn s-btn--soft" onClick={activar} disabled={ocupado}>
          Activar en este teléfono
        </button>
      )}
      {estado === 'activo' && (
        <div className="s-form-actions">
          <button type="button" className="s-btn s-btn--soft" onClick={probar} disabled={ocupado}>Mandar aviso de prueba</button>
          <button type="button" className="s-btn s-btn--ghost" onClick={apagar} disabled={ocupado}>Desactivar</button>
        </div>
      )}
      {nota && <p className="s-section-lead" role="status">{nota}</p>}
    </section>
  );
}
