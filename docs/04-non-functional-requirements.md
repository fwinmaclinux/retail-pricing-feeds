# 4. Non-functional requirements

## 4.1 Sizing that drives the design (see assumptions)

| Dimension | Estimate |
|---|---|
| Stores / countries / regions | 3,000 / ~15 / 4 cells |
| Active SKUs per store | ~30,000 (5k–80k) |
| Feed pattern | Daily delta (~10% of SKUs) plus a weekly full file, uploaded mostly in a 2-hour morning window per region |
| Rows ingested per day | ~22M on average (9M delta + 13M from the weekly full files spread across the week) |
| Peak ingestion (largest region, ~1,200 stores) | ~1,200 rows/s on a normal morning; ~5,000 rows/s if every store sends its full file in the same window → **designed for 10,000 rows/s per region** |
| Price records | ~90M current; ~9M real changes/day → ~3.3B history rows/year (≈ 1 TB with indexes); 13 months online, older partitions archived to the data lake |
| Users / peak concurrency | ~5,000 / ~1,500 |
| Search traffic (peak) | ~200 requests/s per region → designed for 500 |

## 4.2 Requirements and how the design meets them

| Category | Requirement (target) | How the design addresses it | In this implementation |
|---|---|---|---|
| **Scalability** | 10k rows/s ingestion per region; 500 search req/s; grow to 5,000 stores without redesign | Direct-to-S3 upload; queue-buffered workers autoscaled on queue depth; batch upserts (COPY + MERGE at scale); stateless API behind a load balancer; read replicas for search; partitioning by country and month | Streaming CSV parser, batched upsert (500 rows per round trip), stateless API, keyset paging |
| **Performance** | Search p95 < 400 ms server-side and < 1 s on device over 4G; save p95 < 300 ms; 30k-row feed processed < 60 s after upload; app cold start < 2 s on a mid-range Android | One index per access path plus trigram for names; scope-first queries; debounced search; FlashList virtualization; Hermes; cached reference data | Indexes in `001_initial_schema.sql`; 350 ms debounce; FlashList; 24 h stores cache |
| **Availability** | 99.9% for search and edit (stores span every timezone, so effectively 24×7); ingestion may be delayed but never loses an accepted file | Multi-AZ everything; regional cells; health probes and rolling/blue-green deploys; DLQ plus redrive; queued jobs survive restarts | `/health/live` and `/health/ready`; jobs re-queued on startup; graceful shutdown waits for running jobs |
| **Resilience and offline** | Stores with weak Wi-Fi keep working: read recent data offline; never lose an edit or upload | Persisted query cache; mutations pause offline and resume; resumable background uploads; retries with backoff (never on 4xx); idempotent server operations | Persisted TanStack cache, offline banner, paused-mutation notice, upload cancel/retry, checksum dedupe |
| **Data integrity** | No lost updates; no double-applied feeds; exact money | Optimistic concurrency (`If-Match`); natural-key upsert; SHA-256 checksum verified server-side; `NUMERIC` money; currency from the store master; per-batch transactions with audit | All implemented and covered by API tests |
| **Security** | SSO + MFA; least privilege; OWASP ASVS L2 (API) and MASVS L1/L2 (mobile); encryption in transit and at rest | OIDC + PKCE; RBAC + row-level scope in SQL; WAF, rate limits, size limits; TLS 1.3; KMS; short-lived pre-signed URLs; malware scan on upload; CSV formula-injection guard; Keychain/Keystore tokens; certificate pinning, jailbreak/root signals and MDM in release builds; dependency scanning and SBOM in CI | JWT auth, scope in every query, Helmet headers, rate limit, upload size cap, formula guard, secure-store tokens, problem details without stack traces |
| **Privacy and data residency** | Personal data stays in-region (GDPR, India DPDP); minimal personal data | Regional cells; only user ids in records and audit; logs redact `Authorization`; Sentry PII scrubbing | Authorization header redacted from logs |
| **Auditability and compliance** | Every price change traceable for 7 years (who, what, when, why); original files kept | Append-only audit table; mandatory change reason; immutable versioned S3 with Object Lock; audit archived to the data lake | Audit on create, feed update and manual edit; reason required; history screen |
| **Observability** | Detect and diagnose problems within minutes; SLOs per journey | Correlation id from device to worker; structured JSON logs; OpenTelemetry traces; metrics (queue depth, rows/s, reject rate, p95 latency, crash-free sessions); SLO dashboards and alerts | `X-Request-Id` on every call and in logs; per-feed ingestion metrics logged |
| **Usability and accessibility** | Usable one-handed on the shop floor; WCAG 2.2 AA equivalent | Large touch targets; plain-language errors with the exact row and fix; screen-reader roles and labels; Dynamic Type; tablet-friendly max widths | Accessible roles and labels on interactive elements, 48 pt buttons, row-level messages |
| **Internationalisation** | Multiple countries, currencies, languages and timezones; RTL-ready (e.g. Arabic for UAE) | Store-driven currency and timezone; Intl formatting by device locale; i18next string catalogs; UTF-8 everywhere; RTL layout testing | Intl currency and date formatting; JPY/INR zero-decimal handling in sample data; UTF-8 + BOM tolerant parsing |
| **Maintainability and testability** | New team members productive in days; safe refactoring | TypeScript strict end to end; feature modules; ports and adapters; ADRs; unit, integration and E2E (Maestro) tests in CI; forward-only migrations | 30 backend tests (validation + API integration on real PostgreSQL via PGlite), 13 mobile unit tests, strict typecheck on both |
| **Deployability** | Daily backend releases with no downtime; mobile hotfix within hours | Blue/green or rolling deploys; expand-contract migrations; EAS Update staged rollout with rollback; feature flags; minimum-version gate | Versioned migration runner; EAS-ready Expo config |
| **Cost efficiency** | Cost proportional to load; peak-hour scaling | Autoscaled workers (to zero off-peak); Graviton; S3 lifecycle to Glacier; partition drop for retention; read replicas only in large regions | n/a (design) |
| **Device support** | iOS 16+ and Android 8+ phones and tablets; corporate and BYOD (MDM) | Expo SDK 58 baseline; responsive layouts (max-width content on tablets); portrait and landscape | `orientation: default`, `supportsTablet`, constrained content widths |
