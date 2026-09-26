import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { SITE } from '@/lib/site';
import { DICT, RUTA, type Lang } from '@/lib/i18n';
import { JsOn } from '@/components/chrome/JsOn';
import { RevealObserver } from '@/components/chrome/RevealObserver';
import { Loader } from '@/components/chrome/Loader';
import '@/app/globals.css';

// Raíz compartida de los dos idiomas. Cada idioma es su propio root layout
// (app/(es) y app/en) para que <html lang> sea el correcto y cada versión
// tenga su URL, su canonical y su hreflang.

// v7 type system: Bricolage Grotesque (display) + Hanken Grotesk (body).
// LOCALES desde 2026-09-26: con next/font/google el build de Cloudflare bajaba
// las fuentes en cada deploy y, cuando Google no respondía ("An error occurred
// in `next/font`"), la landing no se publicaba (2 de 3 deploys seguidos). Son
// los mismos archivos que servía Google (variables, subconjunto latin,
// app/fonts/), así que se ve igual y el build ya no depende de la red.
const bricolage = localFont({ src: '../app/fonts/bricolage-latin.woff2', weight: '400 800', variable: '--font-bricolage', display: 'swap' });
const hanken = localFont({ src: '../app/fonts/hanken-latin.woff2', weight: '400 700', variable: '--font-hanken', display: 'swap' });

export const viewport: Viewport = {
  themeColor: SITE.themeColor,
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export function metadataDe(lang: Lang): Metadata {
  const t = DICT[lang];
  return {
    metadataBase: new URL(SITE.url),
    title: { default: t.meta.title, template: `%s · ${SITE.name}` },
    description: t.meta.description,
    keywords: t.meta.keywords,
    authors: [{ name: SITE.name }],
    creator: SITE.name,
    publisher: SITE.name,
    alternates: {
      canonical: RUTA[lang],
      languages: { es: RUTA.es, en: RUTA.en, 'x-default': RUTA.es },
    },
    ...(SITE.googleSiteVerification ? { verification: { google: SITE.googleSiteVerification } } : {}),
    openGraph: {
      type: 'website',
      locale: t.ogLocale,
      alternateLocale: [lang === 'es' ? DICT.en.ogLocale : DICT.es.ogLocale],
      url: `${SITE.url}${RUTA[lang]}`,
      siteName: SITE.name,
      title: t.meta.title,
      description: t.meta.description,
      images: [{ url: SITE.ogImage, width: 1200, height: 630, alt: t.meta.title }],
    },
    twitter: { card: 'summary_large_image', title: t.meta.title, description: t.meta.description, images: [SITE.ogImage] },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 },
    },
    category: 'technology',
  };
}

export function Shell({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return (
    <html lang={DICT[lang].htmlLang} className={`${bricolage.variable} ${hanken.variable}`}>
      <body>
        <JsOn />
        <Loader />
        <RevealObserver />
        {children}
      </body>
    </html>
  );
}
