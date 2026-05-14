type QrMarkProps = {
  size?: number;
  seed?: number;
  className?: string;
};

// Lightweight pseudo-QR rendered as a deterministic SVG grid. Not a real
// scannable code — purely decorative for the editorial design.
export function QrMark({ size = 120, seed = 7, className }: QrMarkProps) {
  const cells = 17;
  const cell = size / cells;

  const pick = (x: number, y: number) => {
    const n = Math.sin(x * 9.7 + y * 4.3 + seed) * 10000;
    return Math.floor((n - Math.floor(n)) * 100) > 56;
  };

  const finder = (cx: number, cy: number) => (
    <g key={`f-${cx}-${cy}`} transform={`translate(${cx * cell} ${cy * cell})`}>
      <rect width={cell * 7} height={cell * 7} fill="#0A0A0A" />
      <rect x={cell} y={cell} width={cell * 5} height={cell * 5} fill="#FAFAF8" />
      <rect x={cell * 2} y={cell * 2} width={cell * 3} height={cell * 3} fill="#0A0A0A" />
    </g>
  );

  const dots = [];
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      const inFinder =
        (x < 7 && y < 7) ||
        (x > cells - 8 && y < 7) ||
        (x < 7 && y > cells - 8);
      if (inFinder) continue;
      if (pick(x, y)) {
        dots.push(
          <rect
            key={`${x}-${y}`}
            x={x * cell}
            y={y * cell}
            width={cell}
            height={cell}
            fill="#0A0A0A"
          />
        );
      }
    }
  }

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    >
      <rect width={size} height={size} fill="#FAFAF8" />
      {dots}
      {finder(0, 0)}
      {finder(cells - 7, 0)}
      {finder(0, cells - 7)}
    </svg>
  );
}
