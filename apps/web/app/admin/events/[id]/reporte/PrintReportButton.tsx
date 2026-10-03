'use client';

import { Printer } from 'lucide-react';
import { useTextos } from '@/components/IdiomaPanel';

// Abre el diálogo de impresión del navegador. Con el CSS @media print el reporte
// sale limpio (sin topbar/tabs/botones) → se puede guardar como PDF o imprimir.
export function PrintReportButton() {
  const { t } = useTextos();
  return (
    <button type="button" className="s-btn s-btn--soft s-btn--sm no-print" onClick={() => window.print()}>
      <Printer className="h-4 w-4" /> {t('Descargar / imprimir PDF', 'Download / print PDF')}
    </button>
  );
}
