// Server component — purely decorative viewport overlays.
export function ChromeDecor() {
  return (
    <>
      {/* registration mark — top-left */}
      <div
        className="fixed top-[14px] left-[14px] z-[4] mono pointer-events-none hidden md:flex flex-col gap-1"
        style={{ fontSize: 9, letterSpacing: '0.18em', color: 'var(--fg-3)' }}
        aria-hidden="true"
      >
        <span
          className="relative inline-block"
          style={{ width: 14, height: 14 }}
        >
          <span
            className="absolute"
            style={{
              left: 6,
              top: 0,
              width: 1,
              height: 14,
              background: 'var(--border-strong)',
            }}
          />
          <span
            className="absolute"
            style={{
              top: 6,
              left: 0,
              height: 1,
              width: 14,
              background: 'var(--border-strong)',
            }}
          />
        </span>
        <span>REG / 001</span>
      </div>

      {/* viewport corner ticks */}
      <div className="fixed inset-0 z-[3] pointer-events-none" aria-hidden="true">
        <span
          className="absolute"
          style={{
            width: 10,
            height: 10,
            top: 14,
            right: 14,
          }}
        >
          <span
            className="absolute"
            style={{
              left: 4,
              top: 0,
              width: 1,
              height: '100%',
              background: 'var(--border-strong)',
            }}
          />
          <span
            className="absolute"
            style={{
              top: 4,
              left: 0,
              height: 1,
              width: '100%',
              background: 'var(--border-strong)',
            }}
          />
        </span>
        <span
          className="absolute"
          style={{
            width: 10,
            height: 10,
            bottom: 14,
            left: 14,
          }}
        >
          <span
            className="absolute"
            style={{
              left: 4,
              top: 0,
              width: 1,
              height: '100%',
              background: 'var(--border-strong)',
            }}
          />
          <span
            className="absolute"
            style={{
              top: 4,
              left: 0,
              height: 1,
              width: '100%',
              background: 'var(--border-strong)',
            }}
          />
        </span>
        <span
          className="absolute"
          style={{
            width: 10,
            height: 10,
            bottom: 14,
            right: 14,
          }}
        >
          <span
            className="absolute"
            style={{
              left: 4,
              top: 0,
              width: 1,
              height: '100%',
              background: 'var(--border-strong)',
            }}
          />
          <span
            className="absolute"
            style={{
              top: 4,
              left: 0,
              height: 1,
              width: '100%',
              background: 'var(--border-strong)',
            }}
          />
        </span>
      </div>

      {/* scanline */}
      <div
        className="fixed inset-x-0 top-0 z-[198] h-px pointer-events-none"
        style={{
          background: 'var(--cyan)',
          boxShadow: '0 0 8px var(--cyan)',
          opacity: 0,
          animation: 'scanPass 14s linear infinite',
        }}
        aria-hidden="true"
      />
    </>
  );
}
