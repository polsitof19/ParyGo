export const runtime = 'edge';

export default function BrandNotFound() {
  return (
    <main className="c-state">
      <span className="c-eyebrow">404</span>
      <h1 className="c-h1">No encontramos esta página</h1>
      <p className="c-muted">El enlace puede estar roto o el evento ya no está disponible.</p>
      <a href="/" className="c-btn c-btn--brand">Volver al inicio</a>
    </main>
  );
}
