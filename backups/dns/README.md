# DNS backups for parygo.com

Cloudflare zone `8b89c4084892192057c57d12a9aeb0f5`.

Snapshot files are the raw BIND export from
`GET /zones/{zone}/dns_records/export`. Re-import via:

```
POST https://api.cloudflare.com/client/v4/zones/{zone}/dns_records/import
Content-Type: multipart/form-data
file=@parygo-com-backup-<timestamp>.txt
```

or via dashboard → DNS → Records → Import.

## State at 2026-05-14 16:02 UTC

| Name | Type | Target | Proxied |
|---|---|---|---|
| `parygo.com` | CNAME | `parygo.pages.dev` | yes |
| `*.parygo.com` | CNAME | `parygo.pages.dev` | yes |
| `hoesky.parygo.com` | CNAME | `parygo.pages.dev` | yes |

The wildcard means every subdomain that doesn't have a more specific
record falls back to the `parygo` Pages project (the landing). Since the
landing project doesn't list any subdomains as custom domains, those
fallbacks return HTTP 522.

`hoesky.parygo.com` looks like a stale leftover from an early test. Not
touched in this run — keep an eye on it.
