import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { NewBrandForm } from './NewBrandForm';

export const runtime = 'edge';

export const metadata = {
  title: 'Nueva marca',
};

export default function NewBrandPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <Link
        href="/super/brands"
        className="inline-flex items-center gap-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-3 w-3" />
        Volver a marcas
      </Link>
      <header className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-secondary">
          [ NUEVA MARCA ]
        </p>
        <h1 className="font-display text-4xl uppercase leading-none tracking-tight">
          Crear promotor
        </h1>
        <p className="text-muted-foreground">
          Setup inicial. Luego invitas al brand admin por email para que pueda
          editar su evento.
        </p>
      </header>
      <NewBrandForm />
    </div>
  );
}
