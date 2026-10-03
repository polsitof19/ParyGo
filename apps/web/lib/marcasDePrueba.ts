import type { SupabaseClient } from '@supabase/supabase-js';

// Marcas de prueba (brands.is_test, migración 0057) y cómo excluirlas de los
// contadores del super admin.
//
// Por qué existe: antes de esto, el 97% de lo "cobrado" que veía Paul eran
// corridas del E2E — demotest sola metía 125 órdenes y S/11.528 de S/11.928
// totales. Los números que miraba para decidir no eran sus números.
//
// Esto afecta SOLO a los contadores del panel super. No toca el flujo de
// compra, ni la emisión, ni lo que ve un comprador: una marca de prueba
// funciona exactamente igual que una real, solo que no suma a las métricas.

// Lo mínimo que estos helpers necesitan de un query de PostgREST: poder
// encadenar un .not(). Se declara así en vez de usar `any` para que el
// encadenado siga tipado del lado del caller.
interface Filtrable<T> {
  not(column: string, operator: string, value: unknown): T;
}

/** IDs de las marcas marcadas como de prueba. Vacío = no hay ninguna. */
export async function idsMarcasDePrueba(admin: SupabaseClient): Promise<string[]> {
  const { data } = await admin.from('brands').select('id').eq('is_test', true);
  return (data ?? []).map((b: { id: string }) => b.id);
}

/**
 * Aplica "excluí las marcas de prueba" a un query de PostgREST sobre una tabla
 * que tenga brand_id.
 *
 * Se filtra por lista de IDs y no con un embed `brands!inner(...)` a propósito:
 * el embed cambia la forma del count según cómo PostgREST resuelva el join, y
 * acá lo único que importa es un contador que no mienta. La lista son 5 filas.
 */
export function sinMarcasDePrueba<T extends Filtrable<T>>(query: T, idsPrueba: string[]): T {
  if (idsPrueba.length === 0) return query;
  return query.not('brand_id', 'in', `(${idsPrueba.join(',')})`);
}

/**
 * Órdenes de Yape que de verdad hay que revisar.
 *
 * Una orden en pending_yape_review SIN yape_proof_id es un checkout abandonado:
 * el comprador llegó a la pantalla de Yape y nunca subió nada. No hay
 * comprobante que mirar, así que no es trabajo pendiente de nadie. Medido en
 * producción: 6 de los 12 "pendientes" eran de estos.
 */
export function soloConComprobante<T extends Filtrable<T>>(query: T): T {
  return query.not('yape_proof_id', 'is', null);
}
