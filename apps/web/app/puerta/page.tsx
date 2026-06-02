import { ScanLine } from 'lucide-react';
import { RedeemForm } from './RedeemForm';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Puerta · ParyGo',
  robots: { index: false, follow: false },
};

export default function PuertaPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="space-y-2">
          <ScanLine className="mx-auto h-8 w-8 text-secondary" />
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-secondary">[ PUERTA ]</p>
          <h1 className="font-display text-3xl uppercase leading-none tracking-tight">Acceso de staff</h1>
          <p className="text-sm text-muted-foreground">
            Ingresá tu código personal de 8 caracteres.
          </p>
        </div>
        <RedeemForm />
        <p className="text-center text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          ¿Sos organizador? <a href="/login" className="text-secondary underline-offset-4 hover:underline">Entrá por email</a>
        </p>
      </div>
    </main>
  );
}
