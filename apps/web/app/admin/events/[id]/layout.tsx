import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { ownerBrandContext } from '@/lib/impersonation';
import { createAdminClient } from '@/lib/supabase/admin';
import { EventBack } from './EventBack';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Layout de un evento: solo el "volver" (a Tus eventos desde el menú del
// evento; al evento desde una sección). La cabecera con el flyer y el menú de
// secciones viven en la página del evento; cada sección trae su título.
export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  const user = await requireSession();
  const ctx = ownerBrandContext(user);
  if (!ctx) notFound();

  const { data: event } = await createAdminClient()
    .from('events')
    .select('id, brand_id, name')
    .eq('id', params.id)
    .maybeSingle();
  if (!event || event.brand_id !== ctx.brandId) notFound();

  return (
    <>
      <EventBack eventId={event.id} eventName={event.name} />
      <div className="a-evpage">{children}</div>
    </>
  );
}
