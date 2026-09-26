// Realistic iPhone mockup rendered as pure CSS/SVG — no external image
// dependency. The "screen content" mirrors a generic ParyGo event page
// (header → cover → tickets → CTA) so what visitors see in the hero is what
// they'll actually get when their event is live.
//
// Honest: no specific event name, no fake sold counts, no fake countdown.

export function PhoneMockup() {
  return (
    <div className="phone-wrap relative mx-auto w-full max-w-[300px] md:max-w-[340px]">
      {/* magenta+cyan glow behind */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-[-12%] z-0"
        style={{
          background:
            'radial-gradient(circle at 60% 35%, rgba(255,31,143,0.28), transparent 55%), radial-gradient(circle at 30% 75%, rgba(0,229,255,0.18), transparent 60%)',
          filter: 'blur(36px)',
        }}
      />

      <div className="phone-float relative z-[1]">
        {/* iPhone frame */}
        <div
          className="phone-frame relative rounded-[44px] p-2.5"
          style={{
            background:
              'linear-gradient(155deg, #28282f 0%, #14141c 40%, #0d0d14 100%)',
            boxShadow:
              '0 30px 80px -30px rgba(255,31,143,0.35), 0 30px 60px -20px rgba(0,229,255,0.18), 0 1px 0 rgba(255,255,255,0.06) inset, 0 0 0 1px rgba(255,255,255,0.04) inset',
            aspectRatio: '300 / 612',
          }}
        >
          {/* side button (mute) left */}
          <span
            aria-hidden="true"
            className="absolute -left-[3px] top-[110px] h-[28px] w-[3px] rounded-r-sm"
            style={{ background: '#0a0a10' }}
          />
          {/* side button (volume) left */}
          <span
            aria-hidden="true"
            className="absolute -left-[3px] top-[160px] h-[46px] w-[3px] rounded-r-sm"
            style={{ background: '#0a0a10' }}
          />
          <span
            aria-hidden="true"
            className="absolute -left-[3px] top-[220px] h-[46px] w-[3px] rounded-r-sm"
            style={{ background: '#0a0a10' }}
          />
          {/* power button right */}
          <span
            aria-hidden="true"
            className="absolute -right-[3px] top-[170px] h-[70px] w-[3px] rounded-l-sm"
            style={{ background: '#0a0a10' }}
          />

          {/* Screen */}
          <div
            className="phone-screen relative h-full w-full overflow-hidden rounded-[36px]"
            style={{
              background:
                'linear-gradient(180deg, #14141c 0%, #050508 60%, #050508 100%)',
            }}
          >
            {/* Dynamic Island */}
            <span
              aria-hidden="true"
              className="absolute left-1/2 top-2 z-[2] h-[26px] w-[88px] -translate-x-1/2 rounded-full"
              style={{ background: '#000' }}
            />

            {/* Status bar */}
            <div
              className="relative z-[1] flex items-center justify-between px-7 pt-3"
              style={{
                fontFamily: 'var(--font-inter), system-ui, sans-serif',
                fontSize: 11,
                fontWeight: 600,
                color: '#fff',
                paddingTop: 14,
              }}
            >
              <span>9:41</span>
              <span className="flex items-center gap-1">
                {/* signal bars */}
                <svg width="14" height="10" viewBox="0 0 14 10" fill="#fff" aria-hidden="true">
                  <rect x="0" y="7" width="2" height="3" rx="0.5" />
                  <rect x="3" y="5" width="2" height="5" rx="0.5" />
                  <rect x="6" y="3" width="2" height="7" rx="0.5" />
                  <rect x="9" y="0" width="2" height="10" rx="0.5" />
                </svg>
                {/* battery */}
                <svg width="22" height="10" viewBox="0 0 22 10" fill="none" aria-hidden="true">
                  <rect x="0.5" y="0.5" width="18" height="9" rx="2" stroke="#fff" />
                  <rect x="2" y="2" width="14" height="6" rx="1" fill="#fff" />
                  <rect x="19.5" y="3.5" width="2" height="3" rx="0.5" fill="#fff" />
                </svg>
              </span>
            </div>

            {/* App header */}
            <div className="flex items-center justify-between px-5 pt-8 pb-4">
              <span className="font-display text-[20px] uppercase tracking-[0.01em] inline-flex items-baseline gap-1">
                PARYGO
                <i
                  aria-hidden="true"
                  className="inline-block h-[5px] w-[5px] rounded-full"
                  style={{
                    background: 'var(--magenta)',
                    boxShadow: '0 0 8px var(--magenta)',
                  }}
                />
              </span>
              <span
                className="mono text-[9px]"
                style={{ letterSpacing: '0.18em', color: 'var(--fg-3)' }}
              >
                TU MARCA
              </span>
            </div>

            {/* Cover */}
            <div
              className="relative mx-4 overflow-hidden rounded-[12px]"
              style={{
                aspectRatio: '16/9',
                background:
                  'radial-gradient(circle at 70% 30%, rgba(255,31,143,0.6), transparent 50%), radial-gradient(circle at 30% 70%, rgba(0,229,255,0.45), transparent 55%), linear-gradient(135deg, #2a0f3a, #0d1b2e)',
                border: '1px solid var(--border)',
              }}
            >
              <span
                className="mono absolute top-2.5 right-3 inline-flex items-center gap-1 rounded-full"
                style={{
                  background: 'rgba(0,0,0,0.5)',
                  border: '1px solid rgba(255,255,255,0.18)',
                  padding: '3px 7px',
                  fontSize: 8,
                  color: '#fff',
                  letterSpacing: '0.16em',
                }}
              >
                <span
                  className="inline-block h-[5px] w-[5px] rounded-full"
                  style={{
                    background: 'var(--cyan)',
                    boxShadow: '0 0 6px var(--cyan)',
                  }}
                />
                EN VIVO
              </span>
              <span
                className="absolute inset-0 grid place-items-center text-center font-display uppercase"
                style={{
                  fontSize: 28,
                  color: '#fff',
                  textShadow: '0 2px 18px rgba(0,0,0,0.55)',
                  letterSpacing: '0.02em',
                  lineHeight: 0.95,
                }}
              >
                TU
                <br />
                EVENTO
              </span>
              <span
                className="mono absolute bottom-2 left-3"
                style={{
                  fontSize: 8,
                  letterSpacing: '0.18em',
                  color: 'rgba(255,255,255,0.85)',
                }}
              >
                TU FECHA · TU VENUE
              </span>
            </div>

            {/* Date row */}
            <div className="flex items-center justify-between px-5 pt-3 pb-2">
              <span
                className="mono"
                style={{
                  fontSize: 9,
                  letterSpacing: '0.18em',
                  color: 'var(--fg-2)',
                }}
              >
                TU PRÓXIMO EVENTO
              </span>
              <span
                className="mono"
                style={{
                  fontSize: 9,
                  letterSpacing: '0.18em',
                  color: 'var(--cyan)',
                  textShadow: '0 0 6px rgba(0,229,255,0.45)',
                }}
              >
                ABIERTO
              </span>
            </div>

            {/* Tickets */}
            <div className="flex flex-col gap-2 px-4 py-2">
              {[
                {
                  name: 'General',
                  price: '— S/—',
                  cyan: false,
                },
                {
                  name: 'VIP',
                  price: '— S/—',
                  cyan: true,
                },
                {
                  name: 'Box',
                  price: '— S/—',
                  cyan: false,
                },
              ].map((r) => (
                <div
                  key={r.name}
                  className="flex items-center justify-between rounded-[6px] px-3 py-2.5"
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="font-semibold uppercase tracking-[0.06em]"
                      style={{
                        fontSize: 10,
                        color: '#fff',
                      }}
                    >
                      {r.name}
                    </span>
                    <span
                      className="mono normal-case"
                      style={{
                        fontSize: 9,
                        letterSpacing: '0.06em',
                        color: r.cyan ? 'var(--cyan)' : 'var(--magenta)',
                      }}
                    >
                      {r.price}
                    </span>
                  </span>
                  <span
                    className="mono"
                    style={{
                      fontSize: 8,
                      letterSpacing: '0.10em',
                      color: 'var(--fg-3)',
                    }}
                  >
                    DISPONIBLE
                  </span>
                </div>
              ))}
            </div>

            {/* CTA */}
            <div className="px-4 pt-2 pb-3">
              <div
                className="flex w-full items-center justify-center gap-1.5 rounded-full py-2.5"
                style={{
                  background:
                    'linear-gradient(135deg, #FF1F8F 0%, #B921FF 50%, #00E5FF 100%)',
                  color: '#fff',
                  fontFamily: 'var(--font-inter), sans-serif',
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                }}
              >
                Comprar entrada <span>→</span>
              </div>
            </div>

            {/* payments line */}
            <div
              className="mono px-4 pt-1.5 pb-3 text-center"
              style={{
                fontSize: 7,
                letterSpacing: '0.18em',
                color: 'var(--fg-3)',
                borderTop: '1px dashed var(--border)',
                margin: '0 16px',
              }}
            >
              YAPE · PLIN · VISA · MASTERCARD · BCP
            </div>

            {/* home indicator */}
            <span
              aria-hidden="true"
              className="absolute left-1/2 bottom-[7px] h-[3px] w-[90px] -translate-x-1/2 rounded-full"
              style={{ background: 'rgba(255,255,255,0.7)' }}
            />
          </div>
        </div>
      </div>

      <style>{`
        @keyframes phoneFloat {
          0%, 100% { transform: translateY(0) rotate(-1.5deg); }
          50% { transform: translateY(-8px) rotate(-1.5deg); }
        }
        .phone-float { animation: phoneFloat 6s ease-in-out infinite; transform-origin: center; }
        @media (prefers-reduced-motion: reduce) {
          .phone-float { animation: none !important; transform: none !important; }
        }
      `}</style>
    </div>
  );
}
