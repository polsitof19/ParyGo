import { redirect } from 'next/navigation';

export const runtime = 'edge';

// Marcas es la pantalla principal de la cabina (/cabina-7k29x). Esta ruta
// queda para los links viejos y para la ficha /brands/[slug].
export default function BrandsIndex() {
  redirect('/cabina-7k29x');
}
