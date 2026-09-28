// Logo de ParyGo: la "p." sobre el cuadrado naranja (el mismo de
// public/favicon.svg) + el wordmark. La marca va en SVG inline para que no
// dependa de una fuente ni de una petición extra.
export function LogoMarca({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 512 512" aria-hidden="true" focusable="false">
      <rect width="512" height="512" rx="116" fill="#FF6A3D" />
      <g fill="#0A0A0A" transform="translate(-4 -15)">
        <rect x="138" y="128" width="66" height="290" rx="4" />
        <path fillRule="evenodd" d="M276 124a108 108 0 1 1 0 216a108 108 0 1 1 0-216zM276 180a52 52 0 1 0 0 104a52 52 0 1 0 0-104z" />
        <circle cx="246" cy="394" r="24" />
      </g>
    </svg>
  );
}

export function Logo() {
  return (
    <>
      <LogoMarca className="logo__marca" />
      <span>parygo<span className="dot">.</span></span>
    </>
  );
}
