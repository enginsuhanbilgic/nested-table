# Transaction (order search) page — backend implementation

Spring Boot implementation of the `/api/transaction/*` endpoints for the
order-search / transaction page described in `transaction_sayfasi_metni.txt`.
Package layout and code style follow the existing project
(`com.bistech.reporting.{model,dto,repository}.transaction`, `...service`,
`...controller`), mirroring the `UserLatency` / nested-latency snippets.

Database objects live in **`../order_search.sql`** (run AFTER
`latency_stats_pipeline.sql` — it redefines `stat.up_purge_latency_stats`
with a fourth parameter, `p_keep_days_order_search DEFAULT 14`).

## Architecture in one paragraph

`POST /searches` records the caller's interest in `stat.order_search_request`
(their history) and either enqueues a `stat.order_search` row (status
`QUEUED`) or reuses an existing execution. The **database is the queue**: a
`@Scheduled` worker claims rows with `FOR UPDATE SKIP LOCKED`, flips them to
`RUNNING` (own transaction, so pollers see it), snapshots the `order_id`
lineage from `public`/`his.me_pcap` into `stat.order_search_hit`, and
finishes with `DONE` / `NOT_FOUND` / `FAILED`. The frontend polls
`GET /searches/{publicId}` (1–2 s). Neighbor comparisons (`ME`/`GW` buttons)
are **computed live per click** — nothing about them is persisted, so the
window/max-orders controls stay free and there is no cache to invalidate.

## Executions vs. requests (the two-table model)

`order_search` is the *execution* (shared cache: one physical search serves
everyone). `order_search_request` is the *history*: one row per
`(user, execution)`, upserted on every **explicit** search — so when two
users race on the same order, or one hits a still-fresh cached result, each
still sees the search in their own list (re-searching bumps their row to the
top). Opening a shared results link writes nothing and therefore never
appears in anyone's history. `order_search.requested_by` remains only as
"who triggered this execution" for ops, and is never serialized.

## Endpoints

| Endpoint | Purpose | Returns |
|---|---|---|
| `POST /api/transaction/searches` | enqueue or reuse a search (`{order_id, tx_date?}`; `tx_date` defaults to today, future dates 400) and record it in the caller's history | `OrderSearchResponse` |
| `GET /api/transaction/searches` | caller's own history, paged; sort fields `created_at`/`requested_at` (both = *my* request time), `finished_at`, `tx_date`, `order_id`, `status`, `result_count` | `PageResponse<OrderSearchResponse>` |
| `GET /api/transaction/searches/{publicId}` | status + hits (hits empty until `DONE`); the shareable-link read | `OrderSearchDetailResponse` |
| `GET /api/transaction/searches/{publicId}/orders/{commitId}/neighbors` | live neighbor comparison; `scope=me\|gw`, `windowMs` (default 50, clamp 1..50), `maxOrders` per side (default 100, clamp 1..500) | `NeighborResponse` |

All JSON keys are snake_case via `@JsonProperty`, matching the other pages.
In `OrderSearchResponse`, `created_at` is when the shared execution was
enqueued; `requested_at` is when *this caller* (last) asked — filled on
create and in history, null on the shared-link detail read.

## Agreed behaviors encoded here

- **Reuse/TTL — DONE only**: historical (`tx_date < today`) `DONE` searches
  are reused forever (closed days are immutable); today's `DONE` for
  **15 minutes** (`OrderSearchService.REUSE_TTL`). **`NOT_FOUND` and `FAILED`
  are never cached and never listed in history** — the user can re-search
  them immediately, and the history grid shows `DONE` rows only (the
  frontend reports not-found/failed inline on the search page and stays
  there; there is no progress screen). History additionally lists only the
  **latest** execution per `(order_id, tx_date)` the user searched, so a TTL
  re-run does not read as a duplicate row. `QUEUED`/`RUNNING` are always
  reused — the partial unique index
  `uq_order_search_active` guarantees at most one in-flight execution per
  `(order_id, tx_date)`. Losing that insert race is recovered by re-reading
  the **latest non-FAILED** row (not just QUEUED/RUNNING — the winner may
  already have finished by then; that fresh result is exactly what the loser
  wants). `createOrReuse` is *not* `@Transactional` for this reason: a
  constraint violation inside an outer transaction would poison it.
- **Schema routing is calendar-guessed, probe-confirmed.** Data for day D
  migrates public→his at ~04:15 on D+1, so between midnight and the move
  "`tx_date < today` ⇒ his" is wrong. The worker queries the guessed schema
  and **falls back to the other on a miss** before declaring NOT_FOUND; the
  neighbors endpoint probes for the reference `commit_id` (one indexed
  `EXISTS` per schema) and routes to wherever the day actually lives *at
  click time* (a search run at 23:00 has its data move overnight — routing
  can never be stored). If the day has been dropped from his entirely,
  neighbors answer **410 GONE**; the snapshot grids remain viewable. This
  assumes nothing about migration timing, lateness, or failure.
- **Back-pressure**: a user may have at most **5** in-flight
  (QUEUED/RUNNING) executions (`MAX_IN_FLIGHT_PER_USER`); the sixth answers
  **429**. Joining an existing search via the cache is always allowed — the
  cap guards only new queue entries, so one user cannot starve the
  single-threaded worker. Dead searches (NOT_FOUND/FAILED) are additionally
  purged after **6 hours** (`p_keep_hours_dead_search`) instead of 14 days.
- **order_id validation**: the request DTO carries `order_id` as a *string*
  (matching the bigint-safe response contract); the service parses it and
  answers a clean 400 for non-numeric, non-positive, or Long-overflowing
  values. The frontend pre-validates (digits, ≤19 chars, ≤ Long.MAX_VALUE).
- **NOT_FOUND hints**: the worker probes both schemas by `order_id`
  (`findDatesContainingOrder`; one index probe per his partition) and stores
  the other dates containing the order in `hint_dates`, so the UI can offer
  "this order exists on 2026-07-28 — search that date". No silent fallback.
- **Neighbors**:
  - ME scope: same `partition`, window on `me_net_input_time` — served by
    `idx_me_pcap_txdate_netin` / `idx_his_me_pcap_txdate_netin`.
  - GW scope: same `(node, process, partition)`, window on
    `gw_net_input_time` — implemented as a **widened `me_net_input_time`
    range** (± window + 1 s slack, since gw time always precedes me time by
    far less) **plus the exact gw filter**, so **no new me_pcap index** is
    needed. **Units**: `gw_net_*` timestamps are **microseconds** while
    `me_net_*`/`me_vrd_*` are nanoseconds — the gw window is applied in µs
    and scaled ×1000 for the me index range.
  - Orders that never reached the ME (`me_net_input_time IS NULL`) are
    excluded from both scopes (agreed: too many null fields). If the
    *reference* order itself lacks the needed timestamp, the endpoint answers
    422 and the frontend should disable that button (hit DTOs carry the raw
    times, so the frontend knows in advance).
  - `participant LIKE '%PRV%'` rows are excluded; `MO96/MO75/ET96` message
    types are **included** (unlike the stats pipeline). NULL participants are
    kept. The reference order is always shown even if it is itself PRV.
  - Response `rows` include the reference order (see `reference_commit_id`),
    sorted by the scope's input time — the grid renders the highlighted row
    in place.
  - Per side: nearest N (`maxOrders`) within the window; fewer if the window
    is sparse. Ties at the reference timestamp land on the "after" side.
- **Shareable links**: `public_id` (UUID) appears in URLs; the sequential PK
  stays internal so links cannot be enumerated. `GET /searches/{publicId}` is
  readable by **any** `ILETISIM_KANALLARI` holder, never writes anything
  (viewer's history untouched), and answers 404 for unknown/purged ids —
  opening a link never triggers a search.
- **Retention**: executions purge after 14 days via the extended
  `stat.up_purge_latency_stats()`; hits and requests cascade. his.me_pcap
  keeps ~22 days, so neighbors normally remain computable for every unpurged
  search (the 410 above covers retention-policy changes).
- **Worker robustness**: `attempts` counts claims; stale `RUNNING` rows
  (worker crash) are requeued after 10 min and abandoned as `FAILED` after
  3 attempts. Failures store a truncated `error_text` (DB-only, for ops).
  `deleteBySearchId` is a **bulk JPQL delete on purpose**: a derived
  `deleteBy` queues entity removals that Hibernate flushes *after* insertions,
  so delete-then-insert of the same keys in one transaction would die on the
  primary key; the bulk statement executes immediately, in call order.

## Known edges (accepted, documented)

- **commit_id uniqueness**: neighbor rows have been observed with repeated
  `commit_id`s in test data, contradicting the "globally unique" assumption.
  The neighbors path tolerates duplicates (raw query, synthetic row keys in
  the frontend), but `stat.order_search_hit`'s PK is
  `(search_id, commit_id)` — if a single order's *lineage* ever contains a
  duplicate commit_id, the snapshot insert fails and the search lands on
  FAILED. Confirm whether duplicates are a test-data artifact or real
  before production.
- `queue_position` counts only QUEUED rows ahead; position 1 while another
  search is RUNNING means "next up".
- If an execution somehow ran longer than the 10-min stale threshold, the
  reaper would requeue it and two workers could process it concurrently; the
  bulk-delete-then-insert makes the second pass idempotent, and a lineage
  lookup is an index probe, so in practice this cannot trigger.
- `saveAll` on hits issues a select per row (assigned composite ids look
  like detached entities to JPA). Lineages are a handful of rows; not worth
  a JDBC batch path.
- If migration ever left a day *partially* in both schemas mid-copy, the
  primary schema's rows win (no merge). With `ATTACH PARTITION`-style
  migration this state does not occur.
- Consider `spring.jdbc.template.query-timeout` (applies to
  `MePcapQueryRepository`) as a belt-and-braces cap on ad-hoc me_pcap load.

## Wiring checklist

- `@EnableScheduling` must be on for `OrderSearchWorker`
  (`transaction.search.poll-ms`, default 1000, and
  `transaction.search.stale-check-ms`, default 60000, tune the loops).
- `@EnableMethodSecurity` must be on for the controller's `@PreAuthorize`.
  `hasRole('ILETISIM_KANALLARI')` expects the granted authority
  `ROLE_ILETISIM_KANALLARI` (the spelling in the frontend `Role` type) —
  check what `lr_user_roles` actually stores.
- `@AuthenticationPrincipal(expression = "userId")` expects the principal to
  expose a `UUID userId` property, per the existing convention.
- `MePcapQueryRepository` uses the auto-configured `JdbcTemplate` (primary
  DataSource — same DB as the JPA entities).
- `OrderSearch.hintDates` (`date[]`) uses Hibernate 6.1+
  `@JdbcTypeCode(SqlTypes.ARRAY)` — same requirement as `UserDaily.ports`.
- `gen_random_uuid()` in the DDL needs PostgreSQL 13+ (else `pgcrypto`);
  the Java side also sets `publicId` explicitly, so the DB default is only a
  safety net.
- `PageResponse` is the existing project wrapper (same one the other
  controllers use); the import was omitted here like in the transcribed
  snippets.
- Errors are thrown as `ResponseStatusException` (400 bad params, 404 unknown
  search/commit, 410 raw day purged from his, 422 comparison impossible for
  that order, 429 in-flight cap). If the project has a global exception
  handler with a different envelope, adapt there. NOTE: by default Spring
  Boot omits the exception's reason string from the error body — set
  `server.error.include-message: always` (or handle it in the global
  handler), otherwise the frontend shows generic messages instead of e.g.
  the 429 explanation.
- **bigint precision**: `commit_id`, `order_id` and the `*_time` epoch
  fields are serialized as JSON **strings** (`ToStringSerializer`) — the ns
  values exceed JavaScript's `Number.MAX_SAFE_INTEGER`, so numeric JSON
  would silently corrupt them in the browser (gw µs values would fit, but
  stay strings for one consistent contract). The frontend types them as
  `string` and uses BigInt for arithmetic. Latencies (µs) stay numeric.
  Jackson coerces the incoming `{"order_id": "123..."}` string back to
  `Long` on the request side by default.
- **me_asic_\*** columns are excluded end to end (DDL, entity, DTOs,
  frontend) — not used by this feature.
- **Timezone assumption**: `LocalDate.now()` is "today" for the schema
  *guess* and the TTL rule — the server runs in exchange-local time, the
  same assumption the stats pipeline makes. (Routing itself no longer
  depends on it thanks to the probe-and-fallback.)

## Frontend counterpart

Lives in `../original-project-snippet/src`: `types/transaction.ts`,
`services/transactionService.ts`, `pages/TransactionSearchPage.tsx`
(`/transactions`) and `pages/TransactionDetailPage.tsx`
(`/transactions/:publicId`), wired in `App.tsx` / `routes/routeMeta.tsx`
behind `TRANSACTION_PAGE_ROLES = ['ROLE_ILETISIM_KANALLARI']`.
