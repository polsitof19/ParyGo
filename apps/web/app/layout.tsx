import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Hanken_Grotesk } from 'next/font/google';
import { Toaster } from 'sonner';
import './globals.css';

// Las DOS familias del sistema, las mismas que declara cada superficie en su
// propio layout (parygo-tokens.css las lee por --font-bricolage/--font-hanken).
//
// Antes acá vivían Fredoka + Nunito + JetBrains Mono, de la identidad anterior.
// Como el layout raíz envuelve TODO, cada página —la del comprador incluida—
// se bajaba esas tres ADEMÁS de las dos del sistema que su propio layout ya
// carga. Medido sobre koko: 4 archivos y 141 KB por visita. Nunito no lo usaba
// ningún componente; Fredoka y JetBrains solo estas cuatro pantallas sueltas
// (/, error, not-found y el bloque de códigos de puerta), que ahora usan las
// del sistema como el resto de la app.
const bricolage = Bricolage_Grotesque({
  weight: ['700', '800'],
  subsets: ['latin'],
  variable: '--font-bricolage',
  display: 'swap',
});
const hanken = Hanken_Grotesk({
  weight: ['300', '400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-hanken',
  display: 'swap',
});

export const viewport: Viewport = {
  // Identidad cálida: el chrome del navegador (barra de estado móvil) toma este
  // color, no el oscuro viejo. Todas las superficies usan shells cremas.
  themeColor: '#FBF7F0',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: {
    default: 'ParyGo · Plataforma',
    template: '%s · ParyGo',
  },
  description: 'Plataforma de ticketing para promotores de eventos urbanos.',
  robots: {
    // App surface is not indexable. Public event pages override this in their own metadata.
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="es"
      className={`dark ${hanken.variable} ${bricolage.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen font-sans">
        {children}
        <Toaster theme="light" richColors position="top-right" />
      </body>
    </html>
  );
}
