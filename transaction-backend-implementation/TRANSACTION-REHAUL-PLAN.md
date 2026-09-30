# Transaction / order-search rehaul — plan

**Status: PLANNED, NOT IMPLEMENTED (2026-08-17).** An interim fix is live in the
real project: adding `@EnableScheduling` (placed on `SecurityConfig`) revived the
queue worker — see §2 for why that is a tourniquet, not a cure, and what remains
broken. This document is self-contained: a future session can implement from it
without the original conversation.

Companion documents: the original functional spec is
`../transaction_sayfasi_metni.txt`; the current (pre-rehaul) implementation is
documented in [README.md](README.md) — **stale where it disagrees with this plan**
(notably `ILETISIM_KANALLARI`, the `@EnableScheduling` wiring note, and the
"commit_id uniqueness" open question, which §3 resolves). Auth integration follows
[../nested-backend-implementation/REHAUL-PLAN.md](../nested-backend-implementation/REHAUL-PLAN.md)
(RBAC), especially its §3.5 page table.

---

## 1. Post-mortem — why searches sat in QUEUED forever

All four verified in code:

1. **The worker died silently.** The queue's only driver was two `@Scheduled`
   methods on `OrderSearchWorker`; `@EnableScheduling` was a *host-project
   prerequisite* (old README "wiring checklist"). The RBAC rehaul rewrote
   `SecurityConfig` and deleted `SecurityContextRepositoryConfig` — the
   enablement was lost in that churn. Nothing claimed QUEUED rows, and nothing
   logged, because a scheduler that is never started throws nothing.
2. **Stuck rows lock themselves in.** `isReusable` treats QUEUED/RUNNING as
   reusable *forever* (`OrderSearchService.java:319`), so every re-search of the
   same order hands back the same dead row; there is no QUEUED reaper (only a
   stale-RUNNING one); the SQL purge removes QUEUED rows only after 14 days; and
   after 5 stuck rows the user gets a permanent 429 (`MAX_IN_FLIGHT_PER_USER`).
3. **Auth double gate.** `SecurityConfig` now grants `/api/transaction/**` via
   `hasAuthority('PAGE_TRANSACTIONS')`, but the controller kept class-level
   `@PreAuthorize("hasRole('TRANSACTION')")`. ADMINs hold every *page* but not
   the TRANSACTION *role* → silent 403; the frontend swallows non-404 poll
   errors → infinite spinner.
4. **Orphaned data.** `order_search.requested_by` / `order_search_request`
   UUIDs point at the `lr_users` table that `V1__role_rehaul.sql` dropped and
   recreated — all pre-rehaul search history is unreachable garbage.

## 2. The interim fix and what it does NOT fix

`@EnableScheduling` (currently on `SecurityConfig`) restarts the motor. Two
immediate cautions:

- **Move it off `SecurityConfig`** — onto the `@SpringBootApplication` class or
  a dedicated tiny config class. Security config is exactly the file that gets
  rewritten during auth work; that placement is how it was lost the first time.
- Spring's default scheduler pool is **one thread**, shared by every
  `@Scheduled` job in the app. The drain loop competes with `requeueStale` and
  any future scheduled job; one slow job delays search pickup and vice versa.

Still broken / missing with only the interim fix, ranked:

| # | Problem | Consequence today |
| --- | --- | --- |
| 1 | Duplicate `commit_id` rows (§3) handled nowhere | A duplicate inside one order's lineage violates the `order_search_hit` PK → the search lands FAILED (documented open risk in the old README). Neighbor grids show both copies; the frontend's TEMPORARY dedupe keeps whichever comes first — possibly the negative/nonsense copy. |
| 2 | Auth double gate (§1.3) | ADMIN users get an endless spinner on the transaction pages. |
| 3 | History shows DONE only | Users lose sight of queued/running/failed searches — the explicit requirement this rehaul must satisfy. |
| 4 | No self-healing (§1.2) | The next stall (restart at the wrong moment, DB blip in the claim path, scheduler-thread contention) re-creates the stuck-forever + 429 lock-in, silently. |
| 5 | Error texts | Spring Boot's default error body omits the exception message (`server.error.include-message`), so the 429/400 explanations never reach the UI. |
| 6 | Date default | Frontend `tx_date` defaults to the **UTC** day (`toISOString().slice(0,10)`) — wrong between 00:00 and 03:00 TR time. |
| 7 | Requeue race | A stale-requeued search can be executed twice concurrently; the loser's `markFailed` can clobber the winner's DONE (unguarded status writes). |

Scope options discussed (decision deferred; recommendation was **A**):

- **A. Full rehaul** — everything below, including the self-driving engine (§5.1);
  `@EnableScheduling` becomes unnecessary for this feature.
- **B. Keep the `@Scheduled` worker** (relocated enablement) but apply §§5.2–5.8
  (dedupe, auth, all-status history, healing, guarded writes, errors, date fix).
- **C. Must-fix only** — items 1, 2, 5, 6. Does not meet the visibility
  requirement (item 3).

## 3. The duplicate commit_id rule (new requirement, user-clarified)

`commit_id` is normally unique, but duplicates occur — **always as a pair of
rows**. The pair differs in `me_net_input_time`, `me_net_output_time`,
`me_net_latency`, and rarely also `me_vrd_latency`. Selection rule, per
`commit_id`:

1. Prefer the row with **no negative latencies**. This decides the
   `me_vrd_latency` case: one of the pair is always negative there, and the
   positive one is the correct one.
2. When both rows are sensible (the common `me_net_latency` case — both values
   usually fall in the plausible interval), take the **smaller
   `me_net_latency`**.

As one SQL ordering (NULL is not penalized and sorts last):

```sql
ORDER BY p.commit_id,
         (CASE WHEN p.me_net_latency < 0 THEN 1 ELSE 0 END
        + CASE WHEN p.me_vrd_latency < 0 THEN 1 ELSE 0 END),
         p.me_net_latency ASC NULLS LAST
```

The rule applies to the **lineage snapshot AND both neighbor queries** (§5.4).
It also resolves the old README's "commit_id uniqueness" open question: the
duplicates are real production data, not a test artifact.

## 4. Design — what stays (deliberately)

- The **three-table model**, each with one job:
  `stat.order_search` = the *execution* (one physical search serves everyone:
  status, timestamps, result count — the queue row and the shared cache);
  `stat.order_search_request` = *who asked* (per-user history; two users share
  one execution and each still sees it in their own list);
  `stat.order_search_hit` = the *result rows* (me_pcap snapshot).
  Two-table alternatives were considered and rejected: merging history into the
  execution duplicates searches per user (loses instant cache hits), merging
  hits into a JSON blob loses typed columns and the PK duplicate guard.
- **DB-as-queue** with `FOR UPDATE SKIP LOCKED` claims — survives restarts,
  works across instances, needs no broker.
- **Async by design**: `POST /searches` returns immediately (row enqueued);
  the browser never blocks on me_pcap. The UI polls (1.5 s); users can navigate
  away, disconnect, or come back later — the search and its result wait in
  history. Typical completion is ~1–2 s (the `(order_id)` indexes).
- **Sync on-demand neighbors** straight from me_pcap (nothing persisted; window
  and per-side limits stay free), schema routing calendar-guessed and
  probe-confirmed (`public` today / `his` history, 410 when the raw day is
  purged), NOT_FOUND hint dates.
- **All 4 endpoints and DTO shapes, status strings, bigint-as-string JSON** —
  the frontend contract is frozen (`types/transaction.ts` header comment).
- **No new me_pcap indexes**: lineage → `(order_id)`; ME neighbors →
  `(tx_date, me_net_input_time)`; GW neighbors keep the me-time-bracketing
  trick (gw window ×1000 + 1 s slack bracketed on the me-time index).

## 5. Design — what changes

### 5.1 Self-contained worker engine (root-cause fix; scope A)

New `service/OrderSearchEngine.java`, replacing `OrderSearchWorker`:

- A **`SmartLifecycle`** component (starts after context refresh; stops before
  the datasource closes) owning its own `ExecutorService` — named daemon
  threads (`order-search-worker-0`), `transaction.search.worker-threads=1`
  default (preserves the "one ad-hoc me_pcap scan at a time" invariant;
  property-overridable).
- Loop **Throwable-proof around the whole iteration, including the claim** — a
  DB blip degrades to ERROR log + backoff (~5× poll-ms), never a dead thread.
  Idle sleep `poll-ms` (1 s). No `wake()` nudge: the UI polls at 1.5 s, so
  sub-second pickup buys nothing and the nudge adds concurrency surface.
- Worker thread 0 runs housekeeping on elapsed-time checks inside its loop:
  stale-RUNNING requeue (~60 s), the **QUEUED-age watchdog** (ERROR log when
  the oldest QUEUED exceeds `queued-alert-minutes` — the alarm for the exact
  historical failure), and the retention purge (daily; first run ~1 h after
  start): dead NOT_FOUND/FAILED > 6 h, everything > 14 d. Nobody has to CALL
  the purge procedure anymore.
- Startup INFO line: `order-search engine started: N worker(s), poll=Xms`
  (greppable presence check). Graceful `stop()`: signal, drain ~15 s,
  `shutdownNow()`.
- **No `@EnableScheduling`, `@EnableAsync`, or SecurityContext anywhere** in
  the feature. Keep the engine → `OrderSearchJobService` split (calls must go
  through the Spring proxy for `@Transactional`).

### 5.2 Queue-state transitions become guarded native SQL

New `repository/OrderSearchQueueRepository.java` (JdbcTemplate) owns every
state change:

- `claimNext()` — single statement (canonical Postgres claim; safe under READ
  COMMITTED; via `query()`, since Spring Data `@Modifying` cannot RETURNING):

  ```sql
  UPDATE stat.order_search
     SET status = 'RUNNING', started_at = now(), attempts = attempts + 1
   WHERE id = (SELECT id FROM stat.order_search
                WHERE status = 'QUEUED'
                ORDER BY id LIMIT 1
                FOR UPDATE SKIP LOCKED)
  RETURNING id
  ```

- Guarded terminal writes `markDone(id, count)` / `markNotFound(id, hints)` /
  `markFailed(id, error)` — all `WHERE id = ? AND status = 'RUNNING'`. Fixes §2
  item 7: if 0 rows update, log WARN and **skip writing hits** (check the guard
  result before `deleteBySearchId` + `saveAll`; all in one transaction).
- `requeueStale(cutoff, maxAttempts)` as **two single-statement UPDATEs**
  (fail `attempts >= 3` first, then requeue the rest) — race-free across
  instances, replacing the load-modify-save JPA loop.
- `failAbandoned(id)` — `WHERE id = ? AND status IN ('QUEUED','RUNNING')`, for
  §5.3's healing.
- The two purge DELETEs and `oldestQueuedCreatedAt()` for the watchdog.

Execution is bounded by a ~60 s query timeout on the me_pcap JdbcTemplate
(`transaction.search.query-timeout-s`), so "RUNNING older than 10 min" really
means dead — closing the requeue race window in practice.

### 5.3 Self-healing reuse policy (kill-then-replace)

In `createOrReuse`:

- If the latest active (QUEUED/RUNNING) row is older than
  `reuse-stale-minutes` (15) → `failAbandoned` it (error text: "abandoned: not
  picked up by any worker"); 1 row updated → insert fresh; 0 rows → a worker
  just took it, reuse it. **Never** just "decline to reuse" — the partial
  unique index `uq_order_search_active` would reject the fresh insert and the
  stuck row would win again.
- Threshold relation matters: `reuse-stale (15 min) > stale-RUNNING (10 min) +
  check interval (1 min)` — the user path never kills a row the reaper would
  still legitimately recover.
- Retry the whole create **once** on `DataIntegrityViolationException`
  (today's code 500s when the race winner already finished NOT_FOUND, because
  NOT_FOUND is not in the reusable re-read).
- The in-flight 429 cap counts **only fresh rows**
  (`created_at > now() - 15 min`) so stuck rows can never permanently lock a
  user out.
- Unchanged: DONE for past days reusable forever; DONE for today reusable for
  15 min; NOT_FOUND/FAILED never reused.

### 5.4 Dedupe placement in the queries

- **Lineage** (`findByOrderId`) — trivial row counts, dedupe directly:

  ```sql
  SELECT DISTINCT ON (p.commit_id) <cols>
    FROM {schema}.me_pcap p
   WHERE p.order_id = ? AND p.tx_date = ?
   ORDER BY p.commit_id, <§3 score>, p.me_net_latency ASC NULLS LAST
  ```

  (Deterministic pick; fixes the hit-PK collision → FAILED bug by
  construction.)
- **Neighbors (both scopes)** — do **NOT** put `DISTINCT ON` inside the
  per-side subqueries: it forces `ORDER BY commit_id, …`, which destroys the
  index-ordered early termination that makes the ME sides cheap at 100M
  rows/day. Keep the inner sides byte-identical (index-ordered scan + LIMIT)
  and dedupe the ≤ 2·N fetched rows in a wrapper:

  ```sql
  SELECT * FROM (
    SELECT DISTINCT ON (t.commit_id) t.*
      FROM ( (before side ... ORDER BY p.me_net_input_time DESC LIMIT ?)
             UNION ALL
             (after side  ... ORDER BY p.me_net_input_time ASC  LIMIT ?) ) t
     ORDER BY t.commit_id, <§3 score>, t.me_net_latency ASC NULLS LAST
  ) d
  ORDER BY d.me_net_input_time, d.commit_id   -- gw variant: d.gw_net_input_time
  ```

  - Exclude the reference commit on **both** sides (`AND p.commit_id <> ?`;
    today only the after side has it) — otherwise a before-side duplicate of
    the reference duplicates the snapshot row the service appends.
  - A pair straddling the reference lands one copy per side; the wrapper
    collapses them. Accepted edge: the preference applies among *fetched*
    copies only (a twin cut off by LIMIT/window is invisible) — fine, the rule
    permits arbitrary choice.
  - This is what makes removing the frontend's TEMPORARY dedupe safe.

### 5.5 Auth + error bodies on the RBAC model

- Controller class: `@PreAuthorize("hasAuthority('PAGE_TRANSACTIONS')")` —
  matches the `SecurityConfig` URL rule; ADMIN passes because the backend gives
  ADMIN every page at token build. **Never `hasRole('TRANSACTION')`** — that
  was the double-gate bug.
- Principal: `@AuthenticationPrincipal AuthPrincipal principal` +
  `principal.userId()` (the `lr_users` PK, carried in the token). No SpEL
  `expression = "userId"`.
- New `controller/TransactionExceptionHandler.java`:
  `@RestControllerAdvice(assignableTypes = TransactionSearchController.class)`
  with a **single** `ResponseStatusException` handler emitting the project's
  `{status, error, message, path}` shape (the RBAC `RbacExceptionHandler` is
  deliberately scoped to the auth/admin controllers). Without it, Boot's
  default error body drops the message and the 429/400 texts never reach the
  UI (`apiClient.toApiError` reads `message`).
- Naming, once and for all: **TRANSACTION** is the *role* users hold;
  **TRANSACTIONS** is the *page* it maps to in `lr_role_pages`;
  `PAGE_TRANSACTIONS` is the internal authority string for that page. Access
  for TRANSACTION-role users is unchanged; new roles ticked onto the page in
  the admin UI work with zero code change.

### 5.6 History shows everything (the visibility requirement)

`findHistory` drops `s.status = :status` from the outer WHERE **and** the
NOT EXISTS, in both the main and count queries (parameter removed). The
latest-execution-per-`(order_id, tx_date)` collapse stays and now applies
across statuses — if the latest attempt FAILED, the older DONE is hidden
(honest: "your latest attempt failed"; self-healing because FAILED is never
reused). Document visibly: NOT_FOUND/FAILED rows disappear from history when
the 6 h dead-search purge fires. `queue_position` (already in the DTO) is now
rendered.

### 5.7 Schema rebuild

`sql/V2__order_search_rebuild.sql` (new): drop + recreate the three
`stat.order_search*` tables with the current, sound structure — partial unique
`uq_order_search_active (order_id, tx_date) WHERE status IN
('QUEUED','RUNNING')`, the claim/active-scan index, history PK
`(search_id, requested_by)` + user index, hit PK `(search_id, commit_id)` —
minus the one-time backfill INSERT and the `me_asic_*` ALTER blocks. Old rows
are orphaned (§1.4); nothing is migrated. `requested_by` stays **FK-less** on
purpose: it must survive future user-table rebuilds. Recreate the 5-parameter
`stat.up_purge_latency_stats` verbatim (ops CALL compatibility; its
order-search DELETEs remain a harmless second belt — the engine owns retention
now). Run order: `latency_stats_pipeline.sql` → `V1__role_rehaul.sql` → this.
The repo-root `order_search.sql` is then superseded and should be deleted.

### 5.8 Frontend

- `pages/TransactionSearchPage.tsx`:
  - `tx_date` default → `getLocalDateKey()` from `services/utilService.ts`
    (the existing `getDefaultToDate()` is UTC — off by one 00:00–03:00 TR).
  - **Status chip column** in the history grid (reuse the detail page's
    `STATUS_CHIP` mapping); QUEUED rows show `Queued #<queue_position>`;
    grid sort field `status` is already in `HISTORY_SORT_FIELDS`.
  - Silent history poll (~1.5 s) while any visible row is QUEUED/RUNNING;
    silent refresh right after a submit so the new row appears immediately.
  - The pending-poll catch stops on **401/403** too (today only 404 — the
    infinite-spinner path).
  - Alert copy: NOT_FOUND/FAILED now appear in history (kept a few hours),
    not "not saved".
- `pages/TransactionDetailPage.tsx`: delete the TEMPORARY client-side
  neighbor dedupe (lines ~432–450) — backend now guarantees uniqueness; add a
  small error Alert for FAILED status ("use Search again").
- `services/transactionService.ts`, `types/transaction.ts`: **no changes**
  (contract frozen).

## 6. Implementation order

1. CREATE `sql/V2__order_search_rebuild.sql` (§5.7).
2. CREATE `repository/OrderSearchQueueRepository.java` (§5.2).
3. MODIFY `repository/MePcapQueryRepository.java` — §5.4 queries + query
   timeout (own JdbcTemplate settings, not the shared bean's).
4. MODIFY `repository/OrderSearchRepository.java` — drop `claimNextQueued`,
   `findByStatusAndStartedAtBefore`, dead `findByRequestedBy`; in-flight count
   becomes `countByRequestedByAndStatusInAndCreatedAtAfter`; keep
   publicId/latest/queue-position finders.
5. MODIFY `repository/OrderSearchRequestRepository.java` — status-free history
   (§5.6); `recordRequest` upsert unchanged.
6. REWRITE `service/OrderSearchJobService.java` — claim/execute via the queue
   repo, guarded terminals (guard before hit delete+insert, same transaction),
   `requeueStale` / `purge` / `checkQueueAge` wrappers with log lines.
7. CREATE `service/OrderSearchEngine.java`; DELETE `service/OrderSearchWorker.java` (§5.1).
8. MODIFY `service/OrderSearchService.java` — §5.3 reuse policy, status-free
   `getHistory`.
9. MODIFY `controller/TransactionSearchController.java` — §5.5 auth; import the
   real `PageResponse` (`../nested-backend-implementation/dto/PageResponse.java`).
10. CREATE `controller/TransactionExceptionHandler.java` (§5.5).
11. REWRITE `README.md` (engine, dedupe, all-status history; drop the
    `ILETISIM_KANALLARI` / `@EnableScheduling` relics).
12. FRONTEND: modify `TransactionSearchPage.tsx`, `TransactionDetailPage.tsx` (§5.8).
13. DELETE repo-root `order_search.sql` (superseded by step 1).
14. CREATE `verification/order_search_dedupe_check.sql` — temp-table fixture
    with synthetic duplicate pairs (negative-me_vrd case; both-sensible me_net
    case where the smaller must win) asserting the DISTINCT ON picks — same
    spirit as `verification/NormalizerCheck.java` for the normalizer.

Config keys (all defaulted, prefix `transaction.search.`): `worker-threads=1`,
`poll-ms=1000`, `stale-check-ms=60000`, `stale-running-minutes=10`,
`queued-alert-minutes=5`, `reuse-ttl-minutes=15`, `reuse-stale-minutes=15`,
`query-timeout-s=60`, `purge-keep-days=14`, `purge-keep-hours-dead=6`.

## 7. Verification (snippet repo, no build)

- **Contract diffs**: `OrderSearchResponse` ↔ `OrderSearchItem`;
  `OrderPcapResponse` ↔ `OrderPcapItem` (27 columns; ids + `*_time` as JSON
  strings, latencies numeric); `NeighborResponse` ↔ `OrderNeighbors`; status
  enum ↔ union type; grid sort fields ⊆ `HISTORY_SORT_FIELDS`.
- **Grep gates**: no `@Scheduled|@EnableScheduling|@Async|SecurityContextHolder`
  under `transaction-backend-implementation/`; no `hasRole('TRANSACTION')`; no
  `expression = "userId"`; frontend: no `getDefaultToDate` in the search page,
  no dedupe `seen` loop in the detail page.
- **SQL review**: every `DISTINCT ON`'s ORDER BY leads with `commit_id`; both
  neighbor sides carry `commit_id <> ?`; placeholder order recounted after
  edits; all state transitions single-statement and guarded.

## 8. Porting checklist + smoke tests (real project)

1. Package rename `com.bistech.reporting` → the project's actual root; swap the
   snippet `PageResponse` for the project's real class.
2. SQL run order: `latency_stats_pipeline.sql` → `V1__role_rehaul.sql` →
   `V2__order_search_rebuild.sql` (destroys old order-search rows — accepted,
   they are orphaned).
3. Properties (§6); confirm nothing in this feature needs `@EnableScheduling`
   anymore; delete the old `OrderSearchWorker` in the real project. If the
   interim `@EnableScheduling` is still on `SecurityConfig`, remove it (or
   relocate it if other features started relying on it).
4. Boot check: log contains `order-search engine started`; during operation
   `SELECT count(*) FROM stat.order_search WHERE status='QUEUED' AND
   created_at < now() - interval '5 min'` stays 0.
5. Smoke:
   - Find a real duplicate: `SELECT commit_id FROM public.me_pcap WHERE
     tx_date = current_date GROUP BY commit_id HAVING count(*) > 1 LIMIT 5;`
     note an `order_id`; search it; assert exactly one row per commit_id, kept
     copies non-negative, smaller `me_net_latency` when both sensible.
   - Re-POST within 15 min → same `public_id` (reuse); after TTL → new id.
   - History lists all statuses; a nonexistent order → NOT_FOUND row with
     `hint_dates`, disappears after the dead purge.
   - Neighbors `scope=me` and `scope=gw` near the duplicate: unique commit_ids,
     reference row present exactly once.
   - Force-stale a row (`UPDATE ... SET status='RUNNING',
     started_at = now() - interval '30 min', attempts = 3`) → FAILED with the
     abandonment text within ~60 s.
   - Manual `CALL stat.up_purge_latency_stats();` still succeeds.
   - **ADMIN token gets 200** on `/api/transaction/searches` (the historical
     403 regression).
   - Kill the app mid-RUNNING → restart → row requeued ≤ 60 s after the 10-min
     staleness.

## 9. Decisions log

| Decision | Call |
| --- | --- |
| Queue architecture | keep DB-as-queue + 3 tables (execution / per-user request / hits) — sharing + cache + typed rows; 2-table variants rejected |
| Worker driver | feature-owned engine (SmartLifecycle + own executor), 1 thread default; no Spring scheduling dependency |
| wake() nudge | rejected — 1 s poll beats the UI's 1.5 s poll already |
| Stuck rows | kill-then-replace on submit (15 min), guarded transitions, watchdog ERROR at 5 min, fresh-only 429 cap |
| Duplicate commit_id | pairs; prefer non-negative, then smaller `me_net_latency`; SQL `DISTINCT ON`, wrapper placement for neighbors |
| Endpoint gate | page authority `PAGE_TRANSACTIONS` (never the role name) + scoped advice for error bodies |
| History | all statuses, latest-per-(order,date) collapse, queue position rendered |
| me_pcap | untouched — no new indexes |
| Old queue data | dropped, not migrated (orphaned by the RBAC user-table rebuild) |
| Retention | engine-owned purge; 5-param procedure kept verbatim for ops compatibility |
