import QRCode from 'qrcode';
import { publicEnv } from '@/lib/env';

// Server-side QR generation. Returns a data URL (PNG) for inline rendering
// or attachment in emails.
export async function generateQrDataUrl(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    type: 'image/png',
    margin: 1,
    width: 480,
    color: {
      dark: '#0a0a14',
      light: '#ffffff',
    },
  });
}

export async function generateQrSvg(payload: string): Promise<string> {
  return QRCode.toString(payload, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 1,
    color: { dark: '#0a0a14', light: '#ffffff' },
  });
}

export function ticketPublicUrl(brandSlug: string, qrCode: string): string {
  return `https://${brandSlug}.${publicEnv.NEXT_PUBLIC_APP_DOMAIN}/t/${qrCode}`;
}
