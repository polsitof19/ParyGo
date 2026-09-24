// PostgREST devuelve como MÁXIMO 1000 filas por consulta (max-rows de
// Supabase), sin error ni aviso: el resto simplemente no llega. Con Standly
// (1014 entradas válidas, 2026-09-24) eso ya mentía: el panel mostraba
// órdenes pagadas "sin tickets" que sí los tenían, y el escáner sin señal
// descargaba 1000 entradas y dejaba afuera al resto.
//
// todas() pagina de a 1000 hasta traer todo. La consulta DEBE ir ordenada por
// una columna única (p. ej. .order('id')): sin orden estable, dos páginas
// pueden repetir o saltearse filas.
export async function todas<T>(
  pagina: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  tam = 1000
): Promise<T[]> {
  const out: T[] = [];
  for (let desde = 0; ; desde += tam) {
    const { data, error } = await pagina(desde, desde + tam - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < tam) return out;
  }
}
