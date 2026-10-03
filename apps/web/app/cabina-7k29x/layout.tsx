import { GeistSans } from 'geist/font/sans';
import { requireSession } from '@/lib/auth';
import { SuperTopbar } from './SuperTopbar';
// Tokens compartidos de parygo PRIMERO: super.css se apoya en ellos y los
// especializa. El orden importa — si se invierte, super.css define variables
// que el archivo de tokens pisa después.
import '../styles/parygo-tokens.css';
import '../styles/parygo-panel.css';
import './super.css';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Tema NOCHE (2026-09-23), el mismo del comprador: fondo #0A0A0A y Geist en
// todo. Los tokens son los de .pg.pg-noche (medidos por test:contrast); lo
// propio del panel vive en parygo-panel.css.


export default async function SuperLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSession({ superAdmin: true });


  return (
    // `pg` = tokens · `pg-panel` = componentes compartidos con el panel del
    // organizador · `super-shell` = lo propio del super admin.
    <div className={`pg pg-noche pg-panel super-shell ${GeistSans.variable}`}>
      <SuperTopbar email={user.email} />
      <main className="s-wrap">{children}</main>
    </div>
  );
}
