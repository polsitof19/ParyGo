// Renderiza mientras carga el layout de la marca, así que NO está dentro de
// .client-shell todavía → estilos autocontenidos (inline), ya en el negro
// neutro del tema noche para que no haya un destello crema antes de la página.
export default function BrandLoading() {
  return (
    <main
      style={{
        minHeight: '70vh',
        display: 'grid',
        placeItems: 'center',
        background: '#0A0A0A',
        color: '#A3A3A3',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 14,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <span
          style={{
            width: 38,
            height: 38,
            borderRadius: '50%',
            border: '3px solid rgba(255,255,255,0.12)',
            borderTopColor: '#FFFFFF',
            display: 'inline-block',
            animation: 'cload-spin 0.9s linear infinite',
          }}
        />
        Cargando…
      </div>
      <style>{`@keyframes cload-spin { to { transform: rotate(360deg) } }`}</style>
    </main>
  );
}
