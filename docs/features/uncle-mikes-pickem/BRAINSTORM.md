# Brainstorm: Uncle Mike's NFL Pick Em

**Date**: 2026-11-12
**Inputs**: `docs/RULES.md` (with Dom's answers to the open edge cases, 2026-11-12), `docs/features/nfl-data-sources/RESEARCH.md`, `reeses-playoff-challenge`, `smirnoff-league`, `derby`, `xomware-infrastructure`
**Status**: Recommendation ready, open questions for Dom at the bottom

## What the reference repos already settle

- **Google sign-in exists.** The shared `xomware_users` pool has a `Google` IdP (`xomware-infrastructure/terraform/cognito_google_idp.tf`) plus the PreSignUp link trigger. Pick Em needs only a new app client in `xomware-infrastructure/terraform/cognito.tf`. If the consent screen should say "Uncle Mike's" and not "Xomware", copy the `GoogleSmirnoff` OIDC provider pattern (own Google Cloud project, same `sub`).
- **SES is half there.** `xomware-infrastructure/terraform/ses.tf` only verifies the address `noreply@xomware.com`. Smirnoff has the full domain identity, DKIM, MAIL FROM, config set and bounce/complaint SNS in its own `ses.tf`. Copy Smirnoff's.
- **Stack is the derby-style monorepo** (`frontend/` Next.js static export, `backend/` Python 3.12 Lambdas, `infrastructure/` Terraform). This is a pool app, so it gets that template, not the Angular three-repo one.

### Reuse

- Smirnoff's CI: `deploy-backend.yml` with the layer rebuild on `common/**` changes, `verify-layer`, and `wait-for-terraform.yml` holding deploys until the apply on the same commit lands (Smirnoff #25). Terraform runs only in Actions.
- Smirnoff's mailer: claim-before-send sent log with conditional put, Python-rendered HTML plus text part, `List-Unsubscribe` + one-click headers, HMAC unsubscribe tokens (`backend/lambdas/common/{mailer,unsubscribe,email_prefs}.py`).
- Reese's windowed polling: a fixed `rate()` rule whose handler no-ops outside a window, `force: true` payload for manual runs, a `poll_runs` audit table (`infrastructure/terraform/lambdas_cron.tf`).
- Reese's `payment.ts` profile links. Reese's `nflverse.py` team-code normalization (`LA`/`LAR`, `WAS`/`WSH`).
- Golden fixtures for the scoring rules (Reese's `fixtures/scoring-golden.json` idea).

### Do not copy

- **Reese's manual backend deploy** (local layer build on python3.13, `update-function-code` by hand). Smirnoff solved it.
- **Long-lived AWS access keys as GitHub secrets** (Reese's). Use OIDC deploy roles like Smirnoff's `oidc_deploy.tf`.
- **`authConfigured = false` silently opening every gate** when Cognito env is missing at build (Reese's). Fail the build instead.
- **Public CDN JSON artifacts as the read model** (Reese's `cron_publish_artifacts`). Fine for one public contest. Pick Em groups are private, and members of one group must not be able to fetch another's picks. Read through the Cognito-authorized API.
- **Dual TS + Python evaluators.** Reese's needed client-side scoring for configurable formulas. Pick Em scoring has a few switches but no formulas. Grade in Python only; the client renders server results.
- **The Lambda stub trap**: a Terraform-only push that adds a function leaves it running `lambda_stub.zip`. Keep Smirnoff's runbook note and verify every endpoint live after deploy.

---

## Phase 1: Explore

Data model
- One single table for everything, overloaded PK/SK, two GSIs
- Two tables: global NFL data vs group-scoped app data
- Table per entity (Reese's style: leagues, entries, picks, stat_lines, poll_runs)
- DynamoDB for writes, S3 JSON for read models (standings blobs)
- Store points as facts vs Reese's "points are never a fact" rule
- One pick item per member-week (map of games) vs one item per game pick
- Picks per user global across groups vs per group
- Event-sourced pick log (every change as a row) for disputes
- Organizer settings as one mutable blob vs versioned with an effective week

Grading
- Fixed `rate(2–5 min)` + window gating from the schedule (derby/Reese's)
- EventBridge Scheduler one-off schedules created per kickoff
- Step Functions per game: wait until kickoff + 3h, poll until final
- Grade on ESPN final immediately, mark provisional until nflverse agrees
- Grade only when both agree; alert on disagreement
- Full recompute of group-week on every change vs incremental
- Admin "result override" as an input row, never editing outputs
- Live "if current scores hold" standings during games

Email
- Scheduled sweep over derived due events (Smirnoff)
- Outbox rows written by grading, drained by a mailer
- DynamoDB Streams triggering sends
- SES stored templates vs Python rendering vs MJML build step vs React Email
- GOW buttons as signed GET links vs a confirm page vs a magic-link sign-in
- Digest one email per user across groups vs one per group

Frontend
- Next.js static export, query-param routes (`/group?id=…&week=5`)
- Static export + CloudFront Function rewriting `/g/*` to a shell page
- Next.js SSR via OpenNext on Lambda
- Angular SPA (product-app template)
- Server-rendered HTML from Python Lambdas (no SPA)

Other angles
- Start capturing 2026 lines, injuries and hype signals **now**, so the 2026 replay has the pre-game data ESPN won't serve historically
- Replay as a group setting (virtual clock per group) vs a separate stage
- Haiku write-ups generated once per game on a schedule, shared across groups
- Hype score as a stored, explainable sum of components

---

## Phase 2: Converge

### Decision 1: DynamoDB data model

#### Option 1A: Two tables by writer, single-table inside each

**What**: `pickem-nfl` holds global sports data written only by ingest; `pickem-app` holds everything group-scoped; a small `pickem-ops` holds poll runs and the email sent log with TTL.

**How it works**: Ingest owns `pickem-nfl` and nothing else writes it. Every group screen reads one `pickem-app` partition per group-week. Grading reads `pickem-nfl` and writes derived rows into `pickem-app`.

`pickem-nfl`

| PK | SK | Holds |
|---|---|---|
| `SEASON#2027#W05` | `WEEK` | lockAt (first kickoff, recomputed every tick until it passes), status, gameIds |
| `SEASON#2027#W05` | `GAME#<espnId>` | teams, kickoff, status, scores, winner/tie, `confirmedBy` (espn, nflverse), lines, broadcast, venue, roof, hype components |
| `GAME#<espnId>` | `INFO#injuries`, `INFO#weather`, `INFO#writeup`, `INFO#h2h` | game-page data, each with `fetchedAt` |
| `SEASON#2027` | `STANDINGS` | NFL standings snapshot |

`pickem-app`

| PK | SK | Holds |
|---|---|---|
| `GROUP#g` | `META` | name, ownerSub, season, clock (replay) |
| `GROUP#g` | `RULES#S2027#v<n>` | organizer settings, one version per change: `pickemTie` (`zero` default), `deathTie` (`loss` default), `deathSecondLife` (off), `lock` (`firstKickoff`), fees, pot splits, payment methods + handles. Plus `effectiveWeek`, `changedBy`, `changedAt` |
| `GROUP#g` | `MEMBER#sub` | role (owner/admin/member), display name, joinedWeek, email prefs. GSI1 `USER#sub` / `GROUP#g` for "my groups" |
| `INVITE#code` | `META` | groupId, createdBy, expiresAt, optional email, uses |
| `GROUP#g#S2027#W05` | `PICK#sub` | `{gameId: {team, conf}}`, tiebreak, submittedAt |
| `GROUP#g#S2027#W05` | `GOW` | gameId, chosenBy (sub or `auto`), chosenAt |
| `GROUP#g#S2027#W05` | `RESULT` | derived: per-member weekly score, yearly week score, GOW points, place, winners, `rulesVersion`, input hash |
| `GROUP#g#S2027` | `DEATH#entryId` | ownerSub, label, `{week: team}`, `livesLeft`, status, eliminatedWeek |
| `GROUP#g#S2027` | `STANDINGS` | derived: season table with yearly total and GOW total (the tiebreaker) |
| `GROUP#g#S2027` | `PAY#sub#kind[#entryId]` | amount owed, paid, markedBy, markedAt |
| `GROUP#g` | `OVERRIDE#<espnId>` | admin result override (input) |

**Pros**:
- One `Query` per screen: the group-week partition is picks, GOW and result together
- One pick item per member-week makes "confidences 1..N unique" a single validated `PutItem`
- One item per death entry makes "team used once" and lives a check on one item
- Global data is written once and read by every group; no per-group copies of games
- Blast radius splits along the real seam: an ingest bug cannot corrupt picks

**Cons / Risks**:
- Single-table key design inside `pickem-app` is less obvious than Reese's per-entity tables
- `STANDINGS` as one item caps around 400 KB. That is thousands of members, so not a real limit here

**Best if**: groups are small (5–100), and almost every read is scoped to one group-week. That is this app.

#### Option 1B: Table per entity (Reese's shape)

**What**: `groups`, `rules`, `members`, `invites`, `picks`, `death_entries`, `results`, `payments`, `games`, `poll_runs`.

**How it works**: Each table keyed naturally, GSIs where needed. Screens fan out across 3–4 tables.

**Pros**:
- Obvious to read; matches what Dom already maintains
- Per-table TTL, PITR and capacity settings

**Cons / Risks**:
- Group-week page needs picks + GOW + results + games + rules: five queries, no transactional read
- More Terraform, more IAM, more table-name env vars per Lambda

**Best if**: access patterns are not known up front. They are known here.

#### Why the rules are versioned, not one blob

Tie handling and second life are now organizer settings, and regrade is a full recompute. If the rules sat in one mutable blob, flipping "pick-em tie" in Week 12 would silently rescore Week 5's tie on the next regrade, and so would turning second life on mid-season for every past death-pool loss. So each change writes a new `RULES#` version with `effectiveWeek`, and grading uses the version in force for that week. `RESULT.rulesVersion` records which one applied.

Default: a change takes effect from the next unlocked week. Changing an already-graded week is a separate, explicit "apply retroactively and regrade" action, logged with `changedBy`.

Second life turned on after Week 1 is a real decision for Dom (see questions). It can't be made retroactive without reviving entries already eliminated.

#### Materialized vs computed

Keep Reese's principle in the form that fits: **grading is a pure function**, `grade_week(picks, finals, gow, overrides, rules) -> RESULT`, and season standings fold over the week results. Outputs are materialized for fast reads, but they are a cache. Nobody edits them. Corrections go in as inputs (`OVERRIDE#`, a new `RULES#` version), followed by a regrade. `RESULT.inputHash` covers the rules version too, so a regrade skips unchanged weeks and detects when a correction changed a winner.

Scoring needs the whole week. A non-submitter's weekly score is the lowest submitter's weekly score minus 1, and their yearly week score is the lowest submitter's **yearly** week score (GOW double or negative included) minus 1. Those two minimums can come from different people. Grade the group-week as a unit, never per pick.

The death pool is a fold over weeks in order: per entry, a loss, tie-as-loss or missed pick takes a life, and zero lives means eliminated. Then the "everyone eliminated this week comes back" check runs. It has to be a fold, because Week 9's state depends on Week 8's.

**Recommendation: 1A, with versioned `RULES#` items.**

---

### Decision 2: Scoring and grading pipeline

#### Option 2A: One windowed tick plus a confirmation gate

**What**: A single `cron_tick` Lambda on `rate(2 minutes)` that decides what to do from the schedule in `pickem-nfl`.

**How it works**: Every tick computes the window: any game between kickoff minus 15 min and confirmation. Inside it, the tick polls the ESPN scoreboard for live state. Outside it, it does slower work only on the hour: schedule/line refresh, injuries, weather, hype scoring, Haiku write-ups. A game gets `confirmedBy: [espn]` on `STATUS_FINAL` and grades **provisionally**. It becomes **confirmed** when nflverse `games.csv` agrees on score and result (`espn` column joins exactly). A week is final when every non-void game is confirmed, and only then do result emails go out. On disagreement the week stays provisional and the admin gets alerted. A game ESPN marks final that nflverse hasn't confirmed after 6 hours is flagged, not finalized.

**Pros**:
- One function, one schedule, one audit table; the derby/Reese's pattern Dom already runs
- Live scores for the UI come for free during windows
- Two-source confirmation before emails means no "you won" email that gets retracted
- ESPN outage (August 2026) degrades to nflverse finals; grading still completes, only live scores stop

**Cons / Risks**:
- ~260k invocations a year, mostly no-ops. Free tier covers it
- Result emails wait on nflverse lag (5–120 min seen in the research). Monday-night results land late Monday or early Tuesday

**Best if**: you want one moving part. Recommended.

#### Option 2B: EventBridge Scheduler one-offs per game

**What**: The weekly schedule refresh creates a one-time schedule per game at kickoff + 3h, which polls until final.

**Pros**:
- Zero idle invocations

**Cons / Risks**:
- A flexed or postponed game leaves a stale schedule that must be found and moved
- Scheduler state lives outside DynamoDB and is invisible to the replay clock
- Still needs a periodic job for lines, injuries, weather and reminders, so it doesn't remove the tick

**Best if**: invocation count mattered. It doesn't.

#### Pipeline details, either option

- **Lock is enforced server-side** in `picks_set` and `death_set`: reject when `clock.now(group) >= lockAt`. `lockAt` comes from the group's rules version (default: `WEEK.lockAt`). Re-read it on every write; never cache it at season start. Week 18 kickoff times are set only after Week 17, and a flex can move the first kickoff earlier.
- **Regrade is idempotent**: recompute the group-week from inputs, write `RESULT` only if `inputHash` changed, then refold `STANDINGS` and the death pool. Admin "regrade week" and "regrade season" are the same function.
- **Stat corrections**: NFL final scores almost never change. What does change is ESPN briefly showing a wrong final, or an admin override. Both are handled by provisional-until-confirmed plus override-then-regrade. If a regrade flips a week winner or revives or eliminates a death entry after emails went out, send a single "correction" email. The claim log keys it as a new event (`result#W05#v2`).
- **Clock**: every `now()` goes through `common/clock.py`, which returns the group's virtual time when `META.clock` is set. That is the replay mode: a 2026 replay group sits on season 2026 data with an admin "advance to" control. Grading only sees games final as of the group's clock. This lets replays run in prod against real email, with no second stack.
- **Capture 2026 now.** ESPN serves historical scores and closing lines, but not historical injuries, weather forecasts or pre-game hype state. Turn on the ingest in capture-only mode for Weeks 11–18 so replay has real pre-lock game pages.
- Haiku write-ups: generated per game on Wednesday and refreshed Saturday, stored on `INFO#writeup`, shared across every group. ~272 calls a season.

**Recommendation: 2A.**

---

### Decision 3: Email pipeline

#### Option 3A: Derived-events sweep with a claim log (Smirnoff pattern)

**What**: The tick calls `mailer.run(now)`, which derives every due email from current state and claims each one before sending.

**How it works**: Due events are pure functions of state. A week went final, so `result#W05`, `winner#W05`, `lifeLost#W05#entry` and `death#W05#entry` are due. Lock is 24h/2h away and you have no picks, so `remind24#W05` and `remind2#W05` are due, and the reminder warns that a missing death pick eliminates the entry. GOW is unpicked and selection opens, so `gowpick#W05` is due. Each is claimed with a conditional put on `MAIL#<sub>#<group>#<eventId>` in `pickem-ops` before sending. A failed send flips to `failed` and is retried next tick. A crash between claim and send drops one email rather than risking a duplicate.

**Pros**:
- Already written and tested in Smirnoff; regrades and replays cannot double-send
- Time-based reminders and state-based results use one mechanism
- Replay works for free: due events derive from the group clock

**Cons / Risks**:
- Up to one tick (2 min) of latency. Irrelevant for these emails
- Derivation must stay cheap; scanning every group every tick should be scoped to groups with a week in a live phase

**Best if**: you want one mechanism. Recommended.

#### Option 3B: Outbox rows written by grading, drained by a stream

**What**: Grading and admin actions write `OUTBOX#` items; a DynamoDB Stream Lambda sends them.

**Pros**:
- Immediate sends; explicit record of every intended email

**Cons / Risks**:
- Reminders still need a scheduled sweep, so it's two mechanisms
- Regrade must know whether to write outbox rows again. That is the double-send bug the claim log already prevents

**Best if**: sends must be instant. They don't need to be.

#### Templating

Render in Python (Jinja2 with inline styles, table layout, plus a plain-text part), as Smirnoff does. SES stored templates are Handlebars with weak logic and live in Terraform, so a copy change becomes an infra apply. Add a golden-HTML snapshot test per template and an admin-only `GET /email/preview?kind=…` that renders against real group data.

#### GOW one-click links: the trap

**Corporate mail scanners (Outlook Safe Links, Mimecast, Proofpoint) fetch every link in an email.** If the three buttons are state-changing GETs, a scanner "chooses" all three and the last one wins. The buttons must not mutate on GET.

Token and flow:
- Token is `payload.mac`: HMAC-SHA256 over `{groupId, season, week, gameId, adminSub, exp}` with an SSM SecureString. Same construction as Smirnoff's `unsubscribe.py`, with a different secret.
- `exp` = the GOW deadline (see the questions below). Expired tokens show "selection closed" plus the current GOW.
- The button opens `/gow?t=…`, a static page that shows the game and a single **Confirm** button which POSTs the token. No sign-in needed; the token is the credential, scoped to one admin, one group-week and one game. That is two clicks, not one, and it is the price of scanner safety.
- Not single-use: an admin can change their mind until the deadline. The POST is idempotent (`SET gameId`), and the write records `chosenBy` and `chosenAt`. Replaying a token after another admin chose a different game overwrites it. Last write wins before the deadline, and the audit trail shows who did it.
- "See all games" links to the signed-in admin page for the week.
- If nobody chooses by the deadline, the tick sets `GOW = top hype score, chosenBy: auto` and emails members the GOW.

#### Unsubscribe and preferences

- Per-member, per-type prefs on `MEMBER#sub` (result, winner, death, reminders). Smirnoff's tokens plus `List-Unsubscribe-Post` one-click. SES production access requires a working bounce/complaint path; copy Smirnoff's SNS wiring.
- Admin GOW emails are not unsubscribable while the member holds the admin role. The role is the opt-in.

**Recommendation: 3A with Python rendering and confirm-page GOW links.**

---

### Decision 4: Frontend stack

#### Option 4A: Next.js static export, query-param routes

**What**: The Reese's/Smirnoff setup: `output: "export"`, S3 + CloudFront, client-side data fetching from the Cognito-authorized API, with routes like `/group/?id=g&week=5`, `/game/?id=401873052`, `/join/?code=…`, `/gow/?t=…`.

**How it works**: Every page is a static shell. Auth'd data loads client-side. Dynamic segments are query params, because static export cannot prerender unknown `[groupId]` paths. Reese's already works this way (`lib/api/client.ts` passes `leagueId` as a param).

**Pros**:
- Two working precedents, ~$0 hosting, no server to run
- Nothing here needs SEO or server rendering; every page is behind sign-in except `/join` and `/gow`

**Cons / Risks**:
- URLs are less clean (`/group/?id=…`). Cosmetic
- The Next 16 "not the Next.js you know" warning applies; read the bundled docs before writing routes

**Best if**: you want the template Dom already ships. Recommended.

#### Option 4B: Static export + CloudFront Function rewrite for path routes

**What**: Same as 4A, but `/g/<id>/w/<n>` is rewritten at the edge to a shell page that parses `location.pathname`.

**Pros**:
- Clean URLs

**Cons / Risks**:
- Fights Next's router: params come from manual parsing, not `useParams`, and client navigation between shells can break
- One more edge function to test and debug

**Best if**: clean URLs matter. They don't for a private pool.

#### Option 4C: SSR (OpenNext on Lambda)

Rejected: a Node runtime, cold starts and a new deploy shape, for pages that are all auth'd and client-fetched anyway.

**Recommendation: 4A.**

---

## Rules that will bite later

Scoring and timing:

1. **"Monday night game" is not always one game.** Some weeks have two MNF games, Thanksgiving week shifts the slate, and Week 18 has no Monday game. Define the tiebreaker as "total points in the week's last-kicking-off game (latest ESPN kickoff; on a tie in kickoff time, the higher event id)", or let the admin pick it at GOW time.
2. **GOW reveal timing.** Knowing the GOW changes how people assign confidence. If the GOW is chosen after picks open, early submitters are at a disadvantage. The GOW needs to be fixed before picks open (proposed: Tuesday 12:00 ET, admin email goes out Monday night after the week finalizes), or picks can open only once the GOW is set.
3. **Canceled games** (Bills-Bengals 2022 never finished). There's no rule. Options: void, with every pick on that game scoring 0, or everyone gets their confidence. Postponed games delay week finalization, and the week stays provisional until they're played. This fits naturally as another organizer setting beside the tie rules.
4. **"Lowest minus 1" when nobody submits** (a replay group, or a dead week) has no lowest score. Default both the weekly and yearly scores to 0.
5. **Season tiebreaker can itself tie.** Two members with equal yearly totals and equal GOW totals: share the place (the "1*" convention), or a third key? Sharing is the obvious default.
6. **Late joiners.** Does a member who joins in Week 5 take "lowest − 1" for Weeks 1–4? Likely no. `MEMBER.joinedWeek` is in the model for this.

Organizer settings:

7. **Mid-season rule changes** have to be versioned (see Decision 1). Dom needs to say whether a mid-season change is allowed at all, or the rules freeze at the first lock.

Death pool:

8. **Second life interacts with the revive rule.** "If every remaining entry is eliminated in the same week, all of them come back": does an entry that only lost its second life (still alive) count as "remaining"? And do revived entries come back with a life, or with zero? Proposed: only full eliminations count, and revived entries come back with zero spare lives.
9. **Second life and missed picks.** Does a missed pick burn the extra life, or eliminate outright? The rules say missed = eliminated, written before second life existed. Proposed: a missed pick counts as a loss, so it burns the life first.
10. **Lock.** "All picks lock at the first kickoff" means a death pick on a Sunday team locks Thursday. That's fine, but it's stricter than most survivor pools (per-game lock). Confirm it's intended. The data model stores per-game kickoffs either way, so per-game lock is a settings change.

Visibility and groups:

11. **Pick visibility** is unstated. Recommend hidden until lock, visible to the group after lock. Enforce it in the API, not just the UI.
12. **Multi-group picks.** If Dom is in three groups, does he enter picks three times? Recommend per-group picks with "copy my picks from group X". GOW, lock and tie rules are per group, so picks cannot be global.
13. **Co-admins.** Recommend roles owner/admin/member. Admins can do everything except delete the group, transfer ownership or demote the owner. All admins get the GOW email, and the first to choose sets it.

Money:

14. **Venmo ToS bars entry-fee-plus-prize payments** (RESEARCH.md). The app only shows handles, but don't prefill notes like "Pick Em entry".
15. Death-pool entries are paid per entry, so payment rows key on `entryId`, not just `sub`.

---

## Phase 3: Recommendation

| Decision | Pick | Why |
|---|---|---|
| Data model | **1A**: `pickem-nfl` + `pickem-app` (single-table, versioned `RULES#` settings) + `pickem-ops` | One query per group-week screen; atomic pick and death validation; rule changes can't silently rescore past weeks |
| Grading | **2A**: one `rate(2 min)` windowed tick, ESPN provisional → nflverse confirmed, pure regrade under the week's rules version, group clock | One moving part, survives an ESPN outage, replay without a second stack |
| Email | **3A**: derived-events sweep + claim log, Jinja2 in Python, GOW confirm page with HMAC tokens | Smirnoff code already exists; regrades and replays can't double-send; scanner-safe |
| Frontend | **4A**: Next.js static export, query-param routes | Two working precedents; nothing needs SSR |

It depends on one thing: if Dom wants Pick Em on its own domain with its own Google consent branding, that adds the Smirnoff-style second OIDC IdP and a domain SES identity. Neither changes the architecture.

Do first, before the plan is even final: turn on 2026 capture (lines, injuries, weather, hype, gambit crowd %) so Weeks 11–18 of 2026 replay with real pre-game data. Every week of delay is a week of replay data lost for good.

## Questions for Dom

1. GOW timing: is the GOW set before picks open (proposed Tuesday noon ET), or can members pick before the GOW is known?
2. Weekly tiebreaker when there are two MNF games or none (Week 18)?
3. Canceled game: void at 0 for everyone, or full confidence for everyone? Should it be an organizer setting like ties?
4. Can organizers change settings mid-season (from the next week on), or do rules freeze at the first lock?
5. Second life: does a missed pick burn the life or eliminate outright? Does a life-loss count toward "everyone eliminated, all come back"? Can it be turned on after Week 1?
6. Death pool: lock at first kickoff (as written) or per game?
7. Late joiners: penalized for weeks before they joined?
8. Pick visibility before lock: hidden?
9. Domain and branding: `pickem.xomware.com` on the Xomware Google consent screen, or its own domain and IdP like Smirnoff?
10. Is the SES account out of sandbox in us-east-1? (`aws sesv2 get-account --region us-east-1`)
