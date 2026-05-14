import { QrMark } from './QrMark';

type TicketStubProps = {
  event?: string;
  date?: string;
  seat?: string;
  code?: string;
  accent?: string;
  className?: string;
};

export function TicketStub({
  event = 'Aurora · Live Set',
  date = '14 · JUN · 26',
  seat = 'GA · 042',
  code = 'PG-4F8B-A12X',
  accent = '#E85D3C',
  className,
}: TicketStubProps) {
  return (
    <div
      className={`relative w-full max-w-[420px] overflow-hidden border border-border bg-bg shadow-[0_1px_0_rgba(10,10,10,0.04)] ${className ?? ''}`}
      style={{
        backgroundImage:
          'radial-gradient(circle at 70% 0, transparent 9px, transparent 0)',
      }}
    >
      <div className="flex items-stretch">
        {/* Left: info */}
        <div className="flex-1 p-7">
          <div className="mono mb-6 flex items-center justify-between">
            <span>PARYGO · TICKET</span>
            <span style={{ color: accent }}>· LIVE</span>
          </div>

          <div className="mb-1 text-[11px] font-mono uppercase tracking-[0.18em] text-fg-muted">
            EVENTO
          </div>
          <div className="serif-i mb-6 text-[34px] leading-none">{event}</div>

          <div className="grid grid-cols-2 gap-y-4">
            <div>
              <div className="mono mb-1">FECHA</div>
              <div className="text-[13px]">{date}</div>
            </div>
            <div>
              <div className="mono mb-1">ACCESO</div>
              <div className="text-[13px]">{seat}</div>
            </div>
            <div className="col-span-2">
              <div className="mono mb-1">CÓDIGO</div>
              <div className="font-mono text-[13px] tracking-[0.08em]">{code}</div>
            </div>
          </div>
        </div>

        {/* Perforation */}
        <div
          className="relative w-px self-stretch bg-transparent"
          aria-hidden="true"
        >
          <div className="absolute inset-y-2 left-0 w-px border-l border-dashed border-border" />
        </div>

        {/* Right: QR + price */}
        <div className="flex w-[150px] flex-col items-center justify-between gap-4 p-5 stripes">
          <div className="mono w-full text-center">QR · ÚNICO</div>
          <QrMark size={108} seed={code.length} />
          <div className="mono w-full text-center" style={{ color: accent }}>
            VÁLIDO 1×
          </div>
        </div>
      </div>

      {/* corner cut decoration */}
      <span
        className="pointer-events-none absolute -left-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-bg"
        aria-hidden
      />
      <span
        className="pointer-events-none absolute -right-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-bg"
        aria-hidden
      />
    </div>
  );
}
