import { Bricolage_Grotesque, Hanken_Grotesk } from 'next/font/google';
import { LoginForm } from './LoginForm';
import './login.css';

export const runtime = 'edge';

export const metadata = {
  title: 'Iniciar sesión · parygo',
};

// Misma identidad cálida que los paneles, scopeada bajo .auth-shell.
const bricolage = Bricolage_Grotesque({
  weight: ['700', '800'],
  subsets: ['latin'],
  variable: '--font-bricolage',
  display: 'swap',
});
const hanken = Hanken_Grotesk({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-hanken',
  display: 'swap',
});

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; next?: string };
}) {
  const support = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP;

  return (
    <main className={`auth-shell ${bricolage.variable} ${hanken.variable}`}>
      <div className="auth-wrap">
        <div className="auth-brand">
          parygo<span className="dot">.</span>
        </div>

        <div className="auth-card">
          <p className="auth-eyebrow">Acceso</p>
          <h1 className="auth-h1">Iniciá sesión</h1>
          <p className="auth-sub">Organizadores y staff entran con su email y contraseña.</p>

          <LoginForm next={searchParams.next} />

          {searchParams.error && (
            <p className="auth-banner">{decodeURIComponent(searchParams.error)}</p>
          )}
        </div>

        {support && (
          <p className="auth-foot">
            ¿Comprás una entrada y necesitás ayuda?{' '}
            <a href={`https://wa.me/${support}`} target="_blank" rel="noopener noreferrer">
              Soporte por WhatsApp
            </a>
          </p>
        )}
        <p className="auth-legal">Al continuar aceptás los Términos y la Política de Privacidad.</p>
      </div>
    </main>
  );
}
