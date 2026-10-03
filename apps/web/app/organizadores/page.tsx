import { redirect } from 'next/navigation';

export const runtime = 'edge';

// "Pedir acceso" quedó reemplazado por el alta autoservicio (2026-09-25): el
// organizador elige su pack o la prueba y crea su marca solo. Las solicitudes
// viejas siguen en la cabina (/cabina-7k29x/solicitudes).
export default function OrganizadoresPage() {
  redirect('/empezar');
}
