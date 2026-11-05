# 5. Assumptions

## Business

1. **`Date` is the price's effective date** in the store's local calendar. A record is identified by **(Store ID, SKU, Date)**.
2. Uploading the same (Store ID, SKU, Date) again **updates** that record. Latest write wins, with the version bumped and the change audited. Identical rows are skipped, with no version bump.
3. Feeds may be **delta or full**. At production scale the ingestion also suppresses rows whose price and name match the price already in effect, which keeps history growth to real changes. Search then supports "as of date" queries (latest effective date ≤ the requested date).
4. **Editable fields are Price and Product Name.** Store ID, SKU and Date identify the record: to "move" a price, upload a correct row. Every edit needs a short reason.
5. A feed updating a manually edited record **overrides it**. The audit trail shows both changes. A "manual override lock" or maker-checker approval for large changes is a possible follow-up, not in scope.
6. Product Name is stored as received per store (no product master in scope). Prices are shelf prices including tax, as sent by the store.
7. **Currency comes from the store master**, never from the file. Prices are non-negative with up to 4 decimals.
8. Pushing prices to POS tills, promotions, competitor pricing and price approval workflows are **out of scope**. Downstream systems consume `PriceChanged` events.

## Users and access

9. About 3,000 store managers, ~150 regional analysts and ~20 HQ admins. **Store managers see and change only their own store(s); analysts only their countries; admins everything.**
10. A corporate IdP (Entra ID or Okta) with MFA already exists, and its groups can express role plus store/country scope.
11. Devices are company-managed through MDM, or BYOD with an MDM app-protection policy. iOS 16+ and Android 8+.

## Data and volumes

12. About 30,000 active SKUs per store, ~10% changing daily, plus a weekly full file. Most uploads happen in a 2-hour morning window per region (see the sizing table in [Non-functional requirements](04-non-functional-requirements.md)).
13. Files are **UTF-8 CSV with a header row**, at most **50 MB** (~500k rows) per upload from a device. Larger HQ-level consolidated feeds use a server-to-server path (SFTP or API into the same bucket and queue), not the mobile app.
14. Dates use **ISO-8601 `YYYY-MM-DD`** and decimals use `.`. Other formats are rejected with a clear, row-level message rather than guessed.

## Technology and delivery

15. AWS is the reference cloud. An Azure mapping is given in the [solution architecture](02-solution-architecture.md), and the design uses no AWS-only concepts.
16. The ERP is the source of truth for the store master and can feed a nightly or on-change sync.
17. Mobile release uses EAS (Build, Submit, Update). Enterprise distribution is through the App Store / Google Play (private or managed) and MDM.

## Simplifications in the runnable implementation

| Production design | Implemented here as | Why |
|---|---|---|
| OIDC SSO via the corporate IdP | Demo personas (`/auth/dev-login`) issuing short-lived HS256 JWTs with the same claims | No IdP available. Scope enforcement is identical. |
| S3 pre-signed PUT | `PUT /api/v1/feeds/{id}/content`, streamed to disk with SHA-256 verification | Same client contract (`upload.url` / `method` / `headers`). |
| SQS + worker deployment | In-process queue with the same at-least-once, idempotent contract; recovers queued jobs on restart | Zero infrastructure to run locally. |
| Aurora PostgreSQL (partitioned) | PGlite (PostgreSQL in WASM), or real PostgreSQL via `DATABASE_URL` | Same SQL; partitioning described in the migration header. |
| Push notifications | Live polling of feed status while the screen is open | Push needs APNs/FCM credentials. |
| COPY + MERGE bulk load | Batched `INSERT … ON CONFLICT` with audit in one statement per batch | Same semantics; simpler at demo volumes. |
| Background/resumable native upload | `XMLHttpRequest` PUT with progress and cancel | Runs in Expo Go without a custom dev build. |
