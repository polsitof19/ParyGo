import { Shell, metadataDe } from '@/components/Shell';

export { viewport } from '@/components/Shell';
export const metadata = metadataDe('en');

export default function LayoutEn({ children }: { children: React.ReactNode }) {
  return <Shell lang="en">{children}</Shell>;
}
