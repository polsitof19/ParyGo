'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

// Renders the official MercadoPago Wallet Brick (MP.js) using the brand's
// PUBLIC key + a server-created preference. The buyer clicks the MP button and
// is handed off to MercadoPago Checkout Pro to pay; our webhook (2.3) confirms
// the payment and emits the ticket. If the SDK fails to load (CSP, offline,
// ad-blocker), the init_point link below is a working fallback.
//
// Security: only the public_key (inherently public) reaches the browser. The
// access_token never leaves the server.

declare global {
  interface Window {
    // MP SDK global; typed loosely on purpose (no official browser types here).
    MercadoPago?: new (publicKey: string, opts?: { locale?: string }) => {
      bricks: () => {
        create: (
          brick: 'wallet',
          containerId: string,
          settings: { initialization: { preferenceId: string } }
        ) => Promise<unknown>;
      };
    };
  }
}

const SDK_SRC = 'https://sdk.mercadopago.com/js/v2';
const CONTAINER_ID = 'mp-wallet-brick';

function loadSdk(): Promise<NonNullable<Window['MercadoPago']>> {
  return new Promise((resolve, reject) => {
    if (window.MercadoPago) return resolve(window.MercadoPago);
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SDK_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => {
        window.MercadoPago ? resolve(window.MercadoPago) : reject(new Error('sdk'));
      });
      existing.addEventListener('error', () => reject(new Error('sdk')));
      return;
    }
    const s = document.createElement('script');
    s.src = SDK_SRC;
    s.async = true;
    s.onload = () => (window.MercadoPago ? resolve(window.MercadoPago) : reject(new Error('sdk')));
    s.onerror = () => reject(new Error('sdk'));
    document.body.appendChild(s);
  });
}

export function MercadoPagoWallet({
  publicKey,
  preferenceId,
  initPoint,
}: {
  publicKey: string;
  preferenceId: string;
  initPoint: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const renderedRef = useRef(false);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const MP = await loadSdk();
        if (cancelled || renderedRef.current || !containerRef.current) return;
        renderedRef.current = true;
        const mp = new MP(publicKey, { locale: 'es-PE' });
        await mp.bricks().create('wallet', CONTAINER_ID, {
          initialization: { preferenceId },
        });
        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publicKey, preferenceId]);

  return (
    <div className="c-card" style={{ maxWidth: 520, margin: '0 auto' }}>
      <p className="c-card__title">Paga con MercadoPago</p>
      {!failed && !ready && (
        <>
          <div className="c-muted" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando el botón seguro de MercadoPago…
          </div>
          {/* Skeleton con la forma del botón MP → cero salto de layout al cargar */}
          <div className="c-mpskel" aria-hidden style={{ marginTop: 12 }} />
        </>
      )}
      {/* MP injects the Wallet button here */}
      <div id={CONTAINER_ID} ref={containerRef} style={{ marginTop: 12 }} />
      <a href={initPoint} target="_blank" rel="noopener noreferrer" style={{ display: 'block', textAlign: 'center', marginTop: 12, color: 'var(--brand-ink)', fontWeight: 600, fontSize: 13.5 }}>
        {failed ? 'Continuar en MercadoPago →' : '¿No ves el botón? Continuar en MercadoPago →'}
      </a>
      <p className="c-reassure" style={{ marginTop: 12 }}>🔒 El pago se procesa en MercadoPago · tu QR llega al confirmar</p>
    </div>
  );
}
