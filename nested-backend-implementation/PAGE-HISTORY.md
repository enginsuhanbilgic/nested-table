# Page Visit Analytics

The `/analytics/page` route now serves `PageTrackingPage.tsx`. The implementation
adds a read-only analytics experience over the existing visit records. The SQL
table, `UserPageHistory` model, logging request, controller logging method,
service logging method, frontend logging function, and `PageTracker` behavior
are unchanged. No migration or index changes are included.

## Page behavior

- Last seven calendar days by default, including today, in Europe/Istanbul.
- Date range, searchable user, current-role multi-select (any matching role),
  and exact-page filters. Advanced filters provide literal contains searches
  for path, title, referrer, and user agent.
- Apply commits pending filters; Reset restores defaults; chips remove applied
  filters. Refresh reloads the currently applied filters.
- Cards show recorded visits, distinct user IDs, distinct paths, and visits per
  user over the full filtered result, independently of table pagination.
- Daily visits and unique users, with zero-filled days. Select a chart point or
  a date to inspect all 24 hours in Istanbul time.
- Top ten pages, with visits, unique users, and share in tooltips. Chart and
  table clicks select an exact path; user clicks select the user UUID.
- Pages, Users, and Visit history tables use server sorting and pagination.
  History starts newest-first, with ID as the timestamp tie-breaker. Row details
  show the full referrer and user agent as text.
- Separate overview, hourly, and table loading/error states. Requests are aborted
  when superseded; responses cannot appear under another filter's labels.

The optional heatmap and referrer-breakdown panels remain follow-up work.

## Meaning of the data

One stored row is one recorded authenticated pathname visit under the existing
tracker's semantics. This is not a session, an active user connection, or a
measure of time spent. Unique users are counted by UUID, never by username.
Daily distinct counts are not summed to produce period-level distinct users.
Roles and usernames come from current user data, not a historical snapshot.
Role matches use EXISTS over `lr_user_roles` and `lr_roles`, so multiple roles
or grant sources cannot multiply visits.

Paths are the page grouping key. Dynamic detail paths stay separate even when
their titles match. Aggregated page titles are a representative non-null stored
title (`max(page_title)`); visit history retains each row's original title.
"Last visit" means the last matching visit within the selected period.
Empty referrers display as "Unknown / direct".

## API

Every read method on `AnalyticsController` has:

```java
@PreAuthorize("hasAnyRole('ADMIN', 'ANALYTICS')")
```

There is no controller-level annotation, so logging retains its authenticated-user
access. `SecurityConfig` is unchanged: its existing `PAGE_ANALYTICS` matcher still
applies in addition to method authorization. Users need the configured analytics
page authority and an ADMIN or ANALYTICS role. The frontend keeps its existing
`RequirePage` gate.

All paths below are relative to `/api/audit/pagehistory`:

| GET endpoint | Response | Extra parameters |
|---|---|---|
| `/get` | `PageResponse<UserPageHistoryResponse>` | `page`, `size`, `sort` |
| `/summary` | `Summary` | — |
| `/activity` | `Activity[]` | Optional `day=YYYY-MM-DD` for hourly buckets |
| `/pages` | `PageResponse<PageItem>` | `page`, `size`, `sort` |
| `/users` | `PageResponse<UserItem>` | `page`, `size`, `sort` |
| `/filter-options` | `{id,label}[]` | `kind=users|roles|pages`, optional `search` |

Shared filters: `from`, `to`, `userId` (UUID), repeated `roleCodeIn`,
`pagePathExact`, `pagePath`, `pageTitle`, `referrer`, `userAgent`.
The frontend uses repeated parameters (`roleCodeIn=ADMIN&roleCodeIn=ANALYTICS`),
not bracketed array names. `%`, `_`, and `!` in text searches are escaped as
literal characters, and all values are bound parameters.

`from` and `to` are inclusive calendar dates. Queries use start-of-day Istanbul
through the exclusive start of the day after `to`, with offset-aware parameters.
Missing `to` defaults to today; missing `from` defaults to six days before `to`.
Reversed ranges and ranges over 366 days return HTTP 400. Hourly days must lie
inside the requested range.

Paging is zero-based, defaults to 25 rows, and permits 1–100 rows per page.
Sort accepts exactly `field,asc` or `field,desc`, with an allowlist:

- History: `visitTimestamp`, `username`, `pagePath`.
- Pages: `visits`, `uniqueUsers`, `pagePath`, `lastVisit`.
- Users: `visits`, `uniquePages`, `username`, `lastVisit`.

Aggregate queries operate before pagination; share is the percentage of all
filtered visits, not just the returned top ten or table page. Paged service
methods use repeatable-read transactions to keep counts and rows consistent
within a request. Independent dashboard requests can see newer arrivals between
requests. Filter choices are capped at 50 and are searchable; the UI removes
the relevant control's own filter while fetching its choices.

## Integration notes

`PageHistoryReadRepository` uses `NamedParameterJdbcTemplate` for PostgreSQL
grouping, window aggregates, and shared predicates. `UserPageHistorySpecs` is
now a parameterized SQL predicate builder, replacing the obsolete JPA predicates.
`UserPageHistoryRepository` continues to handle logging through JPA. Make sure
Spring JDBC is available and the configured datasource is shared with JPA so
Spring's transaction manager can bind the read connections.

The queries target the supplied current user tables: `stat.lr_users`,
`stat.lr_user_roles`, and `stat.lr_roles`, plus `stat.user_page_history`.
They expect `visit_timestamp` to be PostgreSQL `timestamp with time zone`,
representing the model's `Instant`. Verify that type against the deployed table:
the table DDL was not supplied. If the existing column is instead a UTC
`timestamp without time zone`, adapt the read-side time conversion and parameter
binding to that convention; do not migrate the table for this feature.

This workspace contains reference snippets, not a complete backend build.
The unchanged `UserPageHistory.java` snippet omits its package and `User` import;
its existing response DTO expects `com.bistech.reporting.model.audit.UserPageHistory`.
The original logging method also uses a `ResourceNotFoundException` absent from
the workspace. Keep the real project's entity and exception when integrating;
adjust imports if their packages differ. The new filter DTO is self-contained
and no longer depends on the missing shared `DateFilter` or `FilterUtil`.

`App.tsx` already registered the analytics route. Its page imports and tracker
import were corrected to the supplied file locations; tracking logic was not
edited. Existing shared MUI components, theme, and sidebar chart-resize hook are
reused.

## Verification

From the workspace root:

```text
node nested-backend-implementation/verification/page-history-check.mjs
python nested-backend-implementation/verification/check-page-history-java.py
```

The frontend check type-checks the changed files and tests Istanbul midnight,
year boundaries, date validation, UUID and repeated-role serialization, and
timestamp display. The workspace has existing/missing-dependency diagnostics
outside these files; the focused check reports their count separately and is
not a replacement for building the integrated frontend.

The Java runner uses cached Maven dependencies without downloading anything.
It compiles the changed backend and supplies isolated fixture adapters for the
pre-existing omitted entity package/import and exception. It checks date
boundaries, filter normalization, literal search escaping, and read-endpoint
annotations. The fixture files are written beneath `node_modules/.tmp` and do
not alter the model. Annotation checks do not replace Spring Security HTTP tests.

For actual PostgreSQL regression checks, set `PAGE_HISTORY_TEST_JDBC_URL`,
`PAGE_HISTORY_TEST_USER`, and `PAGE_HISTORY_TEST_PASSWORD` for a dedicated empty
test database, then run the Java runner with `--database`. This is opt-in and
has not been run here. It intentionally fails if a `stat` schema already exists
and rolls back its fixture DDL/data. It checks end-date boundaries, multi-role
deduplication, aggregate shares before pagination, hourly zero-filling, filter
options, literal searches, and sort rejection against the actual repository.

Before deployment, run the integrated application build, HTTP authorization
tests (ADMIN, ANALYTICS, unrelated role, anonymous, and authenticated logging),
and PostgreSQL regression checks. Review query plans on representative volumes;
no index changes are included in this implementation.
