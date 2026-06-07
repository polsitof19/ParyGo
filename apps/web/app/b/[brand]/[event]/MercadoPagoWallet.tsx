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
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publicKey, preferenceId]);

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-6">
      <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-secondary">
        [ PAGÁ CON MERCADOPAGO ]
      </h2>
      {!failed && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Cargando el botón seguro de MercadoPago…
        </div>
      )}
      {/* MP injects the Wallet button here */}
      <div id={CONTAINER_ID} ref={containerRef} />
      <a
        href={initPoint}
        className="block text-center font-mono text-xs uppercase tracking-[0.18em] text-secondary underline-offset-4 hover:underline"
      >
        {failed ? 'Continuar en MercadoPago →' : '¿No ves el botón? Continuar en MercadoPago →'}
      </a>
      <p className="text-center text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        🔒 El pago se procesa en MercadoPago · tu QR llega al confirmar
      </p>
    </div>
  );
}
