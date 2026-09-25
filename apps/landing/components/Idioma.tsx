import { Globe } from 'lucide-react';
import { RUTA, type Lang } from '@/lib/i18n';

// Selector de idioma: dos links reales (/ y /en/), no un toggle en el cliente,
// para que cada idioma tenga su URL indexable (hreflang en el layout).
export function Idioma({ lang, label, className = '' }: { lang: Lang; label: string; className?: string }) {
  return (
    <nav className={`idioma ${className}`} aria-label={label}>
      <Globe className="idioma__ico" aria-hidden="true" />
      <a href={RUTA.es} hrefLang="es" lang="es" aria-current={lang === 'es' ? 'true' : undefined}>ES</a>
      <span className="idioma__sep" aria-hidden="true">/</span>
      <a href={RUTA.en} hrefLang="en" lang="en" aria-current={lang === 'en' ? 'true' : undefined}>EN</a>
    </nav>
  );
}
