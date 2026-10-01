import { NextResponse } from 'next/server';
import { confirmarCodigo, type AltaState } from '../actions';

export const runtime = 'edge';

// Verificación del código del alta por fetch, NO como server action
// (2026-10-01). verifyOtp abre la sesión (Set-Cookie) y, como server action,
// Next 14 re-renderizaba la página dentro de la respuesta con un segmento
// "__PAGE__" sin los searchParams: lo trataba como otra ruta, remontaba el
// formulario y la persona volvía al paso 1 sin sus datos. Por fetch la cookie
// se guarda igual y la página no se toca.
const inicial: AltaState = { ok: false, paso: 'codigo', message: null };

export async function POST(req: Request) {
  const fd = await req.formData();
  return NextResponse.json(await confirmarCodigo(inicial, fd), { headers: { 'Cache-Control': 'no-store' } });
}
