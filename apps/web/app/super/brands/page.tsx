import { redirect } from 'next/navigation';

export const runtime = 'edge';

// La home del super (/super) ES la vista de marcas. Esta ruta vieja redirige.
export default function BrandsIndex() {
  redirect('/super');
}
