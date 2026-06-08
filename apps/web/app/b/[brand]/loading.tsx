// Renderiza mientras carga el layout de la marca, así que NO está dentro de
// .client-shell todavía → estilos cálidos autocontenidos (inline).
export default function BrandLoading() {
  return (
    <main
      style={{
        minHeight: '70vh',
        display: 'grid',
        placeItems: 'center',
        background: '#FBF7F0',
        color: '#6B5F54',
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
            border: '3px solid #EFE6D6',
            borderTopColor: '#FF6A3D',
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
