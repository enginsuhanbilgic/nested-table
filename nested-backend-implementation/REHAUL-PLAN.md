# Auth & role system rehaul — plan (v3)

**Status: IMPLEMENTED in this snippet (2026-08-14).** Backend under
`nested-backend-implementation/` (SQL in `sql/`, normalizer verified by
`verification/NormalizerCheck.java` — run it after any normalizer change),
frontend under `original-project-snippet/src/`. Port into the real project
per §13; the change inventory is in the session summary / git status.

Decisions locked: roles+pages live in the access token (no per-request DB
read); CN rules and roles get admin API + UI; audit table is in; fixed 7-day
sessions with 15-minute access tokens; roles are `STANDARD_USER`, `ADMIN`,
`TRANSACTION`, `ANALYTICS` (no `ILETISIM_KANALLARI`); ADMIN sees every page;
page visibility per role is DB data (`lr_role_pages`); **all auth tables are
dropped and recreated** — no data migration.

Where this plan disagrees with the earlier documents
([ROLE-MANAGEMENT-ANALYSIS.md](ROLE-MANAGEMENT-ANALYSIS.md) §6 and
[SECURITY-CHANGES.md](SECURITY-CHANGES.md)), **this plan wins**. It keeps
their verified findings (Turkish İ/i normalization, fail-closed LDAP, CAPTCHA
ordering, lockout guards). The "permissions layer" those docs debated exists
here in exactly one small form: **pages are the only permission**.

---

## 1. Roles vs pages — the mental model

Two separate lists, connected by one mapping table:

- **Roles** are things a *user* has: `STANDARD_USER`, `ADMIN`, `TRANSACTION`,
  `ANALYTICS`, and whatever admins create later. Users get them from CN rules
  (automatic) or from an admin (manual).
- **Pages** are things the *frontend* has. Each shipped page has a fixed code
  in code (a page only exists when a release ships it): `LATENCY_DAILY`,
  `LATENCY_RTT`, `LATENCY_GROUPED`, `TRANSACTIONS`, `ANALYTICS`.
- **`lr_role_pages`** connects them: *"role X may see page Y."* This is DB
  data, editable from the admin UI — changing who sees what never needs a
  redeploy, and reaches users within 15 minutes.

A user sees a page if **any of their active roles maps to it** — and ADMIN
sees every page unconditionally (computed, not stored — §4.6).

Visibility as seeded (every cell editable at runtime except the ADMIN column
and the admin-page row):

| Page | STANDARD_USER (= everyone) | TRANSACTION | ANALYTICS | ADMIN |
| --- | :-: | :-: | :-: | :-: |
| Daily / RTT / Grouped latency | ✔ | – | – | ✔ (always) |
| Transaction search + detail | – | ✔ | – | ✔ (always) |
| Page analytics | – | – | ✔ | ✔ (always) |
| Admin page | – | – | – | ✔ (fixed in code, never editable — admins can't lock admins out) |

"Not every page needs its own role" falls out naturally: the latency pages
are mapped to `STANDARD_USER`, which every authenticated user gets
automatically — so they are effectively open to everyone, while remaining
restrictable later from the UI if that ever changes.

Only `ADMIN` and `STANDARD_USER` are referenced in Java (`RoleCodes`).
`TRANSACTION` and `ANALYTICS` are pure data — **creating role #5 later
touches zero code**: create it in the UI, tick its pages, add a CN rule or
grant it manually.

---

## 2. The token model, in plain words

Today there is **one** JWT that lives ~1 week; everything in it is frozen for
a week. The rehaul replaces it with two tokens:

- **Access token — the "day pass".** A JWT that lives **15 minutes**. It says
  who you are, your roles, and the pages you may see. Sent with every API
  call; the server trusts it as-is — no database lookup per request.
- **Refresh token — the "membership card".** A long random secret that lives
  **7 days**. Not a JWT; carries no information. We store its SHA-256 hash in
  a DB table. Its only use is `POST /refresh`, which checks it and hands out
  a fresh day pass.

```
login (password + captcha, at most once a week)
   └─> access token (15 min) + refresh token (7 days)

every ~15 min, silently, no password:
   POST /api/auth/refresh { refreshToken }
   └─> roles AND pages are RE-READ FROM THE DB here
   └─> new access token + new refresh token (old one invalidated = "rotation")
```

| Change | Reaches the user in |
| --- | --- |
| Manual grant / revoke | ≤ 15 min |
| CN rule added / edited / deleted | ≤ 15 min (re-evaluated at refresh, §4.3) |
| Role deactivated / reactivated | ≤ 15 min |
| Role↔page mapping edited | ≤ 15 min |
| User's actual LDAP groups changed | their next real login (LDAP only tells us `memberOf` at login) |

Rotation: each refresh deletes the old refresh-token row and inserts a new
one, so a stolen old token dies as soon as the real user refreshes. Logout
deletes the row. Hashes only — a DB leak leaks nothing usable.

Session length is **fixed**: the refresh token expires 7 days after login
regardless of activity (password at most weekly, like today).

---

## 3. Database — dropped and recreated

`sql/V1__role_rehaul.sql` **drops** `stat.user_member_of`,
`stat.lr_user_roles`, `stat.lr_users`, `stat.lr_roles` (and any earlier
variants) and creates everything fresh — per your call that nothing in them
matters yet. Users repopulate themselves at next login. No duplicate checks,
no row migration, constraints present from day one.

### 3.1 `stat.lr_users` — as today, plus `UNIQUE (username)`

Same columns as `rbac.sql` (`id`, `username`, `employee_id` unique,
`full_name`, `organization`, `email`, `last_logged_in`) with the added
username unique constraint. The `stat.user_member_of` collection table stays:
refresh-time rule evaluation reads it (§4.3) and it shows an admin *why*
someone has a role.

### 3.2 `stat.lr_roles` — as today; lifecycle guarded in code

Columns unchanged: `code`, `display_name`, `description`, `active`,
`sync_assignable`, `manual_assignable`.

Seeds:

| code | active | sync_assignable | manual_assignable | note |
| --- | :-: | :-: | :-: | --- |
| `STANDARD_USER` | ✔ | ✔ (granted to every login) | – | system role |
| `ADMIN` | ✔ | **never** | ✔ | system role; no CN rule can target it |
| `TRANSACTION` | ✔ | ✔ | ✔ | gates the transaction pages |
| `ANALYTICS` | ✔ | ✔ | ✔ | gates the analytics page; no CN rule for now |

Lifecycle rules (enforced in `RoleAdminService`; surfaced as `system: true`
so the UI locks the buttons):

| Operation | Rule |
| --- | --- |
| Create | Allowed. Code fixed at creation (`[A-Z][A-Z0-9_]{1,49}`). A new role starts with no holders, no rules, no pages — creating one can never grant anything by itself. |
| Rename | `display_name`/`description` freely editable. **`code` is immutable** — it lives in issued tokens, audit rows, page config and security checks; renaming breaks references silently. New code = create new role, migrate grants, delete old. |
| Deactivate / reactivate | Allowed; **the everyday off-switch.** Effective ≤ 15 min. Assignments, rules and page mappings are kept, so reactivating restores the exact previous state. |
| Delete | Only when **no user holds it** (any source) — else 409 "deactivate instead, or revoke the holders first". Its CN rules and page rows cascade away; audit history survives (codes stored as text). |
| System roles | `ADMIN` and `STANDARD_USER` cannot be deactivated or deleted; `ADMIN` can never be made `sync_assignable`. |

### 3.3 `stat.lr_user_roles` — one row per (user, role, source)

Replaces the two-boolean design (where the bloat and the HashSet bug lived):

```sql
CREATE TABLE stat.lr_user_roles (
    id          bigint      GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id     uuid        NOT NULL REFERENCES stat.lr_users(id) ON DELETE CASCADE,
    role_id     bigint      NOT NULL REFERENCES stat.lr_roles(id) ON DELETE RESTRICT,
    source      varchar(10) NOT NULL CHECK (source IN ('SYNC','MANUAL')),
    granted_at  timestamptz NOT NULL DEFAULT now(),
    granted_by  varchar(255),          -- NULL for SYNC, admin username for MANUAL
    CONSTRAINT uk_lr_user_roles UNIQUE (user_id, role_id, source),
    CONSTRAINT ck_lr_user_roles_granted_by CHECK (
        (source = 'MANUAL' AND granted_by IS NOT NULL) OR
        (source = 'SYNC'   AND granted_by IS NULL)
    )
);
CREATE INDEX ix_lr_user_roles_role ON stat.lr_user_roles (role_id);
```

- **Sync only touches `SYNC` rows; admins only touch `MANUAL` rows.** "A
  manual grant survives leaving the LDAP group, and vice versa" is guaranteed
  by structure — no code can get it wrong.
- Sync = diff SYNC rows against the computed set. Grant = insert one row.
  Revoke = delete one row. All four role-juggling methods on `User`, both
  `UserRole` factories and the mutable embedded id disappear.
- Effective roles = `SELECT DISTINCT` active roles across both sources.
- `ON DELETE RESTRICT` on `role_id` is the database half of "no deleting held
  roles".

### 3.4 `stat.lr_role_cn_rules` — automatic granting, as data

```sql
CREATE TABLE stat.lr_role_cn_rules (
    id          bigint       GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    role_id     bigint       NOT NULL REFERENCES stat.lr_roles(id) ON DELETE CASCADE,
    cn_value    varchar(512) NOT NULL,  -- exactly as the admin typed it (display only)
    cn_key      varchar(512) NOT NULL,  -- normalized; THE ONLY FIELD EVER COMPARED
    match_mode  varchar(10)  NOT NULL DEFAULT 'EXACT' CHECK (match_mode IN ('EXACT','CONTAINS')),
    active      boolean      NOT NULL DEFAULT true,
    description varchar(500),
    updated_by  varchar(255) NOT NULL,
    updated_at  timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT uk_lr_role_cn_rules UNIQUE (role_id, cn_key, match_mode)
);
```

*"If one of the user's LDAP groups has this CN, grant this role."* Rules are
config, not history: create / edit / deactivate / delete freely, every change
audited. Creation and edit reject roles that are not `sync_assignable` — the
guard that keeps ADMIN out of LDAP's reach.

**Seed: `İletişim Kanalları Servisi` → `TRANSACTION` (EXACT).** No rule for
`ANALYTICS`.

Two columns for one value because of the **Turkish İ problem** (verified in
SECURITY-CHANGES §5.3): Java, Postgres and human typing each case-fold
`İ/i/ı/I` differently, so naive comparison makes rules silently never match.
`LdapNameNormalizer` folds all four i-variants to `i`, lowercases the rest
with `Locale.ROOT`, trims and collapses whitespace. The admin's original text
is stored for display; only the normalized key is compared; **never** compare
with SQL `lower()`. `EXACT` is the default mode; `CONTAINS` is per-rule
opt-in (today's code does `contains` for everything — a rule on "Servisi"
would match every department).

### 3.5 `stat.lr_role_pages` — page visibility (§1)

```sql
CREATE TABLE stat.lr_role_pages (
    role_id   bigint      NOT NULL REFERENCES stat.lr_roles(id) ON DELETE CASCADE,
    page_code varchar(50) NOT NULL,
    PRIMARY KEY (role_id, page_code)
);
```

Page codes are constants in `PageCodes.java`; writes validate against them
(400 on unknown). Seeds per the §1 matrix: `STANDARD_USER` → the three
latency codes, `TRANSACTION` → `TRANSACTIONS`, `ANALYTICS` → `ANALYTICS`.

Backend enforcement per page:

| Code | Frontend route | Backend APIs |
| --- | --- | --- |
| `LATENCY_DAILY` | `/latency/daily` | `/latency/getLatencyDaily*`, `getLatencyMinuteStats` |
| `LATENCY_RTT` | `/latency/rtt` | `/latency/getRttRangeStats`, `/latency/types/rtt/*` |
| `LATENCY_GROUPED` | `/latency/grouped` | `/latency/nested/**` |
| `TRANSACTIONS` | `/transactions`, `/transactions/:id` | `/transaction/**` |
| `ANALYTICS` | `/analytics/page` | `GET /audit/pagehistory/**` **reads only** — `POST /audit/pagehistory/log` stays authenticated-only because every user's browser writes it |
| *(none)* | `/admin` | `/api/admin/**` — always the ADMIN **role**, in code |

Shared helper endpoints (`/latency/types/*` filters) accept *any* latency
page authority.

### 3.6 `stat.lr_refresh_tokens`

```sql
CREATE TABLE stat.lr_refresh_tokens (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid        NOT NULL REFERENCES stat.lr_users(id) ON DELETE CASCADE,
    token_hash varchar(64) NOT NULL UNIQUE,   -- SHA-256 hex of the token
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL
);
CREATE INDEX ix_lr_refresh_tokens_user ON stat.lr_refresh_tokens (user_id);
```

One row per active session (two browsers = two rows). Expired rows for a
user are deleted opportunistically on their next refresh — no scheduler.

### 3.7 `stat.lr_role_audit` — append-only history

```sql
CREATE TABLE stat.lr_role_audit (
    id          bigint       GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    happened_at timestamptz  NOT NULL DEFAULT now(),
    action      varchar(20)  NOT NULL,
    actor       varchar(255) NOT NULL,  -- who did it
    username    varchar(255),           -- affected user (text — survives deletion)
    role_code   varchar(100),
    detail      varchar(500)            -- e.g. field diff, page codes changed
);
```

Actions: `GRANT`, `REVOKE`, `ROLE_CREATE`, `ROLE_UPDATE` (incl.
activate/deactivate and page-mapping changes in `detail`), `ROLE_DELETE`,
`RULE_CREATE`, `RULE_UPDATE`, `RULE_DELETE`. No FKs — history survives
deletion of whatever it describes. Sync results are not audited
(deterministic from rules + groups).

---

## 4. Flows

### 4.1 Login — `POST /api/auth/login`

```
1. CAPTCHA verified FIRST (today it runs after LDAP and protects nothing)
2. LDAP bridge call. Verified contract: HTTP 200 + profile JSON = success,
   wrong credentials = HTTP 401 (→ BadCredentials). Fail-closed guards: an
   `authenticated` field that carries anything non-affirmative rejects, and
   a 200 missing username/employeeId is a 503, never a session
3. Upsert user by employee_id: profile fields, member_of, last_logged_in
   (unique-violation on a concurrent first login → refetch, retry once)
4. Compute SYNC roles:
     keys   = memberOf → extract CN → normalize
     rules  = active rows of lr_role_cn_rules (read fresh — edits apply immediately)
     result = STANDARD_USER + every matching rule's role
              where the role is active AND sync_assignable (else log + skip —
              a bad rule costs one user one role, never breaks logins)
5. Diff result against the user's SYNC rows: delete gone, insert new
6. Compute effective roles (distinct active, both sources) and pages (§4.6)
7. Issue access token (JWT 15 min: sub, fullName, roles=[codes], pages=[codes])
   + refresh token (random 256-bit; hash stored; expires in 7 days)
8. Return both tokens + { username, fullName, roles, pages }
```

`synchronizeUser` moves **out of** `LrAuthenticationProvider` into the login
orchestration, so a user who fails the CAPTCHA is not created in the DB.

### 4.2 Every API request

`JwtRequestFilter` parses the access token **once** (today: three times) and
builds authorities from the claims: `ROLE_<code>` + `PAGE_<code>`. **No
database access on the request path.** Enforcement: `/api/admin/**` →
`hasRole('ADMIN')` (SecurityConfig + class-level `@PreAuthorize`, belt and
suspenders); business APIs → their page authority per §3.5; ADMIN passes
every page check.

### 4.3 Refresh — `POST /api/auth/refresh`

```
1. Hash the presented token, look it up; missing or expired → 401
   (frontend falls back to the login page)
2. Lock the user row; re-evaluate CN rules against the STORED member_of
   (same code as login steps 4–5 — rule edits reach users within 15 min
   even if they never re-login)
3. Recompute effective roles + pages
4. Rotate: delete old row, insert new (expiry unchanged — fixed 7-day session)
5. Return new access token + new refresh token
```

### 4.4 Logout — `POST /api/auth/logout`

Deletes the refresh-token row. The last access token dies within 15 minutes.

### 4.5 Manual grant / revoke (admin page)

- Grant: role must exist, be `active` and `manual_assignable` → insert one
  MANUAL row (idempotent). `granted_by` from the security context, **never**
  the request body (forgeable).
- Revoke: delete the MANUAL row. If a SYNC row remains, the response says so
  ("still granted by LDAP group X") so the UI can explain.
- Guards (409): an admin cannot revoke their own ADMIN; the last ADMIN cannot
  be revoked.

### 4.6 Page visibility & the ADMIN rule

Effective pages = union of `lr_role_pages` over the user's **active** roles;
**ADMIN ⇒ all pages**, computed at token build, not seeded. Why a bypass
instead of seed rows: an admin can grant themselves any role from the admin
page anyway, so restricting admins is friction, not security — and a computed
bypass means a newly shipped page is immediately visible to admins with no
seed to forget. A future "manages users but sees no data" person would be a
new role mapped only to the admin page — except the admin page is
ADMIN-role-gated, so in practice that means: don't do this; split data pages
instead.

### 4.7 Role lifecycle (admin page)

Create / edit (display name, description, flags, pages) / deactivate /
reactivate / delete, per §3.2, all audited. The everyday "turn this off"
action is **deactivate**; delete is refused while anyone holds the role.

### 4.8 First admin (bootstrap)

Username rules are gone and tables start empty, so: deploy → the intended
admin logs in once (their row now exists, with STANDARD_USER) → run the
one-time bootstrap SQL insert (template in the script, `granted_by =
'BOOTSTRAP'`, audited) → from then on, admins are managed in the UI. The
startup validator warns while nobody holds ADMIN.

---

## 5. API surface

### Auth — `/api/auth`

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/login` | public | captcha + LDAP → token pair |
| POST | `/refresh` | public (the token authorizes itself) | rotate, fresh roles+pages |
| POST | `/logout` | public (same) | revoke refresh token |
| GET | `/me` | bearer | live profile + roles + pages from DB (replaces `/validate`) |

### Admin — `/api/admin`, ADMIN only

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/users?search=&page=&size=` | paged users + their role assignments |
| PUT | `/users/{id}/roles/{roleCode}` | manual grant |
| DELETE | `/users/{id}/roles/{roleCode}` | manual revoke |
| GET | `/roles` | catalogue: flags, pages, holder counts, `system` |
| POST | `/roles` | create role (code, names, flags, pages) |
| PUT | `/roles/{code}` | edit names/flags/`active`/pages — code immutable |
| DELETE | `/roles/{code}` | delete; 409 while anyone holds it |
| GET | `/pages` | the `PageCodes` list + labels (for the role editor UI) |
| GET | `/cn-rules` | list (shows `cn_value` **and** normalized `cn_key`) |
| POST | `/cn-rules` | create (normalizes; rejects non-`sync_assignable` targets) |
| PUT | `/cn-rules/{id}` | edit (re-normalizes) |
| DELETE | `/cn-rules/{id}` | delete |
| GET | `/audit?page=&size=` | read the audit log |

Errors: 400 invalid, 404 unknown, 409 guards (self/last-admin,
delete-held-role, deactivate-system-role) — one small
`@RestControllerAdvice`, same JSON shape as the 401/403 bodies.

**Deliberately not building**: `observed-groups`, rule `preview`, `reapply`
(refresh-time re-evaluation makes it unnecessary), permissions beyond pages.
All addable later without schema pain.

---

## 6. Code changes

### Rewritten

| File | Change |
| --- | --- |
| `controller/AuthController.java` | login/refresh/logout/me; captcha first; thin — delegates to AuthService |
| `service/UserService.java` | **split and shrunk** into the services below; both hardcoded rule maps deleted |
| `security/LrAuthenticationProvider.java` | fail-closed check; pure LDAP authentication (no DB sync inside) |
| `security/JwtUtil.java` → `JwtService` | issue/parse access tokens; parse-once; claims: sub, fullName, roles, pages — **no more `memberOf` in the JWT** |
| `security/JwtRequestFilter.java` | authorities from claims (`ROLE_*`, `PAGE_*`); no `UserDetailsService`, no DB |
| `security/LrAuthenticationEntryPoint.java` | injected `ObjectMapper`; generic message |
| `config/SecurityConfig.java` | permit `/refresh` `/logout`; URL→page authority table (§4.2); `@EnableMethodSecurity`; `AccessDeniedHandler` matching the 401 shape |
| `model/user/User.java` | plain profile entity — all role-collection logic removed |
| `model/user/UserRole.java` | simple insert-only row: user, role, source, granted_at/by; surrogate id |
| `model/user/Role.java` | + `@ElementCollection Set<String> pageCodes` → `lr_role_pages` |
| `model/user/RoleCodes.java` | shrinks to `ADMIN` + `STANDARD_USER` — the only codes code refers to |

### New

| File | Purpose |
| --- | --- |
| `service/AuthService.java` | login orchestration (captcha → LDAP → sync → tokens), refresh, logout |
| `service/UserSyncService.java` | upsert profile + CN-rule evaluation + SYNC-row diff (shared by login & refresh) |
| `service/RoleAdminService.java` | grant/revoke + guards; role lifecycle; rule CRUD; page mapping; audit writes |
| `service/RefreshTokenService.java` | create / rotate / revoke / verify (hashing lives here) |
| `security/LdapNameNormalizer.java` | CN extraction + Turkish-safe normalization (with runnable harness) |
| `security/PageCodes.java` | page-code constants (§3.5) |
| `controller/AdminController.java` | the admin API |
| `config/RbacStartupValidator.java` | ADMIN/STANDARD_USER rows must exist or refuse to boot; warn while nobody holds ADMIN |
| `model/user/RoleCnRule.java`, `RefreshToken.java`, `RoleAudit.java` | entities |
| `repository/user/*` | `UserRepository`, `RoleRepository`, `UserRoleRepository`, `RoleCnRuleRepository`, `RefreshTokenRepository`, `RoleAuditRepository` |
| `dto/user/*` | `LoginRequest`, `TokenPairResponse`, `MeResponse`, `UserSummaryResponse`, `RoleRequest/RoleResponse`, `CnRuleRequest/Response`, `AuditEntryResponse` |
| `sql/V1__role_rehaul.sql` | **drop + recreate** all auth tables, seeds (§3.2, §3.4, §3.5), bootstrap-admin template |

### Deleted

`USERNAME_ROLE_CODE_RULES` (the four hardcoded admins),
`LDAP_CN_ROLE_CODE_RULES`, `LrUserDetails` (doesn't compile anyway), the
`UserDetailsService` dependency, `UserRoleId`, `UserRoleState`,
`User.synchronizeRolesFromDirectory` / `grantManualRole` / `revokeManualRole`
/ `findRoleAssignment`, both `UserRole` factories, `/validate`.

---

## 7. Bugs this fixes (inherited from the analysis docs)

| Bug | Fate |
| --- | --- |
| Fail-open LDAP (`null` ⇒ logged in) — critical | fail-closed check |
| Roles computed but never enforced anywhere — critical | URL rules + page authorities + method security |
| CAPTCHA after authentication ⇒ protects nothing, enables AD lockout | reordered first |
| One missing role row ⇒ every login fails, blaming LDAP | startup validator + log-and-skip at runtime |
| HashSet double-grant trap in `UserRole` | model replaced; trap structurally impossible |
| Roles frozen in a 1-week JWT | 15-min access token, DB re-read at refresh |
| Full `memberOf` in the JWT (size, leakage) | dropped from claims |
| `assignedBy` forgeable from the request body | taken from security context |
| No unique constraint on `username` | in the fresh DDL |
| Triple JWT parse per request; DB hit per request | parse once; no DB on the request path |
| ADMIN cannot see the transaction page | ADMIN bypasses page checks (§4.6) |

## 8. What stays the same

LDAP HTTP-bridge authentication (provider skeleton, timeouts, error mapping),
the CAPTCHA service (bypass-when-unavailable becomes a config flag),
`lr_users`/`lr_roles` column shapes, `employee_id` as the stable identity,
CORS, stateless sessions, all latency/transaction/analytics business
endpoints.

## 9. Config keys

```properties
auth.jwt.secret            = (unchanged)
auth.jwt.access-ttl        = 15m      # replaces the 1-week expiration-ms
auth.refresh.ttl           = 7d
app.captcha.bypass-when-unavailable = true
```

## 10. Rollout order

1. Run `sql/V1` (drop + recreate + seeds). Must land **before** the new build
   boots (startup validator).
2. Deploy backend.
3. Intended admin logs in once; run the bootstrap ADMIN insert.
4. Frontend switches to the new auth flow (§11).
5. Retire the superseded sections of the two older analysis docs.

## 11. Frontend changes (original project)

- **Token pair handling**: store both; refresh proactively (~1 min before
  expiry) or on 401, with a **single-flight** refresh (one in-flight promise —
  two tabs racing rotation would otherwise log one of them out).
- On any failed login, fetch a fresh CAPTCHA (single-use — already true today).
- **`routeMeta.tsx`**: replace the hardcoded role arrays
  (`TRANSACTION_PAGE_ROLES` etc.) with a `pageCode` per entry; `RequireRole`
  becomes `RequirePage` reading `pages` from the auth context (fed by
  login/refresh/`/me` responses — no JWT decoding). Sidebar filter:
  `pages.includes(item.pageCode)`. ADMIN needs no frontend special-casing —
  the backend already put every page in an admin's list. The admin page entry
  keeps a role check (`roles.includes('ADMIN')`).
- `types/auth.ts`: `Role` stops being a closed union (roles are dynamic);
  `User` gains `pages: string[]`; drop `ROLE_ILETISIM_KANALLARI`.
- Landing redirect (`/` → `/latency/daily`) falls back to the user's first
  visible page.
- **Admin page sections**: Users (search, role chips, grant/revoke), Roles
  (create/edit/deactivate/delete + page checkboxes from `GET /pages`),
  CN Rules (list/create/edit/delete, showing the normalized key), Audit
  (read-only list).

## 12. Decisions log

| Decision | Call |
| --- | --- |
| Revocation freshness | roles+pages trusted from the access token; worst case 15 min staleness; no DB on the request path |
| CN rules editing | admin API + UI section |
| Audit | in (`lr_role_audit`) |
| Session policy | fixed 7-day refresh expiry; 15-min access tokens |
| Roles | `STANDARD_USER`, `ADMIN`, `TRANSACTION`, `ANALYTICS`; `ILETISIM_KANALLARI` gone |
| CN seeds | `İletişim Kanalları Servisi` → `TRANSACTION`; nothing → `ANALYTICS` |
| ADMIN page access | sees everything, computed bypass |
| Page visibility | `lr_role_pages`, admin-editable, no redeploys |
| Migration | drop + recreate, no data carried over |

## 13. Practical notes

- This folder is a reference snippet (no `pom.xml`); code will be written
  compile-clean against Spring Boot 3 / Java 21 conventions, but real
  verification happens when you port it into the actual project.
- Package names in the snippet disagree (`com.bistech.*` vs
  `com.borsaistanbul.*`). New files will use one consistent package; adjust
  on port.
- `LdapNameNormalizer` ships with a runnable assertion harness
  (`verification/`) — it's the one behavior that fails silently when broken.
- The frontend keeps tokens in localStorage (per `AuthContext`); the refresh
  token will live there too. Acceptable for an internal tool; httpOnly-cookie
  storage is a possible later hardening.
