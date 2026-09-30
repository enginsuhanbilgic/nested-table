# Dynamic LDAP role rules — analysis and plan

Independent review of `service/UserService.java`, `model/user/*`, `dto/user/*`,
`controller/AuthController.java` and the `security/` + `config/` classes they
depend on, written to answer three questions:

1. What does role resolution actually do today?
2. What breaks if the CN→role map moves from Java into the database?
3. What else is wrong in the code that touches this path?

Findings marked **[verified]** were confirmed by running code on JDK 21
(`verification/` harnesses described in §7), not by reading. Everything else is
a reading-level finding and is labelled with my confidence.

---

## Contents

- [1. Scope and what is missing from this snippet](#1-scope-and-what-is-missing-from-this-snippet)
- [2. How role resolution works today](#2-how-role-resolution-works-today)
- [3. Bugs](#3-bugs)
- [4. Design — rules in the database](#4-design--rules-in-the-database)
- [5. Design — `UserRoleController`](#5-design--userrolecontroller)
- [6. Plan](#6-plan)
- [7. What I verified by running it](#7-what-i-verified-by-running-it)
- [8. Things I checked that turned out fine](#8-things-i-checked-that-turned-out-fine)
- [9. Open decisions](#9-open-decisions)

---

## 1. Scope and what is missing from this snippet

Several classes on the critical path are **not in this folder**, so statements
about them are inferences from their call sites:

| Referenced | Used by | Status |
|---|---|---|
| `UserRepository` | `UserService` | absent — needs `findByEmployeeId`, `findByCode`-style lookups |
| `RoleRepository` | `UserService` | absent — `findAllByCodeIn`, `findByCode` |
| `UserDetailsService` impl | `JwtRequestFilter`, `AuthController` | absent — **this is where the `LrUserDetails` bug lands (§3.2)** |
| `CaptchaService`, `CaptchaVerifyRequest` | `AuthController` | absent |
| `LoginRequest`, `AuthenticationResponse` | `AuthController` | absent |
| DDL for `stat.lr_roles` / `lr_user_roles` | everything | absent — entity mappings are the only evidence |

**Package namespaces do not agree across the snippet.** `model/user/*` and
`dto/user/*` declare `com.bistech.reporting.*`; `security/*` and `config/*`
declare `com.borsaistanbul.reporting.*`. `LrAuthenticationProvider` imports
`com.borsaistanbul.reporting.dto.LdapAuthResponse`, but the record actually
declares `package com.bistech.reporting.dto.auth`. Also worth noting: the files
in the `dto/user/` **directory** declare package `...dto.auth`.

I am treating this as an artifact of how the snippet was assembled rather than
a real defect. **Confirm against your real tree before anything else** — if the
namespaces genuinely differ in the running application, nothing here compiles
and that is the first thing to fix.

---

## 2. How role resolution works today

Per login, from `LrAuthenticationProvider.authenticate`:

```
POST /api/auth/login
  └─ authenticationManager.authenticate()
       └─ LrAuthenticationProvider
            ├─ RestClient POST → LDAP bridge → LdapAuthResponse
            ├─ if ("false".equalsIgnoreCase(authenticated)) reject      ← §3.1
            └─ userService.synchronizeUser(ldapAuthResponse)
                 ├─ validateLdapUser                 username/employeeId/fullName non-blank
                 ├─ findByEmployeeId → User or new User()
                 ├─ updateUserFields                 overwrite profile, replace memberOf, stamp lastLoggedIn
                 ├─ resolveSynchronizedRoleCodes
                 │    ├─ resolveRoleCodesFromMemberOf   STANDARD_USER + LDAP_CN_ROLE_CODE_RULES  ← the target
                 │    └─ resolveRoleCodesFromUsername   USERNAME_ROLE_CODE_RULES (4 hardcoded people)
                 ├─ loadPermittedSynchronizedRoles   uppercase → findAllByCodeIn → throw if any missing ← §3.4
                 │                                    then skip !active / !syncAssignable
                 └─ user.synchronizeRolesFromDirectory(roles)
                      sync_assigned ← desired; manual_assigned untouched; row dropped when neither
  ├─ captchaService.verifyCaptcha()                   ← runs AFTER authentication, §3.5
  ├─ userDetailsService.loadUserByUsername()
  └─ jwtUtil.generateToken(userDetails, claims)       ← claims include full memberOf, §3.8
```

The two-source invariant in `User` / `UserRole` is the part of this design that
is genuinely well built. A manual grant survives the user leaving the LDAP
group; an LDAP-derived role survives an admin revoking their manual grant; the
row disappears only when both sources are false. Keep that, and keep it in the
entity where it is — it is only checkable with the whole assignment set visible.

Two structural observations that matter for the change you want:

- **`memberOf` is already persisted** (`stat.user_member_of` via
  `@ElementCollection`). That means a rule change can be replayed against every
  known user without waiting for them to log in — see §5, `POST /sync-rules/reapply`.
- **Roles are recomputed on every login and nowhere else.** After this change,
  editing a rule still will not affect a logged-in user until their next login.
  That is a product decision you should make deliberately, not inherit.

---

## 3. Bugs

Ranked by severity. §3.1–3.3 are the ones I would fix regardless of this feature.

### 3.1 LDAP authentication is fail-open — critical

`security/LrAuthenticationProvider.java:91`

```java
if ("false".equalsIgnoreCase(ldapAuthResponse.authenticated())) {
    throw new BadCredentialsException("Invalid username or password");
}
```

`authenticated` is a `String`, and `"false".equalsIgnoreCase(null)` returns
`false` without throwing. So a `null` field — or `"FALSE "`, `"0"`, `"no"`, or
anything the LDAP bridge starts returning after a contract change — **falls
through and the login succeeds.** `@JsonIgnoreProperties(ignoreUnknown = true)`
on the record means a renamed field deserialises to `null` silently rather than
erroring.

Fix is to require an explicit affirmative:

```java
if (!"true".equalsIgnoreCase(ldapAuthResponse.authenticated())) { ... }
```

The general rule, worth applying anywhere a trust decision reads an external
string: **enumerate what you accept, not what you reject.** A denial list over
an unbounded input space is open by construction.

### 3.2 Nothing enforces roles, and `LrUserDetails` does not compile — critical

Two problems in one class, and together they mean the entire role system is
decorative today.

`security/LrUserDetails.java:24`

```java
authorities = userSent.getRoles().stream()
        .map((Role role) -> new SimpleGrantedAuthority("ROLE_" + role.name()))
```

`User` has no `getRoles()` — it has `getRoleAssignments()`. `Role` is a JPA
entity with `getCode()`, not an enum with `name()`. This class is written
against a pre-JPA model and cannot compile against `model/user/*` as it stands.
Whatever is actually deployed is not this file.

Three consequences follow from fixing it, and all three need handling:

1. **`Role.active` is not consulted anywhere when deriving authorities.**
   Deactivating a role does not revoke it from anyone holding it. The column
   looks like a kill-switch and is not one. Derive authorities through a filter
   on `Role.isActive()`.
2. **`roleAssignments` is `FetchType.LAZY`** and `Role` behind it is lazy too.
   Building `LrUserDetails` outside a transaction throws
   `LazyInitializationException`, which `JwtRequestFilter` swallows into a
   generic log line and a confusing 401. The `UserDetailsService`
   implementation must fetch-join `roleAssignments` → `role`.
3. **`public User user;`** — a public mutable field that also carries `@Getter`.
   Make it private final.

And the enforcement half: `config/SecurityConfig.java` is
`anyRequest().authenticated()`, there is no `@EnableMethodSecurity`, and there
is no `@PreAuthorize` anywhere in the snippet. Roles are computed, synchronised
and written into the JWT, then **never checked**.

> This is the blocker for what you asked for. Adding `UserRoleController`
> without method security first means any authenticated user — every employee
> in the directory — can `PUT /users/{me}/roles/ADMIN`. The controller must not
> ship before enforcement does.

### 3.3 A manual grant can be silently dropped — high **[verified]**

`model/user/UserRole.java:85` — compare the two factories:

```java
updateBySynchronization(...)   →  UserRole.builder().id(new UserRoleId(user.getId(), role.getId()))...
updateByManualAssignment(...)  →  UserRole.builder()                        // no .id(...)
```

`@MapsId` means Hibernate *will* derive the key at flush, so this is valid JPA.
The problem is the in-memory `HashSet<UserRole>` before that happens.
`UserRole` is `@EqualsAndHashCode(onlyExplicitlyIncluded = true)` with only
`id` included, so two unflushed manual assignments both have `id == null`, are
`equals`, and hash identically:

```
add(A) = true
add(B) = false   <-- second manual grant, silently discarded
size   = 1
```

There is a second failure from the same root. `id` is mutated from `null` to a
real key at flush, **while the object is sitting in the HashSet** — so it lands
in the wrong bucket:

```
before flush: contains(C) = true
after  flush: contains(C) = false
after  flush: remove(C)   = false     <-- revokeManualRole cannot remove it
```

**Today this is latent, not live**, because `grantManualRole` performs exactly
one `add` per transaction and assignments loaded from the database already have
their ids. It goes live the moment two grants share a transaction — which is
exactly what a "grant these roles to this user" bulk endpoint on the new
controller would do.

Fix: set the `@EmbeddedId` in `updateByManualAssignment` the same way
`updateBySynchronization` does. Better still, drop the `@EmbeddedId` from
`equals`/`hashCode` entirely and use a stable business key (`user.id` +
`role.id`), which is the standard remedy for mutable-key entities in a `Set`.

### 3.4 One missing seed row breaks every login in the system — high

`service/UserService.java:164`

```java
if (!missingRoleCodes.isEmpty()) {
    throw new IllegalArgumentException("The following automatically resolved roles do not exist ...");
}
```

`STANDARD_USER` is resolved for *every* user (`UserService.java:106`). So a
single missing row in `stat.lr_roles` rejects **every login**. Worse, that
`IllegalArgumentException` propagates into
`LrAuthenticationProvider.java:140`'s catch-all, which reports it as
`"LDAP returned incomplete user data"` — a total outage that blames the wrong
component. A deployment can pass every smoke test that does not include a login
and then fail completely.

There is a live variant of this that gets worse with your change.
`normalizeRoleCodes` uppercases every code before the `IN` lookup, but
**Postgres `=` is case-sensitive**. If `lr_roles.code` holds `Standard_User`
rather than `STANDARD_USER`, `findAllByCodeIn(['STANDARD_USER'])` returns
nothing and every login fails with the message above. Worth one query before
you touch anything:

```sql
SELECT code FROM stat.lr_roles WHERE code <> upper(code);
```

Split the failure by *when it is knowable*:

- **Configuration errors fail at startup** — validate that the codes the
  application names (`RoleCodes.*`) exist in `lr_roles`, and refuse to boot
  otherwise, at the moment a human is watching the deploy.
- **Data errors log and skip** — a rule pointing at a role that is missing,
  inactive or not `syncAssignable` should cost one user one role, never
  everyone's ability to log in.

### 3.5 CAPTCHA runs after authentication — high

`controller/AuthController.java:45-65`: authenticate against LDAP → verify
CAPTCHA → issue JWT.

A script can therefore hammer LDAP with credential guesses and ignore the 401,
never reaching the CAPTCHA. **The CAPTCHA protects nothing.** In an Active
Directory environment unthrottled password guessing does more than waste
cycles — it **locks out real accounts**, which is a denial-of-service against
your own users that needs no valid credentials to run.

Secondary effect: `synchronizeUser` runs inside the provider, so a user who
passes LDAP and then fails the CAPTCHA is still created in the database, still
has roles synchronised, and still gets `last_logged_in` stamped.

Move the CAPTCHA check before `authenticationManager.authenticate()`.

> **This has a frontend consequence.** The CAPTCHA is single-use, so after
> reordering, a wrong password consumes the challenge and the client must fetch
> a fresh one on any non-2xx from `/api/auth/login`. Note this was *already*
> required before the reorder — under the current order, a correct password
> with a wrong CAPTCHA answer consumes it just the same. The reorder only
> widens the window.

Also in that block: when `isCaptchaRunning()` returns anything other than
`"UP"`, the CAPTCHA is bypassed entirely and only a `WARN` is logged. That is a
deliberate availability-over-strictness trade, but it is currently a buried
constant. Make it a config flag so it is a decision rather than an accident.

### 3.6 `assignedBy` is caller-supplied — high (becomes live with the new controller)

`UserService.grantManualRole(userId, roleCode, assignedBy)` takes the actor as
a plain parameter. If `UserRoleController` binds that from the request body,
the audit field is forgeable — an admin can attribute their own grant to
someone else. Source it from `SecurityContextHolder` inside the service (or a
small `CurrentUser` helper) and never accept it over the wire.

### 3.7 No audit trail, and revocation destroys the evidence

`lr_user_roles` records `manual_assigned_by` / `manual_assigned_at`, but
`UserRole.clearManualAssignment()` NULLs both, and if no source remains the row
is deleted outright. So a revoke erases **the revocation and every grant that
preceded it**. The table answers "who has what" and structurally cannot answer
"what happened". For a system where the interesting question during an incident
is "who gave this person admin and when", that gap matters.

An append-only `stat.lr_user_role_audit` fixes it. Store `role_code` and
`username` as text with no FK on `user_id`, so history survives deletion of the
user or role it describes.

### 3.8 The full `memberOf` list goes into the JWT — medium

`AuthController.java:81` copies every directory group into the token. In a
large AD a user can be in dozens; the token is sent on every request and lands
in a header with a server-side size cap (nginx defaults to 8 KB). This is a
latency cost on every call, a hard failure for heavily-grouped users, and it
hands the client your directory structure. Drop the claim — `memberOf` is
already persisted and the backend does not read it from the token.

While in that file: the `roles` claim is a login-time snapshot, but
`JwtRequestFilter` re-reads authorities from the database on each request. A
role revoked mid-session stops working server-side immediately while the token
keeps asserting it. Any UI gating on the claim will render menu entries that
403. Treat claims as advisory/first-paint only and give the frontend a
`GET /api/auth/me` to read.

### 3.9 Lower severity

| # | Where | Issue |
|---|---|---|
| a | `UserService.extractCn:292` | Splits the DN on `,` with no escape handling. `CN=Smith\, John,OU=…` yields `Smith\` and the rule never matches. RFC 4514 permits escaped commas. |
| b | `lr_users` | `username` has no unique constraint (only `employee_id` is `nullable=false`, and neither is `unique`). `loadUserByUsername` and `findByEmployeeId` return `Optional` — duplicates throw `IncorrectResultSizeDataAccessException` on **every authenticated request**, not just at login. Realistic path to a duplicate: an employee leaves and their username is reissued. |
| c | `lr_roles` | `code` has no unique constraint in the mapping; `findByCode` has the same exposure. |
| d | `lr_user_roles` | No index on `role_id`. "Who holds ADMIN?" is a sequential scan — and the last-admin guard in §5 runs exactly that query on every revoke. |
| e | `LrAuthenticationEntryPoint:35` | `new ObjectMapper()` per 401 — rebuilding an expensive, thread-safe object per rejected request. Inject the shared bean. |
| f | `LrAuthenticationEntryPoint:32` | `"Authentication Failed " + authException.getMessage()` leaks why the token was rejected. Log it; return a generic message. |
| g | `LrAuthenticationProvider` | `AuthenticationServiceException` (LDAP unreachable/timeout) surfaces as 401 via the entry point. "Invalid credentials" and "directory is down" are different problems; the second should be 503 so users stop retrying and monitoring notices. |
| h | `JwtRequestFilter` + `JwtUtil` | The token is fully parsed and signature-verified **three times per request** — `extractUsername`, then `validateToken` → `extractUsername` again, then `isTokenExpired` → `extractExpiration`. Parse once, pass the `Claims` around. |
| i | `JwtRequestFilter:83` | `catch (Exception e)` around principal loading turns any DB or mapping failure into a silent unauthenticated request and then a misleading 401. |
| j | `UserService:76-77` | `resolvedRoleCodes` / `synchronizedRoles` logged at INFO on every login. Debug-level at most. |
| k | `UserService.synchronizeUser` | `userRepository.save(user)` runs twice for a new user. Harmless inside one transaction, but the first save exists only to obtain an id — worth a comment saying so. |
| l | `User.memberOf` | `@ElementCollection` with a `List` and no `@OrderColumn` is a bag: `clear()` + `addAll()` deletes and reinserts every row on every login even when nothing changed. Use a `Set`, or diff before writing. |
| m | `UserService.synchronizeUser` | Two concurrent first-logins for the same new user both see `findByEmployeeId` empty and both insert. With (b) fixed this is a constraint violation on one of them; without it, two rows. Catch and retry, or add the constraint and let one login fail. |
| n | `UserService.revokeManualRole` | No guard against removing the last `ADMIN` or an admin revoking their own `ADMIN`. Both end with the admin screens reachable by nobody and `lr_user_roles` needing hand-editing in production. See §5. |
| o | `AuthController:94` | `@AuthenticationPrincipal` parameter on `/validate` is unused. |

### 3.10 The JVM default locale on this machine is `tr_TR` **[verified]**

Not a bug in the reviewed files — `UserService` passes `Locale.ROOT`
consistently, which is correct. Flagging it because it makes a whole class of
latent bug live in code I cannot see here: any `toUpperCase()` / `toLowerCase()`
/ `String.format()` **without an explicit locale** does Turkish casing on this
machine and possibly on the server.

```
"ILETISIM".toLowerCase()  →  "ıletısım"     (tr_TR default)
```

Role codes, header names, enum parsing and SQL identifiers all break in ways
that only reproduce on Turkish-locale machines. Worth a grep across the real
repository for no-arg `toLowerCase()` / `toUpperCase()`, and worth pinning
`-Duser.language=en -Duser.country=US` on the server JVM.

---

## 4. Design — rules in the database

### 4.1 The problem that must be solved first: Turkish casing **[verified]**

This is the one that will silently defeat the whole feature, so it comes before
the schema.

`resolveRoleCodesFromMemberOf` compares
`cn.toLowerCase(Locale.ROOT).contains(cnPart.toLowerCase(Locale.ROOT))`. Today
both operands are the *same Java string literal* passing through the *same
expression* in the *same JVM*, so it works by coincidence. Move one side into
the database, where a human types it, and the coincidence is gone.

`"İletişim Kanalları Servisi".toLowerCase(Locale.ROOT)` is **27 code points,
not 26** — `İ` (U+0130) lowercases to `i` + U+0307 COMBINING DOT ABOVE:

```
U+0069 U+0307 U+006C U+0065 U+0074 ...
      ^^^^^^ combining dot above
```

Measured against the four ways an administrator would plausibly type that group
name into a rule editor:

| Typed into the rule | Matches? |
|---|---|
| `İletişim Kanalları Servisi` (byte-exact copy) | ✅ |
| `İLETİŞİM KANALLARI SERVİSİ` (caps) | ❌ |
| `iletişim kanalları servisi` (lower-case, correct Turkish letters) | ❌ |
| `Iletisim Kanallari Servisi` (ASCII-ised) | ❌ |

Three of four fail, **including the most natural one**. A rule that never fires
produces no error anywhere — no exception, no log line, just a user who quietly
does not get their role.

Switching to a Turkish locale does not fix it, it moves the failure:

```
"İ".toLowerCase(tr)          → "i"          ✅ fixed
"KANALLARI".toLowerCase(tr)  → "kanalları"  ✅ fixed (dotless)
"ILETISIM".toLowerCase(tr)   → "ıletısım"   ❌ now English/ASCII text breaks
```

Turkish has two distinct letters here (`i`/`İ` and `ı`/`I`) and **no locale
lowercases both correctly** for mixed Turkish/ASCII text.

**Resolution: fold the distinction away for comparison purposes only.** A
`LdapNameNormalizer` maps `İ`, `I`, `ı`, `i` and a stray U+0307 all to `i`,
lowercases the rest with `Locale.ROOT`, trims, and collapses internal
whitespace. All four rows above then match.

The cost, stated plainly: two group names differing *only* in dotted vs dotless
`i` would collide. That is the same class of trade as case-insensitivity
itself, and negligible for directory group names against the certainty of an
admin typing in capitals. The fold applies **only to `i`** — it is not an ASCII
fold, so `ş`, `ğ`, `ç`, `ö`, `ü` are preserved and `Öğrenci` stays distinct
from `Ogrenci`.

Two design consequences:

- The table stores **both** `match_value` (the admin's exact text, display
  only) and `match_key` (the normaliser's output, **the only field ever
  compared**).
- **Never compare `lower(match_value)` in SQL.** Postgres's `lower()` and this
  normaliser do not agree on Turkish input. Normalising in exactly one place is
  the point of the design.

### 4.2 Substring matching is granting access by accident **[verified]**

The current rule engine uses `contains` for *every* rule. With a plausible
short rule:

```
rule["Servisi"]  vs  "İletişim Kanalları Servisi"   → true
rule["Servisi"]  vs  "Bilgi Teknolojileri Servisi"  → true    ← unintended
rule["Servisi"]  vs  "Risk Yönetimi Servisi"        → true    ← unintended
```

Today there is one rule and it happens to be a full CN, so nothing is broken.
Once admins can add rules through a UI, "match anything containing this word"
is a foot-gun that hands out roles silently.

Default to `EXACT`, keep `CONTAINS` as an explicit per-rule opt-in for
directories with inconsistent naming.

### 4.3 Schema

```sql
CREATE TABLE stat.lr_role_sync_rules (
    id          bigserial     PRIMARY KEY,
    role_id     bigint        NOT NULL REFERENCES stat.lr_roles(id) ON DELETE CASCADE,
    match_type  varchar(20)   NOT NULL DEFAULT 'LDAP_CN',
    match_mode  varchar(20)   NOT NULL DEFAULT 'EXACT',
    match_value varchar(512)  NOT NULL,   -- as typed; display only
    match_key   varchar(512)  NOT NULL,   -- normalised; the ONLY compared field
    active      boolean       NOT NULL DEFAULT true,
    description varchar(500),
    created_by  varchar(255)  NOT NULL,
    created_at  timestamptz   NOT NULL DEFAULT now(),
    updated_by  varchar(255),
    updated_at  timestamptz,
    CONSTRAINT uq_lr_role_sync_rules UNIQUE (match_type, match_mode, match_key, role_id),
    CONSTRAINT ck_lr_role_sync_rules_type CHECK (match_type IN ('LDAP_CN','LDAP_DN','ORGANIZATION')),
    CONSTRAINT ck_lr_role_sync_rules_mode CHECK (match_mode IN ('EXACT','CONTAINS','STARTS_WITH'))
);

CREATE INDEX ix_lr_role_sync_rules_active ON stat.lr_role_sync_rules (active) WHERE active;
CREATE INDEX ix_lr_user_roles_role_id     ON stat.lr_user_roles (role_id);   -- §3.9(d)
```

Seeding the existing rule — note the `match_key`, which is **not** what you
would guess:

```sql
INSERT INTO stat.lr_role_sync_rules (role_id, match_type, match_mode, match_value, match_key, created_by)
SELECT r.id, 'LDAP_CN', 'EXACT',
       'İletişim Kanalları Servisi',
       'iletişim kanallari servisi',      -- ş preserved, but 'kanallari' has a DOTTED i
       'SYSTEM_MIGRATION'
  FROM stat.lr_roles r WHERE r.code = 'ILETISIM_KANALLARI';
```

That `kanallari` is the normaliser's output, not a typo. It is exactly the kind
of value that must be produced by running the normaliser rather than by hand —
see §7.

### 4.4 Rule evaluation

```
resolveSynchronizedRoles(ldapAuthResponse):
    keys ← memberOf → extractCn → normalizeKey        (Set, one pass)
    rules ← ruleRepository.findAllActiveWithRole()    (one query, tiny table)

    roles ← { STANDARD_USER }                          baseline, stays a code constant
    for rule in rules:
        if rule matches keys (EXACT: O(1) set hit; CONTAINS/STARTS_WITH: scan):
            if !role.active         → log once, skip
            else if !role.syncAssignable → log once, skip
            else roles += role.code
```

Deliberate choices:

- **No cache.** One indexed query against a table with single-digit row counts,
  on an operation that already makes an HTTP round-trip to a directory server.
  A cache here buys nothing and costs an invalidation bug. Revisit only if a
  profile says so.
- **`STANDARD_USER` stays a Java constant**, not a rule. It is a system
  invariant ("every authenticated user is at least a standard user"), not
  policy, and making it deletable through a UI is a way to break every login.
- **Guard at both ends.** Reject rule creation targeting a role that is not
  `sync_assignable` (write time), *and* skip such roles during resolution (read
  time). Either alone is insufficient: write-time guards do not cover rows that
  predate the guard or are edited by hand, and read-time guards alone give no
  feedback to the admin creating the rule.

### 4.5 The privilege-escalation boundary

Worth stating explicitly because it is enforced in two places that must agree:

> If `ADMIN` is not `sync_assignable`, and rule creation refuses to target a
> role that is not `sync_assignable`, then **no LDAP rule anyone can write ever
> grants administrator access.**

Remove either half and membership of a directory group becomes a path to
administration — and directory group membership is typically managed by a
different team than this application.

This is why the disposition of `USERNAME_ROLE_CODE_RULES` (the four hardcoded
admins) is a real decision and not a mechanical port — see §9.

---

## 5. Design — `UserRoleController`

One controller as you asked, `/api/admin/user-roles`, every handler
`@PreAuthorize("hasRole('ADMIN')")`.

**Manual role assignment**

| Method | Path | Notes |
|---|---|---|
| `GET` | `/users?query=&page=&size=` | paged; search username / fullName / employeeId |
| `GET` | `/users/{userId}` | assignments + `memberOf` + `lastLoggedIn` |
| `PUT` | `/users/{userId}/roles/{roleCode}` | grant; `assignedBy` from `SecurityContext`, never the body (§3.6) |
| `DELETE` | `/users/{userId}/roles/{roleCode}` | revoke |
| `GET` | `/roles` | catalogue with `active` / `syncAssignable` / `manualAssignable` |

**LDAP rules**

| Method | Path | Notes |
|---|---|---|
| `GET` | `/sync-rules` | shows `matchValue` **and** the normalised `matchKey` |
| `POST` | `/sync-rules` | normalises, validates target role is `sync_assignable` |
| `PUT` | `/sync-rules/{id}` | re-normalises on edit |
| `DELETE` | `/sync-rules/{id}` | |
| `GET` | `/sync-rules/observed-groups` | distinct CNs across `lr_users.member_of`, with normalised keys |
| `POST` | `/sync-rules/preview` | dry-run: which known users this rule would match, **without saving** |
| `POST` | `/sync-rules/reapply` | replay all rules over persisted `member_of` for every user |

Three of those are not obvious and each earns its place:

- **`observed-groups`** — a rule editor with a free-text box produces typos that
  fail silently (§4.1). Offering the CNs the application has actually seen turns
  rule authoring into picking from a list. Caveat to surface in the UI: it shows
  what *this application* has observed, so only groups belonging to users who
  have logged in at least once appear.
- **`preview`** — the only feedback loop for a rule that does not match. Without
  it an admin saves a rule and finds out it was wrong days later, from a user
  complaint.
- **`reapply`** — without it, a rule change lands only as each user next logs
  in (§2). Since `member_of` is persisted, replaying is cheap and makes the
  admin action feel like it did something.

**Guards** (all of which need a small `@RestControllerAdvice` mapping two new
exception types, scoped narrowly so it cannot shadow existing global advice):

| Condition | Status |
|---|---|
| Revoking your own `ADMIN` | 409 |
| Revoking the last `ADMIN` holder | 409 |
| Rule targets a role that is not `sync_assignable` | 400 |
| Granting a role that is not `manual_assignable` or not `active` | 400 |
| Unknown user / role / rule | 404 |

409 rather than 400 for the lockout guards is deliberate: the request is
well-formed and would be legal against a different system state.

**DTOs to add** under `dto/user/`: `RoleSyncRuleRequest` / `RoleSyncRuleResponse`,
`UserSummaryResponse`, `UserDetailResponse`, `RoleResponse`,
`SyncRulePreviewResponse`. Existing `UserRoleState` is fine for grant/revoke
responses and I would leave it alone.

---

## 6. Plan

Ordered by dependency. Phase 0 is not optional — it is what makes Phase 3 safe.

**Phase 0 — make enforcement real** (blocks everything after it)
1. Rewrite `LrUserDetails` against the JPA model, filtering on `Role.isActive()`.
2. Add the missing `UserDetailsService` implementation with a fetch-join on
   `roleAssignments` → `role`.
3. `@EnableMethodSecurity` on `SecurityConfig`; add an `AccessDeniedHandler`
   returning the same JSON shape as the 401s, so the frontend parses one format.
4. Fail-closed LDAP check (§3.1).

**Phase 1 — schema**
5. `sql/V1` — unique constraints on `lr_users.username` and `lr_roles.code`
   (each preceded by its duplicate-check query, run first, not blindly applied),
   index on `lr_user_roles.role_id`, and the `lr_roles.code` casing check
   from §3.4.
6. `sql/V2` — `lr_role_sync_rules` + seed, `lr_user_role_audit`.

**Phase 2 — rule engine**
7. `LdapNameNormalizer` + a runnable verification harness (§7).
8. `RoleSyncRule` entity, repository, `RoleSyncRuleService`.
9. Rewrite `UserService.resolveRoleCodesFromMemberOf` to read rules from the
   database; delete `LDAP_CN_ROLE_CODE_RULES`; convert the missing-role throw
   into log-and-skip plus a startup validator.
10. Fix `UserRole.updateByManualAssignment` (§3.3).

**Phase 3 — the controller you asked for**
11. `UserRoleController` + DTOs + lockout guards + narrow exception advice.
12. Audit writes on every grant/revoke, and on sync **only when synchronisation
    actually changed something** — most logins produce no diff, so the table
    grows with events rather than with traffic.

**Phase 4 — adjacent fixes**
13. CAPTCHA ordering (§3.5) — coordinate with the frontend change.
14. Drop `memberOf` from the JWT; add `GET /api/auth/me`.
15. The §3.9 list.

Phases 0–3 are one coherent change and I would not split them across deploys —
Phase 1's SQL must be applied *before* the new build starts, since the startup
validator will refuse to boot without the seed rows.

---

## 7. What I verified by running it

Findings marked **[verified]** were confirmed on JDK 21.0.8, not reasoned about.
That distinction earned its keep twice: it caught the `kanallari` dotted-i in
§4.3 that I first wrote wrong by hand, and it killed a false positive in §8.

If we proceed, I would check in `verification/NormalizerCheck.java` — a plain
`main` with assertions, no JUnit, no build tool, non-zero exit on failure — so
the Turkish behaviour is a repeatable check rather than a claim in a document.
It is the cheapest possible regression net for the one behaviour in this change
that fails **silently** when broken.

**Process note worth keeping:** reading the code found the combining-dot
problem in §4.1. Only *running* it found that the all-caps and correctly-typed-
lowercase variants both fail too — which is the difference between a rule
engine that works and one that quietly does not.

---

## 8. Things I checked that turned out fine

Recording these so nobody spends time on them again:

- **`@Builder.Default` + `@NoArgsConstructor` on `User`.** This combination is a
  well-known Lombok trap — historically the no-args constructor skipped the
  field initialisers, which would make `User::new` in `synchronizeUser` produce
  null collections and NPE on `user.getMemberOf().clear()` for every new user's
  first login. **Tested against Lombok 1.18.30 and 1.18.42: both correctly
  initialise `memberOf` and `roleAssignments`.** Fixed upstream long ago. Not a
  bug — I was about to report it as one.
- **`ck_lr_user_roles_manual_metadata`-style unparenthesised CHECK constraints**
  (if present in your DDL): `AND` binds tighter than `OR` in SQL, so the common
  form already means what it looks like it means.
- **The two-source sync/manual invariant** in `User.synchronizeRolesFromDirectory`
  is correct, including the `iterator.remove()` when neither source remains.
  Do not refactor it casually — it is easy to break, produces no error when
  broken, and the symptom is quietly wrong access. It is the single behaviour
  in this codebase most worth a test.

---

## 9. Open decisions

These change the shape of the work, so I would like your call before building.

**1. The four hardcoded admins (`USERNAME_ROLE_CODE_RULES`).**
Changing who administers the system currently requires a release. Two ways out:

- **(a) Delete username rules entirely.** Nothing in code or the database ever
  grants a role by username; `ADMIN` is granted by a human through the new API.
  Preserves the §4.5 escalation boundary completely. Needs a one-time bootstrap
  SQL insert to break the chicken-and-egg (no admin exists, so nobody can use
  the UI to create one), which requires the target user to have logged in at
  least once.
- **(b) Move them into `lr_role_sync_rules` as `match_type = 'USERNAME'`.**
  Preserves today's behaviour exactly and makes it editable at runtime. But it
  punches a hole in §4.5: anyone who can edit rules can grant themselves
  `ADMIN` by adding a username rule.

I recommend **(a)**. It is the reason `sync_assignable` exists on `lr_roles`.

**2. How much of §3 should I fix in this change?**
My default is Phases 0–3 (everything that makes the feature work and be safe),
report-only on Phase 4. Say if you want the CAPTCHA reorder and the JWT changes
included — the CAPTCHA one needs a coordinated frontend change, which is why I
have it separate.

**3. Authorization granularity.**
I am planning plain `@PreAuthorize("hasRole('ADMIN')")`. A role→permission
mapping table is the more flexible design, but with three roles it is three
extra tables and a caching problem in exchange for flexibility you do not yet
need. If you expect the role set to grow substantially — and *lateral*
functional roles rather than vertical tiers — say so now, because retrofitting
it later means touching every handler.
