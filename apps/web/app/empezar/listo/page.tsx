import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { acreditarVueltaMp } from '@/lib/compraPack';
import { Completar, Refrescar } from './Completar';

export const dynamic = 'force-dynamic';
// Sin esto Next cacheaba la lectura de la compra: pagada en la base y la
// página seguía diciendo 'confirmando' (medido en el E2E del alta, 2026-09-25).
export const fetchCache = 'force-no-store';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function enmascarar(email: string): string {
  const [u, d] = email.split('@');
  if (!u || !d) return email;
  return `${u.slice(0, 1)}${'•'.repeat(Math.max(2, Math.min(4, u.length - 1)))}@${d}`;
}

// Vuelta de Mercado Pago del alta con pack (y link del correo "termina de
// crear tu marca"). Acredita de respaldo si el webhook no llegó y, con la
// compra pagada y la marca sin dueña, cierra el alta (Completar).
export default async function AltaListaPage({ searchParams }: { searchParams: { compra?: string; payment_id?: string } }) {
  const admin = createAdminClient();
  const id = UUID_RE.test(searchParams.compra ?? '') ? searchParams.compra! : null;
  const leer = async () => id
    ? (await admin.from('pack_purchases').select('id, pack, provider, status, brand_id, created_by').eq('id', id).maybeSingle()).data
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
        <h1 className="ez-h1">No encontramos ese pago.</h1>
        <p className="ez-lede">Si pagaste y no llegaste a tu panel, escríbenos a parygoasistencia@gmail.com y lo resolvemos.</p>
      </>
    );
  } else if (compra.status === 'paid' && !miembros && brand.archived_at) {
    cuerpo = (
      <>
        <h1 className="ez-h1">Pago <span className="ez-squiggle">aprobado</span>.</h1>
        <p className="ez-lede">
          <strong className="ez-url">{brand.name}</strong> ya tiene {compra.pack} evento{compra.pack === 1 ? '' : 's'} cargado{compra.pack === 1 ? '' : 's'}.
          Tu página será <strong className="ez-url">{brand.slug}.parygo.com</strong>.
        </p>
        <Completar compraId={compra.id} email={(brand.contact_email ?? '').toLowerCase()} emailVisible={enmascarar(brand.contact_email ?? '')} />
      </>
    );
  } else if (compra.status === 'paid') {
    cuerpo = (
      <>
        <h1 className="ez-h1">Tu marca ya está lista.</h1>
        <p className="ez-lede">Entra con tu correo y tu contraseña para crear tu primer evento.</p>
        <div className="ez-actions ez-actions--top"><Link href="/login" className="ez-btn ez-btn--primary">Entrar a mi panel</Link></div>
      </>
    );
  } else if (compra.status === 'failed') {
    cuerpo = (
      <>
        <h1 className="ez-h1">El pago no se completó.</h1>
        <p className="ez-lede">No se te cobró nada. Puedes intentarlo de nuevo con otra tarjeta o con tu cuenta de Mercado Pago.</p>
        <div className="ez-actions ez-actions--top"><Link href={`/empezar?pack=${compra.pack}`} className="ez-btn ez-btn--primary">Volver a intentar</Link></div>
      </>
    );
  } else {
    cuerpo = (
      <>
        <h1 className="ez-h1">Estamos confirmando tu pago.</h1>
        <p className="ez-lede">Suele tardar unos segundos. Esta página se actualiza sola; también te avisamos por correo apenas se apruebe.</p>
        <Refrescar />
      </>
    );
  }

  return (
    <main className="ez-main ez-main--solo">
      <div className="ez-col">{cuerpo}</div>
    </main>
  );
}
