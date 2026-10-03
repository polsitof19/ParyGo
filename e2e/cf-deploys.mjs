// Consulta (y, con acción explícita, cancela/reintenta) deploys de Cloudflare
// Pages usando la sesión OAuth de wrangler. NUNCA imprime el token.
//   node e2e/cf-deploys.mjs list <proyecto>
//   node e2e/cf-deploys.mjs logs <proyecto> <deployId>
//   node e2e/cf-deploys.mjs cancel <proyecto> <deployId>
//   node e2e/cf-deploys.mjs retry <proyecto> <deployId>
import { readFileSync } from 'node:fs';
const ACCT = 'b96c777834ecf55fe3d80675d94b8ade';
const cfg = readFileSync('C:/Users/pauls/AppData/Roaming/xdg.config/.wrangler/config/default.toml', 'utf8');
const token = cfg.match(/oauth_token\s*=\s*"([^"]+)"/)?.[1];
if (!token) throw new Error('sin oauth_token (npx wrangler login)');
const [accion, proyecto, id] = process.argv.slice(2);
const base = `https://api.cloudflare.com/client/v4/accounts/${ACCT}/pages/projects/${proyecto}`;
const api = async (path, method = 'GET') => {
  const r = await fetch(base + path, { method, headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ...j };
};
if (accion === 'list') {
  const j = await api('/deployments?per_page=6');
  if (!j.success) { console.log(j.status, JSON.stringify(j.errors)); process.exit(1); }
  for (const d of j.result) {
    console.log([d.id.slice(0, 8), d.environment, d.deployment_trigger?.metadata?.branch, d.deployment_trigger?.metadata?.commit_hash?.slice(0, 7),
      `${d.latest_stage?.name}:${d.latest_stage?.status}`, d.created_on?.slice(11, 19), d.is_skipped ? 'skipped' : ''].join(' | '));
  }
} else if (accion === 'logs') {
  const j = await api(`/deployments/${id}/history/logs?size=60`);
  if (!j.success) { console.log(j.status, JSON.stringify(j.errors)); process.exit(1); }
  for (const l of j.result?.data ?? []) console.log(l.ts?.slice(11, 19), l.line);
} else if (accion === 'cancel' || accion === 'retry') {
  const j = await api(`/deployments/${id}/${accion}`, 'POST');
  console.log(accion, j.status, j.success, JSON.stringify(j.errors ?? []), j.result?.id ?? '');
} else throw new Error('acción');
