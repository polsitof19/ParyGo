// Client-only IndexedDB layer for the door scanner: caches the event's valid
// QRs for offline validation and holds a durable queue of offline scans to
// sync when the network returns.
import { openDB, type IDBPDatabase } from 'idb';

export type CachedTicket = {
  qr_code: string;
  attendee_name: string | null;
  ticket_type_name: string;
  max_scans: number | null;
  scan_count: number;
  buyer_dni?: string | null;
  buyer_doc_type?: string | null;
};

export type QueuedScan = {
  client_scan_id: string;
  qr_code: string;
  scanned_at: string; // ISO
  device_id: string;
  synced: boolean;
  result?: string;
};

const DB_NAME = 'parygo-scan';
const VERSION = 1;
let _db: IDBPDatabase | null = null;

async function db(): Promise<IDBPDatabase> {
  if (_db) return _db;
  _db = await openDB(DB_NAME, VERSION, {
    upgrade(d) {
      if (!d.objectStoreNames.contains('tickets')) d.createObjectStore('tickets', { keyPath: 'qr_code' });
      if (!d.objectStoreNames.contains('queue')) d.createObjectStore('queue', { keyPath: 'client_scan_id' });
    },
  });
  return _db;
}

export async function cacheTickets(list: CachedTicket[]): Promise<void> {
  const d = await db();
  const tx = d.transaction('tickets', 'readwrite');
  await tx.store.clear();
  for (const t of list) await tx.store.put(t);
  await tx.done;
}

export async function getCachedTicket(qr: string): Promise<CachedTicket | undefined> {
  return (await db()).get('tickets', qr) as Promise<CachedTicket | undefined>;
}

export async function bumpLocalScan(qr: string): Promise<void> {
  const d = await db();
  const t = (await d.get('tickets', qr)) as CachedTicket | undefined;
  if (t) {
    t.scan_count = (t.scan_count ?? 0) + 1;
    await d.put('tickets', t);
  }
}

export async function enqueueScan(scan: QueuedScan): Promise<void> {
  await (await db()).put('queue', scan);
}

export async function pendingScans(): Promise<QueuedScan[]> {
  const all = (await (await db()).getAll('queue')) as QueuedScan[];
  return all.filter((s) => !s.synced).sort((a, b) => a.scanned_at.localeCompare(b.scanned_at));
}

export async function markScanSynced(clientScanId: string, result: string): Promise<void> {
  const d = await db();
  const s = (await d.get('queue', clientScanId)) as QueuedScan | undefined;
  if (s) {
    s.synced = true;
    s.result = result;
    await d.put('queue', s);
  }
}

export function getDeviceId(): string {
  if (typeof window === 'undefined') return 'server';
  let id = localStorage.getItem('parygo-device-id');
  if (!id) {
    id = 'dev-' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem('parygo-device-id', id);
  }
  return id;
}
