import { redirect } from 'next/navigation';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Yape review moved per-event to /admin/events/[id]. This brand-wide inbox is
// retired; keep the route as a redirect so old links don't 404.
export default function RetiredYapeInbox() {
  redirect('/admin');
}
