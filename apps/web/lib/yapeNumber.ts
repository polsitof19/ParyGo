import { z } from 'zod';

// Número de Yape: celular peruano de 9 dígitos que empieza en 9. Se aceptan
// espacios, guiones y el +51 (se limpian). Un número mal tipeado manda la plata
// de los compradores a otra persona, así que lo validan TODOS los que escriben
// brands.yape_number: Mi marca y el super admin (crear y editar marca).
export const yapeNumberSchema = z
  .string()
  .transform((v) => v.replace(/[\s-]/g, '').replace(/^\+?51(?=9\d{8}$)/, ''))
  .refine((v) => v === '' || /^9\d{8}$/.test(v), 'Pon el celular de Yape: 9 dígitos, empieza con 9')
  .optional();
