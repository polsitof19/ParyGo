// Las vistas de los dos paneles y de la puerta, con la sesión que cada una
// necesita. Una sola lista para el auditor, el mirador y las capturas.
import { svc } from './lib.mjs';

export const SUPER = 'paulsebastian439@gmail.com';
export const ADMIN = 'brandadmin.demotest@parygo.test';
export const VALIDATOR = 'validator.demotest@parygo.test';
export const DEMOTEST = '08553a34-988f-4537-b816-43e385b5a7a4';

// El evento de demotest más rico en datos: el que tenga órdenes.
export async function eventoDemo() {
  const { data: evs } = await svc
    .from('events')
    .select('id,name,starts_at')
    .eq('brand_id', DEMOTEST)
    .order('starts_at', { ascending: false })
    .limit(40);
  if (!evs?.length) return null;
  const { data: ords } = await svc
    .from('orders')
    .select('event_id,status')
    .in('event_id', evs.map((e) => e.id));
  const cuenta = new Map();
  for (const o of ords ?? []) cuenta.set(o.event_id, (cuenta.get(o.event_id) ?? 0) + 1);
  evs.sort((a, b) => (cuenta.get(b.id) ?? 0) - (cuenta.get(a.id) ?? 0));
  return evs[0];
}

export async function vistas(panel = 'all') {
  const ev = await eventoDemo();
  const e = ev?.id;
  const sup = [
    { id: 'super-marcas', url: '/cabina-7k29x', sesion: 'super' },
    { id: 'super-ficha', url: '/cabina-7k29x/brands/demotest', sesion: 'super' },
    { id: 'super-marca-nueva', url: '/cabina-7k29x/brands/new', sesion: 'super' },
    { id: 'super-eventos', url: '/cabina-7k29x/events', sesion: 'super' },
    { id: 'super-evento-nuevo', url: '/cabina-7k29x/events/new', sesion: 'super' },
    { id: 'super-solicitudes', url: '/cabina-7k29x/solicitudes', sesion: 'super' },
    { id: 'super-salud', url: '/cabina-7k29x/salud', sesion: 'super' },
    ...(e ? [{ id: 'super-evento', url: '/cabina-7k29x/events/' + e, sesion: 'super' }] : []),
  ];
  const adm = [
    { id: 'org-home', url: '/admin', sesion: 'admin' },
    { id: 'org-yape', url: '/admin/yape', sesion: 'admin' },
    { id: 'org-equipo', url: '/admin/equipo', sesion: 'admin' },
    { id: 'org-config', url: '/admin/settings', sesion: 'admin' },
    { id: 'org-evento-nuevo', url: '/admin/events/new', sesion: 'admin' },
    ...(e
      ? [
          { id: 'org-evento', url: '/admin/events/' + e, sesion: 'admin' },
          { id: 'org-ev-entradas', url: '/admin/events/' + e + '/entradas', sesion: 'admin' },
          { id: 'org-ev-clientes', url: '/admin/events/' + e + '/clientes', sesion: 'admin' },
          { id: 'org-ev-yape', url: '/admin/events/' + e + '/yape', sesion: 'admin' },
          { id: 'org-ev-accesos', url: '/admin/events/' + e + '/accesos', sesion: 'admin' },
          { id: 'org-ev-cortesias', url: '/admin/events/' + e + '/cortesias', sesion: 'admin' },
          { id: 'org-ev-equipo', url: '/admin/events/' + e + '/equipo', sesion: 'admin' },
          { id: 'org-ev-promotores', url: '/admin/events/' + e + '/promotores', sesion: 'admin' },
          { id: 'org-ev-reporte', url: '/admin/events/' + e + '/reporte', sesion: 'admin' },
          { id: 'org-ev-editar', url: '/admin/events/' + e + '/editar', sesion: 'admin' },
        ]
      : []),
  ];
  // Evento de demotest con cola de Yape poblada (8 comprobantes pendientes de
  // una corrida vieja del E2E): es la pantalla que COBRA, y vacía no se puede
  // juzgar. Solo se mira, no se aprueba nada.
  adm.push({ id: 'org-yape-lleno', url: '/admin/events/0dedba46-d431-4758-97d6-69afeba4b49d/yape', sesion: 'admin' });

  const pta = [
    { id: 'puerta-scan', url: '/scan', sesion: 'validator' },
    { id: 'puerta-codigo', url: '/puerta', sesion: 'anon' },
  ];
  if (panel === 'super') return sup;
  if (panel === 'admin') return adm;
  if (panel === 'puerta') return pta;
  return [...sup, ...adm, ...pta];
}
