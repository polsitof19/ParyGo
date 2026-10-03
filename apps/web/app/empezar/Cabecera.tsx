'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

// Cabecera de /empezar y /empezar/listo en el idioma de la visita (?lang=en).
export function Cabecera() {
  const en = useSearchParams().get('lang') === 'en';
  return (
    <header className="ez-top" lang={en ? 'en' : 'es'}>
      <a href={en ? 'https://parygo.com/en/' : 'https://parygo.com'} className="ez-brand" aria-label={en ? 'parygo, back to home' : 'parygo, volver al inicio'}>
        parygo<span className="ez-dot">.</span>
      </a>
      <p className="ez-top__login">
        {en ? 'Already have an account?' : '¿Ya tienes una cuenta?'} <Link href="/login">{en ? 'Log in' : 'Ingresar'}</Link>
      </p>
    </header>
  );
}
