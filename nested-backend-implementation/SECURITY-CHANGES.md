# Security & RBAC — what changed after v1, and why

This is the **rationale** document: what the first version of the security code
did, what was wrong or missing in it, what was changed, and which alternatives
were rejected along the way.

Its companion [RBAC.md](RBAC.md) is the **operational** document — file map,
endpoint table, migration order, diff checklist. If you want to *apply* the
change, read that one. If you want to know *why it looks like this*, or you are
reviewing it, read this one.

> **Compilation status, stated plainly.** This folder is a reference snippet
> inside a Vite/React repository — there is no `pom.xml`, no classpath, and the
> package declarations do not match the directory layout. **None of the Java
> here has been compiled.** The one exception is `LdapNameNormalizer`, which was
> extracted and run against a 20-assertion harness on JDK 21 (see §5.3 and
> `verification/NormalizerCheck.java`). Everything else needs a real build
> before you trust it.

---

## Contents

1. [Where v1 stood](#1-where-v1-stood)
2. [Bugs](#2-bugs)
3. [Missing functionality](#3-missing-functionality)
4. [Architectural decisions](#4-architectural-decisions)
5. [Things that were subtler than they looked](#5-things-that-were-subtler-than-they-looked)
6. [Behavioural changes that reach outside the backend](#6-behavioural-changes-that-reach-outside-the-backend)
7. [Deliberately not done](#7-deliberately-not-done)
8. [Change index](#8-change-index)

---

## 1. Where v1 stood

The plumbing was mostly right, and better than it first appeared:

- `lr_user_roles` already separated **sync** from **manual** assignment with a
  CHECK guaranteeing at least one source. That is the hard part of this domain
  to get right, and it was right.
- `lr_roles.sync_assignable` / `manual_assignable` already gated *which* roles
  each channel could grant.
- `UserService` already had working `grantManualRole` / `revokeManualRole`.
- `JwtRequestFilter` already re-read `UserDetails` from the database per
  request, so authorities were live rather than frozen in the token.

So "there is no manual role assignment" was really "no controller exposes the
service methods that already exist."

**The larger gap was different: nothing enforced anything.** `SecurityConfig`
was `anyRequest().authenticated()`, there was no `@EnableMethodSecurity`, and no
`@PreAuthorize` anywhere in the codebase. Roles were computed, synchronised,
and written into the JWT — and then never checked. Adding a role-assignment UI
on top of that would have been building the second half of a bridge.

---

## 2. Bugs

Ordered by severity.

### 2.1 Fail-open LDAP authentication — critical

`LrAuthenticationProvider` decided whether the directory had accepted the
credentials like this:

```java
if ("false".equalsIgnoreCase(ldapAuthResponse.authenticated())) {
    throw new BadCredentialsException("Invalid username or password");
}
```

`authenticated` is a `String`. `"false".equalsIgnoreCase(null)` returns `false`
without throwing, so a `null` field — or `"FALSE "`, or `"0"`, or any value the
LDAP bridge might start returning after a contract change — **fell through and
the login succeeded**.

Changed to require an explicit affirmative:

```java
if (!"true".equalsIgnoreCase(ldapAuthResponse.authenticated())) {
    LOGGER.warn("LDAP did not affirm authentication for user '{}' (authenticated={})",
            username, ldapAuthResponse.authenticated());
    throw new BadCredentialsException("Invalid username or password");
}
```

The general principle, worth applying wherever else a trust decision reads an
external string: **enumerate what you accept, not what you reject.** A denial
list over an unbounded input space is open by construction.

### 2.2 `active` on a role was decorative — high

`LrUserDetails` was still written against a pre-JPA model:

```java
authorities = userSent.getRoles().stream()
        .map((Role role) -> new SimpleGrantedAuthority("ROLE_" + role.name()))
        .collect(Collectors.toList());
```

`role.name()` is an enum method; `Role` is now an entity with a `code` column.
Beyond not compiling against the current model, nothing anywhere re-checked
`lr_roles.active` when deriving authorities — so **deactivating a role did not
revoke it from anyone who already held it.** The column looked like a
kill-switch and was not one.

The rewrite derives authorities through `User.getActiveRoles()`, which filters
on `Role.isActive()`. Deactivating a role now withdraws it from every holder on
their next request, without touching a single assignment row — so reactivating
restores exactly the previous state.

> **Check before deploying:** if any row in `lr_roles` currently has
> `active = false` *and* has holders, those users lose that role. That is the
> intended fix, but look first.

### 2.3 `lr_users.username` had no unique constraint — high

Only `employee_id` was constrained. But `loadUserByUsername` looks users up by
username, and the JWT `sub` claim carries it. Two rows sharing a username
produce a non-unique-result failure (`IncorrectResultSizeDataAccessException`
wrapping Hibernate's `NonUniqueResultException`) on **every authenticated
request** for that user — not just at login.

Not blindly added. `sql/V1__rbac_baseline_fixes.sql` leads with the check:

```sql
SELECT username, count(*) FROM stat.lr_users GROUP BY username HAVING count(*) > 1;
```

It is almost certainly empty — AD `sAMAccountName` is domain-unique — but the
constraint is what keeps it that way, and the realistic path to a duplicate is
an employee leaving and their username being reissued to someone new.

### 2.4 One missing seed row broke every login — high

```java
if (!missingRoleCodes.isEmpty()) {
    throw new IllegalArgumentException(
            "The following automatically resolved roles do not exist in stat.lr_roles: " + missingRoleCodes);
}
```

That throw propagated into `LrAuthenticationProvider`'s catch-all for
`IllegalArgumentException`, which reported it as
`"LDAP returned incomplete user data"`.

Because `STANDARD_USER` is resolved for *every* user, a single missing row
rejected **every login in the system** while blaming the directory. A deployment
could pass every smoke test that did not include a login, then fail totally and
point at the wrong component.

Split into two, by when the problem is knowable:

- **Configuration errors fail at startup.** `RbacStartupValidator` checks
  `RoleCodes.REQUIRED` against `lr_roles` and refuses to boot, with an accurate
  message, at the moment someone is watching a deploy.
- **Data errors are logged and skipped.** A sync rule pointing at a role that is
  missing, inactive, or not `syncAssignable` costs one user one role — not
  everyone's ability to log in.

The validator also warns (without failing) when no user holds `ADMIN`, which
catches the bootstrap step not having been run. That symptom is otherwise
baffling: the admin screens exist, are correctly protected, and nobody alive can
reach them — including the person who would grant themselves access.

### 2.5 CAPTCHA ran after authentication — high

The order was: authenticate against LDAP → verify CAPTCHA → issue JWT.

A script could therefore hammer LDAP with credential guesses and simply ignore
the 401, never reaching the CAPTCHA step. **The CAPTCHA protected nothing**, and
in an Active Directory environment unthrottled password guessing does more than
waste cycles — it **locks out real accounts**.

Secondary effect: `synchronizeUser` runs inside the provider, so a user who
passed LDAP and then failed the CAPTCHA was still created in the database and
still had `last_logged_in` stamped.

CAPTCHA now runs first. That fixes the timestamp problem too, without
restructuring the provider.

**This one has a frontend consequence — see [§6.1](#61-the-frontend-must-refresh-the-captcha-on-any-failed-login).**

### 2.6 Schema and wiring gaps — medium and below

| Gap | Consequence | Fix |
|---|---|---|
| No index on `lr_user_roles.role_id` | "Who holds this role?" is a sequential scan; the last-admin guard runs it on every revoke | `ix_lr_user_roles_role_id` |
| `memberOf` not persisted | Rule authors cannot see which CNs actually exist | `member_of text[]` on `lr_users` |
| No `AccessDeniedHandler` | `@PreAuthorize` rejections return 403 in a *different* body shape than the 401s, so the frontend parses two formats | `LrAccessDeniedHandler`, matching the entry point |
| `new ObjectMapper()` per 401 | Rebuilding an expensive, thread-safe object per rejected request | Inject the shared bean |
| Auth exception message concatenated into the 401 body | Leaks why a token was rejected | Log it; return a generic message |
| `rbac.sql` missing statement terminators | Will not run as-is | Corrected in `sql/V1` |
| `ck_lr_user_roles_manual_metadata` unparenthesised | **Not a bug** — `AND` binds tighter than `OR`, so it already means what was intended | Parenthesised for readability only |
| `ResourceAccessException` imported from `org.springframework.core.io` | That class does not exist there | Corrected to `org.springframework.web.client` |
| Unused `@AuthenticationPrincipal` param on `/validate` | `noUnusedParameters` equivalent; harmless | Removed |

---

## 3. Missing functionality

| Missing | Now |
|---|---|
| **Any enforcement at all** | `@EnableMethodSecurity` + `@PreAuthorize` on every admin handler |
| Manual role assignment API | `PUT`/`DELETE /api/admin/users/{id}/roles/{roleCode}` |
| Audit trail | `stat.lr_user_role_audit`, append-only |
| Runtime-editable LDAP rules | `stat.lr_role_sync_rules` + CRUD API |
| Role catalogue / permission mapping | `stat.lr_role_permissions` + CRUD API |
| A way for the frontend to learn its own access | `GET /api/auth/me` |
| Startup validation | `RbacStartupValidator` |
| Protection against locking everyone out | Last-admin, self-revoke, and ADMIN-role invariants |

### 3.1 The audit gap was invisible in v1

`lr_user_roles` records *who granted* a role. But a revoke either deletes the
row or flips `manual_assigned` to false and NULLs the metadata — so the
revocation, **and every grant that preceded it**, left no trace at all. The table
answers "who has what" and cannot answer "what happened".

`lr_user_role_audit` is append-only and deliberately denormalised: `role_code`
and `username` are stored as text and there is no FK on `user_id`, so history
survives deletion of the user or role it describes. An FK would either block the
delete or cascade the history away.

Sync actions are recorded **only when synchronisation actually changed
something**. Most logins produce no diff, so the table grows with real events
rather than with traffic.

---

## 4. Architectural decisions

### 4.1 Permissions, not a role hierarchy

**This recommendation reversed during the discussion, and the reversal is the
interesting part.**

The initial advice was to skip a permission layer: with three roles,
`hasRole('ADMIN')` plus a shallow `RoleHierarchy` bean is enough, and three
extra tables buy flexibility nobody needs. That advice was explicitly
conditioned on a small, fixed role set.

Then: *"I plan to add many more roles in the future."* That breaks the
condition, and two problems follow:

1. **A `RoleHierarchy` is a static DAG defined in Java.** It suits vertically
   ordered tiers (`ADMIN > POWER > USER`). It suits a growing set of *lateral,
   functional* roles badly — `ILETISIM_KANALLARI` is not "more than" a standard
   user, it is a different domain. Add RISK, SURVEILLANCE, SETTLEMENT and there
   is no meaningful chain; you end up with `ADMIN implies A, B, C, D, E`, which
   is "ADMIN can do everything" written the long way.
2. **Every new role becomes a code change and a redeploy** — and a silent one.
   Forget to add role #9 to the hierarchy and it simply grants less than
   intended, with no error anywhere.

`@PreAuthorize("hasRole('X')")` has the same disease: "give the new SURVEILLANCE
role access to the latency grids" means editing and redeploying controllers.

So:

- **Permission codes are Java constants** (`security/Permissions.java`). A
  permission exists exactly when an endpoint checks for it, and adding an
  endpoint is a deploy regardless.
- **The role→permission mapping is data** (`stat.lr_role_permissions`), editable
  by administrators.
- `LrUserDetails` grants **both** `ROLE_<code>` (backward compatible — the
  frontend and the `roles` claim are untouched) **and** `PERM_<code>`.
- Handlers use `@PreAuthorize(Permissions.HAS_ROLE_MANAGE)` and friends.

Creating role #9 and giving it access to a screen is now entirely an admin-UI
operation. **There is no `RoleHierarchy` bean**, and `SecurityConfig` never needs
to change as the role set grows.

Cost: one table, one `@ElementCollection`, ~40 lines. It is still not "complex
RBAC" — no scopes, no resource ACLs, no runtime-defined permissions.

### 4.2 The JWT's claims authorize nothing

`JwtRequestFilter` verifies the signature to establish *who* you are, then
re-reads *what you may do* from the database on every request.

| | Consequence |
|---|---|
| **Gain** | A revoked role, a deactivated role, or an edited permission mapping takes effect on the very next request. No token blacklist, no forced re-login, no revocation list to maintain. |
| **Cost** | One indexed, fetch-joined query per request. |
| **Trap** | The `roles` claim in an issued token goes stale immediately. |

Hence the explicit rule, stated in `JwtUtil`, `CurrentUserResponse` and
`AdminPage`: **the claims are advisory, for first paint only; `/api/auth/me` is
the source of truth.** If those two ever disagree, the server is right.

`JwtUtil` splits `roles` and `permissions` into separate claims specifically so
that `roles` keeps its exact previous contents and no existing consumer starts
seeing `PERM_*` entries it does not understand.

If that per-request query ever shows up in a latency profile, the fix is a
30–60 second cache in `LrUserDetailsService` — not moving authorization back
into the token. Note that any such TTL becomes the window during which a revoked
role still works.

### 4.3 The two-source invariant moved into the entity

Directory sync may only ever touch `sync_assigned`; an administrator may only
ever touch `manual_assigned`; the row exists while either is true and is deleted
when neither is.

This lives on `UserRole` / `User` rather than in service code because it is only
checkable when the whole assignment set is visible at once. Concretely it means:

- A manual grant survives the user leaving the LDAP group.
- An LDAP-derived role survives an administrator revoking their manual grant.

`synchronizeRolesFromDirectory` returns a `RoleSyncDiff` so the audit trail can
record real events instead of one row per login.

This is the behaviour most worth covering if you ever add test infrastructure —
it is easy to break with a well-meaning refactor and produces no error when
broken, just quietly wrong access.

### 4.4 Username-based role assignment deleted outright

v1 named four individuals in source:

```java
private static final Map<String, Set<String>> USERNAME_ROLE_CODE_RULES = Map.of(
        "enginsuhan.bilgic", Set.of(RoleCodes.ADMIN),
        ...
);
```

Changing who is an administrator required a release. Per your decision, this is
gone entirely — **nothing in code or in the database grants a role by username.**
Administrator access is granted by a human through the admin API, full stop.

That leaves a chicken-and-egg: no admin exists, so nobody can use the UI to
create one. The one-time bootstrap block at the end of
`sql/V2__rbac_extension.sql` breaks the cycle exactly once. It requires the
target user to have logged in at least once (the row must exist), and it writes
an audit entry attributed to `SYSTEM_BOOTSTRAP` so the first grant is not
invisible.

### 4.5 Two guards against locking everyone out

Both failure modes end the same way — the admin screens are reachable only by
someone holding `ADMIN`, so losing the last one means editing `lr_user_roles` by
hand in production.

- `UserService.guardAgainstAdministratorLockout` refuses self-revocation of
  `ADMIN` and refuses to remove the last holder. → **409**
- `RoleAdminService` refuses to deactivate `ADMIN`, delete it, make it
  non-manually-assignable, or let it give up `ROLE_MANAGE` /
  `ROLE_PERMISSION_MANAGE`.

`AdministratorLockoutException` is 409 rather than 400 deliberately: the request
is well-formed and would be legal against a different system state.

### 4.6 The privilege-escalation boundary

Worth naming explicitly, because it is enforced in two places that must agree:

> `ADMIN` is not `sync_assignable`, and `RoleAdminService` refuses to make it so.
> `RoleSyncRuleService` refuses to create a rule targeting a role that is not
> `sync_assignable`.

Together those mean **no LDAP rule anyone writes can ever grant administrator
access**. Remove either half and membership of a directory group becomes a path
to administration.

The same reasoning is why creating a role and granting it permissions are
separately permissioned operations: `ROLE_PERMISSION_MANAGE` defines what access
*exists*, while `ROLE_MANAGE` only hands out access that already exists. A new
role starts with no permissions, so creating one can never itself be the
escalation.

### 4.7 Narrow exception handling

`RbacExceptionHandler` is a `@RestControllerAdvice` that handles exactly two
application-specific exception types and nothing else — no `Exception.class`
catch-all, no `EntityNotFoundException` handler. Both of those would risk
overriding whatever global advice the project already has; since these two types
are new, nothing can be competing for them.

> **Action required:** if the project does **not** already map
> `jakarta.persistence.EntityNotFoundException` to 404, add a handler. Otherwise
> a missing user or role surfaces as a 500.

---

## 5. Things that were subtler than they looked

### 5.1 The CAPTCHA reordering had a real objection

The response to "move CAPTCHA before authentication" was, correctly:

> *When the CAPTCHA answer is correct but the credentials are wrong, the CAPTCHA
> is still consumed and deleted from Redis. Then the user sees the same CAPTCHA
> and cannot validate it again.*

That is true, and the resolution is not to weaken either property:

- **Ordering must change.** Sitting after authentication, the CAPTCHA protects
  nothing and permits AD account lockout (§2.5).
- **Single-use consumption must stay.** A replayable CAPTCHA is not a CAPTCHA.
- **Therefore the client refreshes on failure.** Every login attempt gets a
  fresh challenge.

The key observation: **this was already required before the reordering.** Under
the old order, correct credentials plus a wrong CAPTCHA answer consumed the
challenge and rejected the login just the same. The reordering only widens the
window. It is one line in the login error handler.

`app.captcha.bypass-when-unavailable` (default `true`) preserves the previous
availability-over-strictness behaviour and makes it a config decision rather
than a buried constant.

### 5.2 Substring matching was granting access by accident

v1 matched CN rules with `normalizedCn.contains(normalizedCnPart)` — for every
rule. A rule keyed on `"Servis"` matches *every* group with that word in its
name.

Default is now `EXACT`, with `CONTAINS` retained as a per-rule escape hatch
(`match_mode`) for directories with inconsistent naming. If any of your existing
group names relied on partial matching, those rows need `CONTAINS`.

### 5.3 The Turkish I — and the defect found by testing rather than reasoning

This is the part most likely to bite, and the part where the process mattered.

**Problem one, found by reading:** the group names contain `İ` (U+0130).
`"İ".toLowerCase(Locale.ROOT)` returns **two** code points — `i` plus U+0307
COMBINING DOT ABOVE. PostgreSQL's `lower()` does something different; a JVM
started with a Turkish default locale does a third thing (`"I".toLowerCase()` →
`ı`). The v1 rule map survived only because both operands went through the
identical expression in the same JVM. Once one side lives in a database and the
other is typed by an administrator, that coincidence is gone and rules silently
never fire.

**Problem two, found by running the code:** a normalizer was written to fix
problem one, then exercised against the real group name in every casing an
administrator might type. All-caps input failed:

```
"KANALLARI".toLowerCase(Locale.ROOT)  ->  "kanallari"   (dotted i)
"Kanalları".toLowerCase(Locale.ROOT)  ->  "kanalları"   (dotless ı)
```

Turkish has two distinct letters here and **no locale lowercases both correctly**
for mixed Turkish/English text — switching to a Turkish locale merely moves the
failure onto English words containing `I`. An administrator typing the group
name in capitals would have created a rule that never matched, with no error
anywhere.

The resolution folds the distinction away for comparison purposes: `İ`, `I`,
`ı`, `i` all become `i`. Verified output across six input variants:

```
match=true   [İletişim Kanalları Servisi]      <- as the directory returns it
match=true   [iletişim kanalları servisi]
match=true   [İLETİŞİM KANALLARI SERVİSİ]      <- was broken before the fold
match=true   [  İletişim Kanalları Servisi  ]
match=true   [İletişim Kanallari Servisi]
match=false  [iletisim kanallari servisi]      <- correct: 'ş' is not folded
```

**The cost, stated plainly:** two group names differing *only* in dotted vs.
dotless `i` collide. Same class of trade as case-insensitivity itself, and
negligible for directory group names against the certainty of admins typing in
capitals. The fold applies only to `i` — this is not an ASCII fold, so `ş`, `ğ`,
`ç`, `ö`, `ü` are preserved and `Öğrenci` stays distinct from `Ogrenci`.

Design consequences:

- `lr_role_sync_rules` stores **both** `match_value` (the admin's exact text,
  display only) and `match_key` (the normaliser's output, the only field ever
  compared). **Never compare `lower(match_value)` in SQL** — Postgres's `lower()`
  and this function do not agree.
- The `match_key` seeded by `sql/V2` is `iletişim kanallari servisi`. Note `ş` is
  preserved but `kanallari` ends in a **dotted** i, unlike the display value.
  That looks like a typo and is not. It was hand-written wrong the first time
  and corrected only because the harness caught it.
- The rule editor shows the normalised key, because a rule that never matches
  produces no feedback anywhere else.

**Process note worth keeping:** reasoning about this code found problem one and
missed problem two. Twenty minutes of running it found both.
`verification/NormalizerCheck.java` is checked in so the check is repeatable —
no JUnit, no build tool, exits non-zero on failure.

---

## 6. Behavioural changes that reach outside the backend

### 6.1 The frontend must refresh the CAPTCHA on any failed login

> On any non-2xx response from `/api/auth/login`, fetch a fresh CAPTCHA and
> clear the answer field.

One line in the login error handler. See §5.1 for why this is not optional and
was already required.

### 6.2 The frontend should call `/api/auth/me`, not read its own token

The `roles` claim keeps its exact previous contents, so nothing breaks
immediately. But it is a login-time snapshot: a role revoked mid-session stops
working server-side at once while the token keeps asserting it. Any UI that
gates on the claim will show menu entries that 403.

`/api/auth/me` also returns `permissions`, which is what the UI should actually
gate on — it matches what the server enforces.

### 6.3 Authority strings are unchanged

`"ROLE_" + code`, exactly as before — **provided `lr_roles.code` holds the same
strings the old enum constants did** (`ADMIN`, `STANDARD_USER`,
`ILETISIM_KANALLARI`). If any differ, authority strings change and existing
`ROLE_ADMIN` checks break. Worth confirming with one query before deploying.

### 6.4 403s now have a body

Previously `@PreAuthorize` did not exist, so nothing produced a 403. Now they
arrive in the same JSON shape as the 401s (`{status, error, message, path}`).
The body deliberately does not name the missing permission — that is logged
server-side instead, where it helps diagnosis without telling a caller what to
go looking for.

### 6.5 Operational

- Boot **fails** if a required role code is missing from `lr_roles`. Intentional
  (§2.4), but it means the SQL must be applied before the new build starts.
- Boot **warns** if nobody holds `ADMIN`.
- Deleting a sync rule does not strip anyone's role immediately — sync
  assignments are withdrawn lazily at each affected user's next login. To remove
  access *now*, deactivate the role; that takes effect on every holder's next
  request.

---

## 7. Deliberately not done

| Not built | Why |
|---|---|
| **Row-level data scoping** (a participant seeing only their own rows) | Confirmed out of scope. Worth restating that it is *not* RBAC and could not be added as a role — it would need a per-user scope table plus an extra `Specification` predicate in `GroupedLatencyService`. |
| **Username-based role sync**, in code or DB | Per §4.4. The one-time bootstrap is the only exception. |
| **Token revocation list / blacklist** | Per-request DB authority lookup already gives instant revocation (§4.2). |
| **Resource-level ACLs, permission groups, dynamic permission creation** | Genuinely not needed here, and each adds a caching and invalidation problem. |
| **Automatic Postgres-side normalisation of `match_key`** | Postgres `lower()` and the Java normaliser disagree on Turkish input (§5.3). Normalising in exactly one place is the point. |

### Known limitations carried forward

- **N+1 on the admin user list.** `UserRepository.search` does not fetch-join
  assignments. At a page size of 20 this is fine; it is not fine if you raise
  the page size a lot. An `@EntityGraph` fixes it at the cost of a more
  expensive count query.
- **`observed-common-names` reads what the app has seen**, not the directory —
  only groups belonging to users who have logged in at least once appear.
- **Almost no tests.** Only `LdapNameNormalizer` is covered
  (`verification/NormalizerCheck.java`, 20 assertions, passing on JDK 21.0.8).
  The two behaviours most worth covering next: the sync/manual invariant in
  `User.synchronizeRolesFromDirectory`, and the last-admin guard.

---

## 8. Change index

### Modified

| File | Change | §  |
|---|---|---|
| `security/LrAuthenticationProvider.java` | Fail-closed LDAP check | 2.1 |
| `security/LrUserDetails.java` | Entity model; inactive-role filter; `PERM_*` authorities | 2.2, 4.1 |
| `security/JwtUtil.java` | Split `roles` / `permissions` claims | 4.2 |
| `security/LrAuthenticationEntryPoint.java` | Injected `ObjectMapper`; generic message | 2.6 |
| `config/SecurityConfig.java` | `@EnableMethodSecurity`; `accessDeniedHandler`; no `RoleHierarchy` | 3, 4.1 |
| `controller/AuthController.java` | CAPTCHA before authentication; `GET /me` | 2.5, 6.2 |
| `service/UserService.java` | DB-driven sync rules; log-and-skip; guards; auditing | 2.4, 4.3–4.5 |

### Added

| File | Purpose | § |
|---|---|---|
| `security/Permissions.java` | Permission codes + `@PreAuthorize` constants | 4.1 |
| `security/RoleCodes.java` | Only codes the application references by name | 2.4 |
| `security/LdapNameNormalizer.java` | CN extraction + Turkish-safe comparison key | 5.3 |
| `security/LrUserDetailsService.java` | Per-request principal load (was referenced, absent) | 4.2 |
| `security/LrAccessDeniedHandler.java` | 403s matching the 401 shape | 2.6, 6.4 |
| `security/CurrentUser.java` | Acting username from the security context only | 4.5 |
| `config/RbacStartupValidator.java` | Fail fast on an unsupportable schema | 2.4 |
| `service/RoleAdminService.java` | Role catalogue + permission editing + escalation guards | 4.1, 4.6 |
| `service/RoleSyncRuleService.java` | CN rule CRUD, normalisation, dry-run preview | 5.2, 5.3 |
| `service/RoleAuditService.java` | Append-only audit writes/reads | 3.1 |
| `controller/Admin*Controller.java` | The admin API | 3 |
| `controller/RbacExceptionHandler.java` | Two domain exceptions → 400 / 409 | 4.7 |
| `model/user/*` | `User`, `Role`, `UserRole`, `RoleSyncRule`, `UserRoleAudit`, … | 4.3 |
| `sql/V1__rbac_baseline_fixes.sql` | Constraint, index, `member_of`, role seed | 2.3, 2.6 |
| `sql/V2__rbac_extension.sql` | Permissions, sync rules, audit, bootstrap | 3 |
| `verification/NormalizerCheck.java` | 20 assertions on the normaliser | 5.3 |
