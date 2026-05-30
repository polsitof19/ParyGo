import type { Metadata, Viewport } from 'next';
import { Fredoka, Nunito, JetBrains_Mono } from 'next/font/google';
import { Toaster } from 'sonner';
import './globals.css';

// Body font. Nunito is a variable font (weights 200-1000); next/font picks
// up the full range. Self-hosted, latin subset, ~24 KB gzipped over the
// wire after subsetting.
const nunito = Nunito({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

// Display font. Fredoka is a variable font (weights 300-700) with a
// rounded, friendly silhouette. ~22 KB gzipped.
const fredoka = Fredoka({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const viewport: Viewport = {
  themeColor: '#050508',
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
      className={`dark ${nunito.variable} ${fredoka.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen font-sans">
        {children}
        <Toaster theme="dark" richColors position="top-right" />
      </body>
    </html>
  );
}
