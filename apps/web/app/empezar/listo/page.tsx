import type { Metadata } from 'next';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { acreditarVueltaMp } from '@/lib/compraPack';
import { Completar, Refrescar } from './Completar';
import { TEXTOS, esLang } from '../textos';

export const dynamic = 'force-dynamic';
// Sin esto Next cacheaba la lectura de la compra: pagada en la base y la
// página seguía diciendo 'confirmando' (medido en el E2E del alta, 2026-09-25).
export const fetchCache = 'force-no-store';

type Params = { compra?: string; payment_id?: string; lang?: string };

export function generateMetadata({ searchParams }: { searchParams: Params }): Metadata {
  return { title: esLang(searchParams.lang) === 'en' ? 'Your brand · ParyGo' : 'Tu marca · ParyGo' };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function enmascarar(email: string): string {
  const [u, d] = email.split('@');
  if (!u || !d) return email;
  return `${u.slice(0, 1)}${'•'.repeat(Math.max(2, Math.min(4, u.length - 1)))}@${d}`;
}

// Vuelta del pago del alta con pack (Mercado Pago directo; PayPal pasa antes
// por /api/paypal/volver, que cobra) y link del correo "termina de crear tu
// marca". Acredita de respaldo si el webhook de MP no llegó y, con la compra
// pagada y la marca sin dueña, cierra el alta (Completar).
export default async function AltaListaPage({ searchParams }: { searchParams: Params }) {
  const lang = esLang(searchParams.lang);
  const l = TEXTOS[lang].l;
  const q = `lang=${lang}`;
  const admin = createAdminClient();
  const id = UUID_RE.test(searchParams.compra ?? '') ? searchParams.compra! : null;
  const leer = async () => id
    ? (await admin.from('pack_purchases').select('id, pack, provider, provider_ref, currency, status, brand_id, created_by').eq('id', id).maybeSingle()).data
    : null;
  let compra = await leer();
  if (compra) {
    await acreditarVueltaMp(compra, searchParams.payment_id ?? '');
    compra = await leer();
  }
  const { data: brand } = compra
    ? await admin.from('brands').select('name, slug, contact_email, event_balance, archived_at').eq('id', compra.brand_id).single()
    : { data: null };
  const { count: miembros } = compra
    ? await admin.from('brand_members').select('user_id', { count: 'exact', head: true }).eq('brand_id', compra.brand_id)
    : { count: 0 };

  let cuerpo: React.ReactNode;
  // Solo compras de /empezar (sin created_by) cierran un alta; las del panel
  // tienen su propia vuelta (/admin/comprar/listo).
  if (!compra || !brand || compra.created_by !== null) {
    cuerpo = (
      <>
        <h1 className="ez-h1">{l.noEncontrado}</h1>
        <p className="ez-lede">{l.noEncontradoTxt}</p>
      </>
    );
  } else if (compra.status === 'paid' && !miembros && brand.archived_at) {
    const [a, b, c] = l.aprobadoTxt(brand.name, compra.pack, brand.slug);
    cuerpo = (
      <>
        <h1 className="ez-h1">{l.aprobadoA}<span className="ez-squiggle">{l.aprobadoB}</span>{l.aprobadoC}</h1>
        <p className="ez-lede">{a}<strong className="ez-url">{b}</strong>{c}</p>
        <Completar compraId={compra.id} lang={lang} email={(brand.contact_email ?? '').toLowerCase()} emailVisible={enmascarar(brand.contact_email ?? '')} />
      </>
    );
  } else if (compra.status === 'paid') {
    cuerpo = (
      <>
        <h1 className="ez-h1">{l.lista}</h1>
        <p className="ez-lede">{l.listaTxt}</p>
        <div className="ez-actions ez-actions--top"><Link href="/login" className="ez-btn ez-btn--primary">{l.entrar}</Link></div>
      </>
    );
  } else if (compra.status === 'failed') {
    const moneda = compra.currency === 'USD' ? 'USD' : 'PEN';
    cuerpo = (
      <>
        <h1 className="ez-h1">{l.fallo}</h1>
        <p className="ez-lede">{l.falloTxt}</p>
        <div className="ez-actions ez-actions--top"><Link href={`/empezar?pack=${compra.pack}&moneda=${moneda}&${q}`} className="ez-btn ez-btn--primary">{l.reintentar}</Link></div>
      </>
    );
  } else {
    // PayPal cobra en la vuelta: si esa vuelta se cortó, el comprador puede
    // repetirla (el cobro es idempotente; nunca cobra dos veces).
    const paypal = compra.provider === 'paypal' && compra.provider_ref
      ? `/api/paypal/volver?compra=${compra.id}&token=${encodeURIComponent(compra.provider_ref)}&${q}`
      : null;
    cuerpo = (
      <>
        <h1 className="ez-h1">{l.confirmando}</h1>
        <p className="ez-lede">{l.confirmandoTxt}</p>
        {paypal
          ? <div className="ez-actions ez-actions--top"><a href={paypal} className="ez-btn ez-btn--primary">{lang === 'en' ? 'Confirm with PayPal' : 'Confirmar con PayPal'}</a></div>
          : <Refrescar />}
      </>
    );
  }

  return (
    <main className="ez-main ez-main--solo" lang={lang}>
      <div className="ez-col">{cuerpo}</div>
    </main>
  );
}
