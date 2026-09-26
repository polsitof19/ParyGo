import { Shell, metadataDe } from '@/components/Shell';

export { viewport } from '@/components/Shell';
export const metadata = metadataDe('es');

export default function LayoutEs({ children }: { children: React.ReactNode }) {
  return <Shell lang="es">{children}</Shell>;
}
