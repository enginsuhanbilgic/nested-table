# Nested Latency Explorer — backend implementation

Spring Boot implementation of the `/api/latency/nested/*` endpoints that back
`NestedLatencyPage.tsx`. Package layout follows the existing project
(`com.bistech.reporting.{model,dto,repository}.latency`, `...service`,
`...controller`), and the code style mirrors the `UserLatency` domain
(`UserLatencySpecs`, `UserLatencyService`, `UserLatencyRepository`).

## What is the deliverable vs. reference

**The ask (new code):**

| File | What it is |
|---|---|
| `repository/GroupedLatencySpecs.java` | All Specifications. Every nested-grid entity shares the same Java property names for the common measures, so the specs are generic over the entity type instead of being duplicated nine times: `dateEquals`, `minOrdersAtLeast`, `metricThreshold`, `queryStringContainsAny`, `attributeEquals`. |
| `service/GroupedLatencyService.java` | All ten service methods the common controller calls: the six paged daily grids, series-minute chart, series daily history, freshness, baseline. |

**Reference (you said these are already ready on your backend):** the files
under `model/`, `dto/`, and `repository/*Repository.java` are reconstructions
built from the `stat.v_*` views in `latency_stats_pipeline.sql` and the
frontend contracts in `types/latency.ts` / `latencyService.ts`, so this
snippet is self-consistent and compilable. **Diff them against your real
classes and keep yours** — if a class, field, or repository name differs, the
only edits needed are in the imports/identifiers of the two files above.

## ⚠ Two controller fixes are required

The transcribed controller cannot serve the frontend as-is
(`controller/LatencyGeneralStatsController.java` here contains the corrected
version):

1. **Path**: the minute endpoint must be `GET /nested/series-minute` — the
   frontend calls `/latency/nested/series-minute`; the transcription had
   `/nested/minute`.
2. **`PageResponse.of(...)` wrappers** around `getSeriesHistoryStats`,
   `getMinuteStats`, `getFreshnessStats`, `getBaselineStats` must be removed —
   those services return `List`/single DTOs, and the wrapper does not compile
   against the declared return types (likely a screenshot-transcription
   artifact).

## Endpoint ↔ frontend mapping

| Endpoint | Frontend call | Returns |
|---|---|---|
| `GET /nested/gateways` | `getNestedGatewayNodes` | `PageResponse<GatewayDailyResponse>` |
| `GET /nested/gateway-instances` | `getNestedGatewayInstances` (`gatewayName`) | `PageResponse<InstanceDailyResponse>` |
| `GET /nested/instance-users` | `getNestedInstanceUsers` (`gatewayName`, `instanceName`) | `PageResponse<UserDailyResponse>` |
| `GET /nested/participants` | `getNestedParticipants` | `PageResponse<ParticipantDailyResponse>` |
| `GET /nested/participant-users` | `getNestedParticipantUsers` (`participantName`) | `PageResponse<UserDailyResponse>` |
| `GET /nested/series` | `getNestedSeriesLeaderboard` | `PageResponse<SeriesDailyResponse>` |
| `GET /nested/series-minute` | `getNestedLatencySeries` (`entityType`, `name`, lineage) | `List<MinuteResponse>` ordered by hour, minute |
| `GET /nested/series-history` | `getNestedLatencyDailyHistory` (`name`, `days`) | `List<SeriesHistoryResponse>` ordered by date |
| `GET /nested/freshness` | `getDataFreshness` | `DataFreshnessResponse` (null body if no watermark yet) |
| `GET /nested/baseline` | `getExchangeBaseline` (`date`) | `BaselineResponse` |

All grid endpoints accept the common query params
(`date`, `minOrders`, `thresholdMetric`, `thresholdOp`, `thresholdValue`,
`queryString`, `page`, `size`, `sort=field,dir`). Response DTOs pin the
snake_case JSON keys the frontend types expect via `@JsonProperty`
(`num_orders`, `me_med`, `gw_p99`, ...).

## Design decisions worth knowing

- **Sort remapping** (`GroupedLatencyService.remapSort`): the grids send their
  column field names (`me_med`, `num_orders`, `participant_name`, ...), which
  are remapped to entity properties before hitting Spring Data. Both hierarchy
  grids share one sort model across all levels, so a field that does not exist
  on the entity being paged (e.g. sorting the gateway grid by `participant_name`
  — a users-only column — while fetching gateway roots) is *dropped*, not
  failed. A `name asc` tiebreaker is always appended so infinite-scroll pages
  stay stable when the primary sort has ties. Null handling is left at the
  database default: Spring Data JPA rejects explicit `nullsFirst`/`nullsLast`
  on Criteria (Specification) queries with an `UnsupportedOperationException`.
  On Postgres that means a DESC metric sort lists NULL-metric rows first; in
  practice the default `minOrders` filter removes most such rows, and if it
  ever matters the ordering can be done inside the Specification via
  Hibernate's native criteria API.
- **Threshold filter**: `metricThreshold` maps the frontend metric key to the
  entity property and applies `> >= < <=`. Unknown metrics/operators are
  logged and ignored rather than 500-ing; rows whose metric is NULL never
  match (SQL semantics).
- **Required parent keys** (`gatewayName`, `instanceName`, `participantName`):
  a missing key returns an empty page / matches nothing
  (`attributeEquals` uses `disjunction()` for blanks) — never the whole table.
- **`series-minute`**: `entityType` routes to the right `v_*_minute` view
  (`gateway`/`participant`/`user` are keyed by `name` alone, `instance` by
  `gatewayName` + `name`). `entityType=series` returns an empty list — the
  pipeline intentionally has no minute grain for series (the series view mode
  charts daily history instead). The frontend also sends `minOrders`/threshold
  params here; they are deliberately ignored so charts aren't hole-punched.
- **Baseline**: served from `stat.v_baseline_stat` via
  `BaselineRepository.findByDate(date)`. The view takes the **median of the
  per-user daily values** (`me_p50` / `me_p99` / `gw_p50` / `gw_p99` over
  `grp_type = 'user'` rows) — a typical user's typical latency, robust to
  outliers. A date with no baseline row still answers 200 with the date and
  null metrics; the frontend then falls back to its absolute colour
  thresholds.
- **Freshness**: served from `stat.v_latency_load_watermark` via
  `DataFreshnessRepository.findTopByOrderByUpdatedAtDesc()`. The view already
  reduces the watermark table to a single row (latest trading day, max
  `updated_at`), so the derived query is just an explicit restatement of that
  contract.
- **`SeriesDailyResponse.peak_ratio`** is derived in the service —
  `stat.v_series_daily` exposes the two counts but not the ratio.
- **Minute `me_min`/`gw_min` are always null**: the `v_*_minute` views don't
  select them, although `stat.latency_minute_stat` has the columns. If you
  want the frontend's "ME Min"/"GW Min" chart metrics to work on minute
  charts, extend the views, e.g.:

  ```sql
  CREATE OR REPLACE VIEW stat.v_gateway_minute AS
  SELECT row_number() OVER () AS id,
         tx_date, node AS name,
         extract(hour   FROM bucket_ts)::int AS hour,
         extract(minute FROM bucket_ts)::int AS minute,
         me_p50 AS me_med, me_avg, me_max, me_min,
         gw_p50 AS gw_med, gw_avg, gw_max, gw_min,
         me_p99, gw_p99, no_ord
    FROM stat.latency_minute_stat
   WHERE grp_type = 'node';
  -- same for v_instance_minute / v_participant_minute / v_user_minute
  ```

  then add the two columns to the `*Minute` entities and pass them through in
  `GroupedLatencyService.minuteResponse`.

## Wiring checklist

- Entities use the views' synthetic `row_number() OVER () AS id` column as a
  plain `@Id Long id`, matching the `view_user_latency` pattern. Two caveats
  come with that id:
  - It is **query-scoped**, not a stable identifier — the same logical row
    can get a different id on the next query. Fine for these read-only
    grids; don't cache or cross-reference entities by id.
  - A window function in a view **blocks predicate pushdown** in Postgres:
    every query materializes the whole view (all rows of that `grp_type`)
    before the `WHERE tx_date = ...` filter applies, so the base-table
    indexes can't prune. Daily views are small enough; watch
    `v_user_minute` (users × minutes × retention days). If it gets slow,
    derive the id deterministically from the key columns (e.g. a 64-bit
    md5 slice) or drop it and use `@IdClass` composite keys — either lets
    the planner push `tx_date`/`name` filters down.
- `UserDaily.ports` (Postgres `integer[]`) needs Hibernate 6.1+
  (`@JdbcTypeCode(SqlTypes.ARRAY)`).
- `Specification.unrestricted()` needs Spring Data JPA 3.5+ (already used by
  `UserLatencyService`); on older versions substitute `Specification.where(null)`.
- Filter records bind from query params like `UserLatencyFilterRequest`
  does (constructor binding; the `-parameters` compiler flag must be on, which
  it evidently already is).
- `LocalDate` query params (`date`) parse ISO `yyyy-MM-dd`, matching what the
  frontend sends.
