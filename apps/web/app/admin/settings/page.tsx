import Link from 'next/link';
import { ChevronDown, ChevronLeft, Users } from 'lucide-react';
import { requireSession } from '@/lib/auth';
import { ownerBrandContext } from '@/lib/impersonation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { SettingsForm } from './SettingsForm';
import { MpConexion } from './MpConexion';
import { duenaRealDe, estadoMp, mpOauthListo } from '@/lib/mpConexion';
import { IdiomaSelector } from './IdiomaSelector';
import { TemaCompraSelector } from './TemaCompraSelector';
import { esTema } from '@/lib/temaCompra.mjs';
import { esIdioma } from '@/lib/idioma';
import { textosPanel } from '@/lib/idiomaServer';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage({ searchParams }: { searchParams: { mp?: string } }) {
  const user = await requireSession();
  const ctx = ownerBrandContext(user);
  if (!ctx) return null;
  const impersonating = ctx.soloLectura;
  const { t } = await textosPanel();

  // Ambas lecturas dependen solo de ctx.brandId (no una de la otra) → en paralelo.
  // MP status: service_role; never decrypts, returns only booleans.
  const supabase = createClient();
  const admin = createAdminClient();
  // yape_qr_url (0054) NO tiene grant de columna para authenticated: pedirla
  // con la sesión del organizador daba "permission denied for table brands",
  // brand quedaba null y "Mi marca" salía EN BLANCO. Se lee con service role,
  // acotada a la marca de la sesión (ctx.brandId), igual que en actions.ts.
  const [{ data: brand }, mpEstado, { data: qrRow }, { count: puertaCount }] = await Promise.all([
    supabase
      .from('brands')
      .select('id, name, contact_email, whatsapp_e164, instagram, yape_number, yape_holder, notify_yape_recovery, notify_yape_digest, theme_json, idioma, tema_compra')
      .eq('id', ctx.brandId)
      .single(),
    estadoMp(admin, ctx.brandId),
    admin.from('brands').select('yape_qr_url').eq('id', ctx.brandId).maybeSingle(),
    // Cuántas personas tiene en puerta: el valor de la fila "Equipo de puerta".
    admin.from('brand_members').select('user_id', { count: 'exact', head: true }).eq('brand_id', ctx.brandId).eq('role', 'validator'),
  ]);
  if (!brand) return null;

  const theme = (brand.theme_json ?? {}) as {
    logo_url?: string | null;
    yape_qr_url?: string | null;
    primary_color?: string;
    secondary_color?: string;
  };

  const idioma = esIdioma(brand.idioma) ? brand.idioma : 'es';
  const tema = esTema(brand.tema_compra);
  const temaNombre = { blanco: t('Blanco', 'White'), crema: t('Crema', 'Cream'), negro: t('Negro', 'Black'), marca: t('Tu color', 'Your color') }[tema];
  // Resultado de la vuelta de Mercado Pago (mercadopago/vuelta/route.ts).
  const avisosMp: Record<string, { ok: boolean; texto: string }> = {
    conectado: { ok: true, texto: t('Listo: Mercado Pago quedó conectado.', 'Done: Mercado Pago is connected.') },
    cancelado: { ok: false, texto: t('No se conectó: cancelaste en Mercado Pago.', 'Not connected: you cancelled in Mercado Pago.') },
    sesion: { ok: false, texto: t('No se pudo conectar: el enlace venció o se abrió en otra sesión. Vuelve a tocar "Conectar Mercado Pago".', 'Could not connect: the link expired or was opened in another session. Tap "Connect Mercado Pago" again.') },
    rechazado: { ok: false, texto: t('Mercado Pago no aprobó la conexión. Vuelve a intentarlo.', 'Mercado Pago did not approve the connection. Try again.') },
    intenta_de_nuevo: { ok: false, texto: t('Mercado Pago no respondió. Intenta de nuevo en un momento.', 'Mercado Pago did not respond. Try again in a moment.') },
    cuenta_no_coincide: { ok: false, texto: t('No pudimos confirmar tu cuenta de Mercado Pago. Intenta de nuevo.', 'We could not confirm your Mercado Pago account. Try again.') },
    cuenta_en_otra_marca: { ok: false, texto: t('Esa cuenta de Mercado Pago ya está conectada a otra marca.', 'That Mercado Pago account is already connected to another brand.') },
    no_disponible: { ok: false, texto: t('Conectar Mercado Pago todavía no está disponible.', 'Connecting Mercado Pago is not available yet.') },
    pagos_en_curso: { ok: false, texto: t('Hay compradores pagando con tarjeta en tu cuenta actual. Cambia de cuenta en un rato.', 'Some buyers are paying by card on your current account. Switch accounts in a while.') },
  };
  const avisoMp = searchParams.mp && Object.hasOwn(avisosMp, searchParams.mp) ? avisosMp[searchParams.mp] : null;
  const puerta = puertaCount ?? 0;
  const fold = (titulo: string, valor: string, body: React.ReactNode, open?: boolean) => (
    <details className="s-fold" open={open}>
      <summary>
        <span className="s-fold__t">
          {titulo}
          <span className="s-fold__hint">{valor}</span>
        </span>
        <ChevronDown aria-hidden="true" />
      </summary>
      <div className="s-fold__body">{body}</div>
    </details>
  );

  return (
    <div style={{ maxWidth: 680 }}>
      <Link href="/admin" className="s-back">
        <ChevronLeft className="h-3.5 w-3.5" /> {t('Tus eventos', 'Your events')}
      </Link>

      <header style={{ marginBottom: 'var(--s-s4)' }}>
        <h1 className="s-h1" style={{ marginTop: 8 }}>{t('Mi marca', 'My brand')}</h1>
        <p className="s-card__desc">
          {impersonating
            ? t('Estás viendo la configuración de la marca en solo lectura. No puedes editarla desde aquí.', "You're viewing the brand's settings in read-only mode. You can't edit it from here.")
            : t('Cómo te pagan, tus datos y tu logo. Los cambios se aplican al instante.', 'How you get paid, your details and your logo. Changes apply instantly.')}
        </p>
      </header>

      {impersonating && (
        <p className="s-banner" style={{ background: 'var(--paper-2)', color: 'var(--ink-2)', marginBottom: 16 }} role="status">
          {t('Solo lectura — los datos se muestran tal cual, sin posibilidad de editarlos.', 'Read only — the data is shown as is, with no way to edit it.')}
        </p>
      )}

      <SettingsForm
        contactEmail={brand.contact_email ?? ''}
        whatsapp={brand.whatsapp_e164 ?? ''}
        instagram={brand.instagram ?? ''}
        yapeNumber={brand.yape_number ?? ''}
        yapeHolder={brand.yape_holder ?? ''}
        primaryColor={theme.primary_color ?? '#FF1F8F'}
        secondaryColor={theme.secondary_color ?? '#00E5FF'}
        logoUrl={theme.logo_url ?? null}
        yapeQrUrl={qrRow?.yape_qr_url ?? theme.yape_qr_url ?? null}
        notifyYapeRecovery={Boolean(brand.notify_yape_recovery)}
        notifyYapeDigest={Boolean(brand.notify_yape_digest)}
        readOnly={impersonating}
        // Mercado Pago por OAuth (0086): abierto si está conectado o si se
        // acaba de volver de MP (para ver el aviso).
        tarjeta={
          <div className="s-folds a-cobro__mp">
            {avisoMp && <p className={avisoMp.ok ? 's-banner s-banner--ok' : 's-banner s-banner--err'} role="status">{avisoMp.texto}</p>}
            {fold(
              t('Mercado Pago (tarjeta y más)', 'Mercado Pago (card and more)'),
              mpEstado.conectada ? t('Conectado', 'Connected') : t('Sin conectar', 'Not connected'),
              <MpConexion conectada={mpEstado.conectada} cuenta={mpEstado.cuenta} disponible={mpOauthListo()} puede={!impersonating && duenaRealDe(user) === ctx.brandId} />,
              mpEstado.conectada || !!avisoMp || undefined,
            )}
          </div>
        }
        tema={fold(
          t('Tema de tu página de compra', 'Your purchase page theme'),
          temaNombre,
          <TemaCompraSelector tema={tema} primary={theme.primary_color ?? '#FF6A3D'} logoUrl={theme.logo_url ?? null} disabled={impersonating} />,
        )}
        despues={
          <>
            {fold(
              t('Equipo de puerta', 'Door team'),
              puerta === 0 ? t('Nadie todavía', 'Nobody yet') : t(`${puerta} persona${puerta === 1 ? '' : 's'}`, `${puerta} ${puerta === 1 ? 'person' : 'people'}`),
              <div className="s-card__head" style={{ border: 0 }}>
                <p className="s-card__desc">{t('Contraseñas y códigos personales de tu staff. Solo ven el escáner.', 'Passwords and personal codes for your staff. They only see the scanner.')}</p>
                <Link href="/admin/equipo" className="s-btn s-btn--soft s-btn--sm">
                  <Users className="h-4 w-4" /> {t('Gestionar', 'Manage')}
                </Link>
              </div>,
            )}
            {fold(
              'Idioma · Language',
              idioma === 'en' ? 'English' : 'Español',
              <IdiomaSelector idioma={idioma} disabled={impersonating} />,
            )}
          </>
        }
      />
    </div>
  );
}
