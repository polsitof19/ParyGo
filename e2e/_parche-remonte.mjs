// Solo para seguir probando mientras el alta se reinicia al verificar el código.
// Next 14.2.18 responde a la acción que cambia cookies con el árbol de la página
// con el segmento "__PAGE__" SIN sus searchParams (el cliente lo tiene como
// "__PAGE__?{...}"), y remonta todo. Aquí se le vacía el árbol a esa respuesta
// (queda el resultado de la acción, el Set-Cookie y toda la lógica del servidor).
export async function parcheRemonte(ctx) {
  await ctx.route(/\/empezar(\?|$)/, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const r = await route.fetch();
    const headers = { ...r.headers() };
    let body = await r.text();
    const id = /^0:\["\$@1",\["([^"]+)"/m.exec(body)?.[1];
    if (headers['x-action-revalidated'] === '[[],0,1]' && id) {
      headers['x-action-revalidated'] = '[[],0,0]';
      body = body.split('\n').map((l) => (l.startsWith('0:') ? `0:["$@1",["${id}",[]]]` : l)).join('\n');
    }
    await route.fulfill({ status: r.status(), headers, body });
  });
}
