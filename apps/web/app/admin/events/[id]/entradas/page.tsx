import { redirect } from 'next/navigation';

export const runtime = 'edge';

// Las entradas y sus precios ahora viven en la pantalla del evento, junto con
// la fecha y el lugar. Este link viejo sigue andando.
export default function EventTicketsRedirect({ params }: { params: { id: string } }) {
  redirect(`/admin/events/${params.id}/editar#entradas`);
}
