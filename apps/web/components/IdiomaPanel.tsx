'use client';

import { createContext, useContext } from 'react';
import { textos, type Idioma, type Textos } from '@/lib/idioma';

// Idioma del panel para componentes de cliente. Sin proveedor (la cabina del
// super admin, que usa algunos de los mismos componentes) queda en español.
const Ctx = createContext<Idioma>('es');

export function IdiomaProvider({ lang, children }: { lang: Idioma; children: React.ReactNode }) {
  return <Ctx.Provider value={lang}>{children}</Ctx.Provider>;
}

export function useTextos(): Textos {
  return textos(useContext(Ctx));
}
