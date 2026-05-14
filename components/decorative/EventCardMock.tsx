import { QrMark } from './QrMark';

type Variant = 0 | 1 | 2 | 3 | 4 | 5;

type EventCardMockProps = {
  variant: Variant;
  name: string;
  accent: string;
  capacity?: { filled: number; total: number };
};

// Editorial, on-brand event mockups rendered as SVG. Each variant is a
// different layout pattern so the grid stays varied without stock imagery.
export function EventCardMock({
  variant,
  name,
  accent,
  capacity,
}: EventCardMockProps) {
  const first = name.split(' ')[0] ?? name;

  return (
    <svg
      viewBox="0 0 400 300"
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid slice"
      style={{ background: '#FAFAF8' }}
      aria-hidden="true"
    >
      <defs>
        <pattern
          id={`stripes-${variant}-${name.length}`}
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line
            x1="0"
            y1="0"
            x2="0"
            y2="6"
            stroke="rgba(10,10,10,0.05)"
            strokeWidth="1"
          />
        </pattern>
      </defs>
      <rect width="400" height="300" fill={`url(#stripes-${variant}-${name.length})`} />

      {variant === 0 && (
        <g>
          <rect x="40" y="40" width="320" height="220" fill="#FAFAF8" stroke="#E8E6E0" />
          <rect x="40" y="40" width="320" height="36" fill="#0A0A0A" />
          <text x="56" y="64" fontFamily="serif" fontStyle="italic" fontSize="20" fill="#FAFAF8">
            {first}
          </text>
          <text x="320" y="64" fontFamily="monospace" fontSize="10" fill="#FAFAF8" letterSpacing="2">
            LIVE
          </text>
          <rect x="56" y="96" width="180" height="44" fill={accent} />
          <text x="64" y="126" fontFamily="serif" fontStyle="italic" fontSize="28" fill="#FAFAF8">
            S/45
          </text>
          <rect x="56" y="160" width="290" height="6" fill="#E8E6E0" />
          <rect x="56" y="160" width="180" height="6" fill="#0A0A0A" />
          <text x="56" y="190" fontFamily="monospace" fontSize="9" fill="#6B6B68" letterSpacing="2">
            AFORO 184/300
          </text>
        </g>
      )}

      {variant === 1 && (
        <g>
          <text x="40" y="120" fontFamily="serif" fontStyle="italic" fontSize="46" fill="#0A0A0A">
            {first}
          </text>
          <rect x="40" y="138" width="240" height="2" fill="#0A0A0A" />
          <rect x="40" y="156" width="160" height="2" fill="#6B6B68" />
          <circle cx="320" cy="180" r="50" fill={accent} />
          <text x="320" y="186" fontFamily="serif" fontStyle="italic" fontSize="22" fill="#FAFAF8" textAnchor="middle">
            ENTRAR
          </text>
          <rect x="40" y="220" width="40" height="14" fill="#0A0A0A" />
        </g>
      )}

      {variant === 2 && (
        <g>
          <rect x="40" y="40" width="140" height="220" fill={accent} />
          <text x="54" y="220" fontFamily="serif" fontStyle="italic" fontSize="38" fill="#FAFAF8">
            01
          </text>
          <text x="200" y="80" fontFamily="serif" fontStyle="italic" fontSize="26" fill="#0A0A0A">
            {first}
          </text>
          <rect x="200" y="100" width="160" height="3" fill="#0A0A0A" />
          <rect x="200" y="130" width="160" height="34" fill="#F5F2EB" />
          <text x="208" y="153" fontFamily="monospace" fontSize="11" fill="#0A0A0A" letterSpacing="2">
            QR ÚNICO
          </text>
          <rect x="200" y="174" width="160" height="34" fill="#F5F2EB" />
          <text x="208" y="197" fontFamily="monospace" fontSize="11" fill="#0A0A0A" letterSpacing="2">
            ESCANEAR
          </text>
          <rect x="200" y="218" width="80" height="22" fill="#0A0A0A" />
          <text x="240" y="234" fontFamily="monospace" fontSize="9" fill="#FAFAF8" letterSpacing="2" textAnchor="middle">
            VALIDAR
          </text>
        </g>
      )}

      {variant === 3 && (
        <g>
          <rect x="40" y="40" width="320" height="100" fill="#F5F2EB" />
          <text x="56" y="100" fontFamily="serif" fontStyle="italic" fontSize="36" fill="#0A0A0A">
            {name}
          </text>
          <text x="56" y="124" fontFamily="monospace" fontSize="10" fill="#6B6B68" letterSpacing="2">
            FRI 14 · JUN · 26 — LIMA
          </text>
          <rect x="40" y="160" width="100" height="100" fill="#FAFAF8" stroke="#E8E6E0" />
          <text x="56" y="200" fontFamily="serif" fontStyle="italic" fontSize="34" fill="#0A0A0A">
            S/45
          </text>
          <text x="56" y="226" fontFamily="monospace" fontSize="9" fill="#6B6B68" letterSpacing="2">
            GENERAL
          </text>
          <rect x="150" y="160" width="100" height="100" fill="#FAFAF8" stroke="#E8E6E0" />
          <text x="166" y="200" fontFamily="serif" fontStyle="italic" fontSize="34" fill="#0A0A0A">
            S/75
          </text>
          <text x="166" y="226" fontFamily="monospace" fontSize="9" fill="#6B6B68" letterSpacing="2">
            VIP
          </text>
          <rect x="260" y="160" width="100" height="100" fill={accent} />
          <text x="276" y="220" fontFamily="serif" fontStyle="italic" fontSize="28" fill="#FAFAF8">
            comprar
          </text>
        </g>
      )}

      {variant === 4 && (
        <g>
          <rect x="40" y="40" width="320" height="50" fill="#0A0A0A" />
          <text x="56" y="74" fontFamily="serif" fontStyle="italic" fontSize="24" fill="#FAFAF8">
            {first}
          </text>
          <text x="340" y="74" fontFamily="monospace" fontSize="10" fill="#FAFAF8" letterSpacing="2" textAnchor="end">
            SOLD 78%
          </text>
          <rect x="40" y="100" width="105" height="160" fill={accent} />
          <text x="58" y="172" fontFamily="serif" fontStyle="italic" fontSize="28" fill="#FAFAF8" transform="rotate(-90 58 172)">
            entrada
          </text>
          <rect x="155" y="100" width="105" height="160" fill="#F5F2EB" />
          <rect x="167" y="116" width="80" height="80" fill="#FAFAF8" />
          <g transform="translate(167 116) scale(0.74)">
            <rect width="108" height="108" fill="#FAFAF8" />
            <rect x="0" y="0" width="30" height="30" fill="#0A0A0A" />
            <rect x="6" y="6" width="18" height="18" fill="#FAFAF8" />
            <rect x="10" y="10" width="10" height="10" fill="#0A0A0A" />
            <rect x="78" y="0" width="30" height="30" fill="#0A0A0A" />
            <rect x="84" y="6" width="18" height="18" fill="#FAFAF8" />
            <rect x="88" y="10" width="10" height="10" fill="#0A0A0A" />
            <rect x="0" y="78" width="30" height="30" fill="#0A0A0A" />
            <rect x="6" y="84" width="18" height="18" fill="#FAFAF8" />
            <rect x="10" y="88" width="10" height="10" fill="#0A0A0A" />
            <rect x="38" y="40" width="6" height="6" fill="#0A0A0A" />
            <rect x="50" y="40" width="6" height="6" fill="#0A0A0A" />
            <rect x="62" y="46" width="6" height="6" fill="#0A0A0A" />
            <rect x="44" y="58" width="6" height="6" fill="#0A0A0A" />
            <rect x="56" y="64" width="6" height="6" fill="#0A0A0A" />
            <rect x="68" y="62" width="6" height="6" fill="#0A0A0A" />
            <rect x="42" y="80" width="6" height="6" fill="#0A0A0A" />
            <rect x="54" y="86" width="6" height="6" fill="#0A0A0A" />
            <rect x="70" y="82" width="6" height="6" fill="#0A0A0A" />
          </g>
          <text x="183" y="220" fontFamily="monospace" fontSize="10" fill="#0A0A0A" letterSpacing="2">
            QR
          </text>
          <text x="183" y="240" fontFamily="monospace" fontSize="10" fill="#6B6B68" letterSpacing="2">
            PG-4F8B-A12X
          </text>
          <rect x="270" y="100" width="90" height="160" fill="#FAFAF8" stroke="#E8E6E0" />
          <text x="282" y="138" fontFamily="serif" fontStyle="italic" fontSize="30" fill="#0A0A0A">
            S/85
          </text>
          <text x="282" y="160" fontFamily="monospace" fontSize="9" fill="#6B6B68" letterSpacing="2">
            FILA · A
          </text>
          <text x="282" y="180" fontFamily="monospace" fontSize="9" fill="#6B6B68" letterSpacing="2">
            ASIENTO · 14
          </text>
          <rect x="282" y="200" width="66" height="22" fill="#0A0A0A" />
          <text x="315" y="216" fontFamily="monospace" fontSize="9" fill="#FAFAF8" letterSpacing="2" textAnchor="middle">
            VALIDAR
          </text>
        </g>
      )}

      {variant === 5 && (
        <g>
          <text x="200" y="100" textAnchor="middle" fontFamily="serif" fontStyle="italic" fontSize="40" fill="#0A0A0A">
            {first}
          </text>
          <line x1="56" y1="120" x2="344" y2="120" stroke="#E8E6E0" />
          <text x="200" y="146" textAnchor="middle" fontFamily="monospace" fontSize="11" fill="#6B6B68" letterSpacing="2">
            CAPACIDAD · TIEMPO REAL
          </text>
          <g transform="translate(56 170)">
            {Array.from({ length: 40 }).map((_, i) => (
              <rect
                key={i}
                x={i * 7.2}
                y="0"
                width="5"
                height="20"
                fill={i < 26 ? '#0A0A0A' : '#E8E6E0'}
              />
            ))}
          </g>
          <text x="56" y="216" fontFamily="monospace" fontSize="10" fill="#6B6B68" letterSpacing="2">
            260/400
          </text>
          <text x="344" y="216" textAnchor="end" fontFamily="monospace" fontSize="10" fill={accent} letterSpacing="2">
            VENDIENDO
          </text>
          <rect x="56" y="234" width="288" height="22" fill={accent} />
          <text x="200" y="250" textAnchor="middle" fontFamily="serif" fontStyle="italic" fontSize="16" fill="#FAFAF8">
            comprar entrada
          </text>
        </g>
      )}
    </svg>
  );
}
