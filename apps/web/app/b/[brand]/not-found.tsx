export const runtime = 'edge';

export default function BrandNotFound() {
  return (
    <main
      className="c-state"
      style={{ minHeight: '70vh', display: 'grid', placeContent: 'center', textAlign: 'center' }}
    >
      <span className="c-eyebrow">404</span>
      <h1 className="c-h1" style={{ fontSize: 'clamp(32px,8vw,52px)', marginTop: 8 }}>
        No encontramos esta página
      </h1>
      <p className="c-muted" style={{ marginTop: 10 }}>
        El enlace puede estar roto o el evento ya no está disponible.
      </p>
      <a href="/" className="c-btn c-btn--brand" style={{ marginTop: 18 }}>
        Volver al inicio
      </a>
    </main>
  );
}
