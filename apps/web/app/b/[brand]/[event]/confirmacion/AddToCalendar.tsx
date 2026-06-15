'use client';

import { useState } from 'react';
import { CalendarPlus, Check } from 'lucide-react';

// =============================================================
// Agregar al calendario (.ics descargable + Google Calendar)
// =============================================================
// Solo display: usa el INSTANTE del evento (starts_at/ends_at en UTC). El
// calendario del usuario lo muestra en su zona horaria — para un evento de Lima
// visto por alguien en Lima, sale en hora de Lima. Si no hay ends_at, asumimos
// 4 h de duración (solo para el bloque del calendario, no toca la BD).

type Props = {
  title: string;
  startIso: string;
  endIso?: string | null;
  location?: string | null;
  details?: string | null;
  uid: string;
};

// ISO → formato básico iCal en UTC: YYYYMMDDTHHMMSSZ
function toICalUTC(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function escapeICS(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

export function AddToCalendar({ title, startIso, endIso, location, details, uid }: Props) {
  const [done, setDone] = useState(false);
  const start = toICalUTC(startIso);
  const endSource = endIso && !Number.isNaN(new Date(endIso).getTime())
    ? endIso
    : new Date(new Date(startIso).getTime() + 4 * 3600_000).toISOString();
  const end = toICalUTC(endSource);
  if (!start) return null;

  function downloadIcs() {
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//ParyGo//ES',
      'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      `UID:${uid}@parygo.com`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${escapeICS(title)}`,
      location ? `LOCATION:${escapeICS(location)}` : '',
      details ? `DESCRIPTION:${escapeICS(details)}` : '',
      'END:VEVENT',
      'END:VCALENDAR',
    ].filter(Boolean);
    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.ics`;
    a.click();
    URL.revokeObjectURL(url);
    setDone(true);
    setTimeout(() => setDone(false), 2500);
  }

  const gcalUrl =
    'https://calendar.google.com/calendar/render?action=TEMPLATE' +
    `&text=${encodeURIComponent(title)}` +
    `&dates=${start}/${end}` +
    (location ? `&location=${encodeURIComponent(location)}` : '') +
    (details ? `&details=${encodeURIComponent(details)}` : '');

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
      <button type="button" onClick={downloadIcs} className="c-btn c-btn--soft">
        {done ? <><Check className="h-4 w-4" /> Descargado</> : <><CalendarPlus className="h-4 w-4" /> Agregar al calendario</>}
      </button>
      <a href={gcalUrl} target="_blank" rel="noopener noreferrer" className="c-btn c-btn--soft">
        Google Calendar
      </a>
    </div>
  );
}
