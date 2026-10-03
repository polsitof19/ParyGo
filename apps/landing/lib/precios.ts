'use client';

import { useEffect, useState } from 'react';

import { PACKS } from './packs';

export { PACKS };

export type Moneda = 'PEN' | 'USD';

const CLAVE = 'pg-pais';

// País del visitante sin pedir nada a un tercero: /cdn-cgi/trace lo sirve
// Cloudflare en cualquier dominio suyo ("loc=PE"). La página sale prerenderada
// en dólares y cambia a soles si el visitante está en Perú. Sin respuesta
// (bloqueador, local), queda en dólares.
export function useMoneda(lang: 'es' | 'en' = 'es'): Moneda {
  const [moneda, setMoneda] = useState<Moneda>('USD');
  useEffect(() => {
    // La versión en inglés es la internacional: siempre dólares.
    if (lang === 'en') return;
    let vivo = true;
    try {
      const guardado = sessionStorage.getItem(CLAVE);
      if (guardado) { setMoneda(guardado === 'PE' ? 'PEN' : 'USD'); return; }
    } catch { /* sin sessionStorage */ }
    fetch('/cdn-cgi/trace')
      .then((r) => (r.ok ? r.text() : ''))
      .then((t) => {
        const pais = /(?:^|\n)loc=([A-Z]{2})/.exec(t)?.[1] ?? '';
        try { if (pais) sessionStorage.setItem(CLAVE, pais); } catch {}
        if (vivo && pais === 'PE') setMoneda('PEN');
      })
      .catch(() => {});
    return () => { vivo = false; };
  }, [lang]);
  return moneda;
}

export function precio(n: number, moneda: Moneda): string {
  const cifra = n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return moneda === 'PEN' ? `S/${cifra}` : `US$${cifra}`;
}
