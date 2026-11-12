# Plan: Uncle Mike's NFL Pick Em (epic)

**Status**: Ready
**Created**: 2026-11-12
**Last updated**: 2026-11-12

## Summary
A confidence pick-em plus survivor pool for private groups at `pickem.xomware.com`. It covers Google sign-in, GOW-weighted yearly scoring, a death pool with an optional second life, a payments ledger the organizer marks by hand, and automated HTML email. The real launch is the 2027 season. Success means the 2026 season replayed in the app reproduces Dom's real standings sheet exactly, and ESPN-only pre-game data (lines, injuries, weather, predictor, crowd %) for 2026 Weeks 10/11–18 sits in S3 before it disappears.

## Approach
Spec is `docs/RULES.md`. Architecture follows `BRAINSTORM.md` recommendations 1A + 2A + 3A + 4A. Data sources follow `docs/features/nfl-data-sources/RESEARCH.md`.

- **1A**: three DynamoDB tables. `pickem-nfl` is written by ingest only. `pickem-app` is single-table and group-scoped, with versioned `RULES#` items. `pickem-ops` holds poll runs and the mail claim log.
- **2A**: one `cron_tick` Lambda on `rate(2 minutes)` with window gating. ESPN final makes a game provisional and nflverse agreement confirms it. `grade_week` is a pure function, and regrades are idempotent with `inputHash`.
- **3A**: Smirnoff mailer. A derived-events sweep with a claim log, Jinja2 rendered in Python, and GOW confirm-page links signed with HMAC.
- **4A**: Next.js static export with query-param routes, reading from the Cognito-authorized API only.

House patterns, newest first: **armchair** (reusable `Xomware/github-actions@v1` workflows for terraform, Lambda deploy and frontend deploy; Infisical folder `/<app>`; plan/apply roles in `xomware-infrastructure`, deploy role in-stack), **smirnoff** (mailer, SES, `wait-for-terraform.yml`), **reeses** (cron window pattern, `nflverse.py` team codes, `payment.ts`).

Constraints that shape every piece:
- The API module supports exactly two path levels (`/<prefix>/<part>`). Ids go in the query string or body. CORS preflight is `*`, and Lambdas echo `CORS_ALLOW_ORIGIN`.
- Every `now()` goes through `common/clock.py`, so replay groups run on virtual time.
- The repo is public. Fixtures built from Dom's sheet use member ids, never names.
- `deploy-lambda-python.yml@v1` fails if no `<prefix>-shared-packages` layer exists. Feature 1 therefore ships a `lambdas/common` and a `requirements.txt`.

**Where replay goes:** Feature 5, after groups and before picks. Picks need `clock.now(group)` for the lock check from the first line, and grading (F7) is validated by replaying 2026 against Dom's sheet. Putting the clock in later would mean retrofitting every lock and visibility check.

**Added feature:** F3 (NFL game store + schedule ingest) was not in the brief. Picks need games, `lockAt` and the tiebreak game before grading exists, and replay loads into the same store.

## Affected Files / Components
| File / Component | Change | Why |
|---|---|---|
| `Xomware/xomware-infrastructure` `terraform/oidc_pickem_terraform.tf` | new | Plan/apply roles this stack's pipeline assumes |
| `Xomware/xomware-infrastructure` `terraform/cognito.tf` | add `pickem-client` | App client on the shared pool, `Google` IdP |
| Infisical `/pickem` | new folder | Role ARNs and TF vars for the reusable workflows |
| `infrastructure/terraform/` | new stack | Capture bucket, Lambdas, tables, API, hosting, SES |
| `backend/lambdas/common/` | new | `espn`, `nflverse`, `clock`, `rules`, `grade`, `standings`, `death`, `mailer`, `gate` |
| `backend/lambdas/<fn>/` | new | `capture`, `cron_tick`, API handlers |
| `frontend/` | new | Next 16 static export |
| `fixtures/` | new | Golden fixtures from Dom's 2026 sheet, anonymized |
| `.github/workflows/` | new | `terraform.yml`, `deploy-backend.yml`, `deploy-frontend.yml`, `wait-for-terraform.yml` |

## Implementation Steps

Sizes count hand-written logic only. Tests, HCL copied verbatim from a sibling repo, and docs are excluded. **v1** means needed for the 2027 launch.

### F1. 2026 data capture (v1, ship this week)
Standalone. No dependency on F2+. Separate from `cron_tick` on purpose: it archives raw JSON, it doesn't model anything.

- [ ] **1.1 Bootstrap roles.** Create the public repo `Xomware/uncle-mikes-pickem`. In `xomware-infrastructure` (base `master`), add `oidc_pickem_terraform.tf` copied from `oidc_smirnoff_terraform.tf` and armchair's equivalent, with both subject forms (the repo id must exist first). Plan role decrypt is scoped to `/pickem/*`. After apply, put `AWS_TERRAFORM_PLAN_ROLE_ARN` and `AWS_TERRAFORM_APPLY_ROLE_ARN` in Infisical `/pickem`. ~0 logic, ~110 copied HCL. Deps: none. **Needs Dom's approval on the shared repo.**
- [ ] **1.2 Capture stack.** `infrastructure/terraform/`: S3 backend `pickem/terraform.tfstate` in `xomware-terraform-state`, tags, and bucket `pickem-nfl-capture` (public access blocked, SSE-S3, no expiry). Function `pickem-capture` on the stub zip and stub layer, with a 120 s timeout and 256 MB. IAM allows only `s3:PutObject` on `raw/*` plus logs. One EventBridge rule at `rate(30 minutes)`. `oidc_deploy.tf` deploy role. `.github/workflows/terraform.yml` calls `Xomware/github-actions/.github/workflows/terraform.yml@v1` with `app: pickem`. ~40 logic lines, ~150 HCL mostly copied from armchair. Deps: 1.1. After the first apply, add `AWS_DEPLOY_ROLE_ARN` to Infisical.
- [ ] **1.3 Capture handler.** `common/espn.py` holds the GET helper (fixed User-Agent, gzip). `lambdas/capture/handler.py` reads the default scoreboard to get season, seasontype, week and kickoffs, then picks a mode:
  - `daily` on the first tick of 14:xx UTC.
  - `prekick` if any `pre` game kicks off in the next 45 min. This gives 1–2 snapshots per slot after inactives. The first game's snapshot is the lock-time state of the whole slate.
  - `force` for a manual payload.
  - Otherwise it does nothing.

  Every snapshot is the full slate: scoreboard, a `summary` per event (pickcenter odds, injuries, `gameInfo.weather`, predictor), and gambit `nfl-pickem-{season}` and `nfl-survivor-{season}`. `daily` also stores the league `/injuries` feed. Output is gzip JSON under `raw/season=YYYY/type=T/week=WW/<ISO-ts>/…` plus a `manifest.json` (mode, URL, HTTP status, bytes). A failed fetch is recorded in the manifest and skipped. The handler raises after writing if anything failed, so the Errors metric fires. Adds `deploy-backend.yml` (reusable `deploy-lambda-python.yml@v1`), `wait-for-terraform.yml` from armchair, and `requirements.txt`. Tests use recorded fixtures and moto S3. ~150 lines. Deps: 1.2. After merge, invoke once with `force` and check the `CodeSha256` and the S3 objects.
- [ ] **1.4 Alarm.** CloudWatch alarms on `pickem-capture` for Errors ≥ 1 in 3 h and Invocations = 0 in 2 h, sent to an SNS topic with Dom's email from SSM/Infisical. ~0 logic, ~40 HCL. Deps: 1.2. It can land after 1.3 is live, but should land the same week. A silent outage loses data that can't be fetched again.

### F2. Infra + auth (v1)
- [ ] **2.1 Cognito client.** `pickem-client` in `xomware-infrastructure/terraform/cognito.tf`. It copies `reeses`, with callbacks for `pickem.xomware.com` and localhost/127.0.0.1:3000, and `supported_identity_providers = ["Google"]`. ~45 HCL. Deps: none (can run in parallel with F1).
- [ ] **2.2 Site hosting.** `domgiordano/web-hosting` v1.8.0, ACM cert, a record in the shared xomware.com zone, the shared WAF, and `deploy-frontend.yml` via `deploy-frontend-s3.yml@v1`. ~100 HCL. Deps: 1.2.
- [ ] **2.3 Frontend scaffold.** Next 16 static export with `trailingSlash`, Tailwind 4, vitest, a landing page and Google sign-in. The build fails if Cognito env is missing; there is no `authConfigured = false` fallback. Read the bundled Next 16 docs first. ~180. Deps: 2.1, 2.2.
- [ ] **2.4 API + app table.** The `pickem-app` table with GSI1, the API Gateway module with a Cognito authorizer, `common/api.py`, and a `GET /me/profile` smoke endpoint. ~150. Deps: 1.2, 2.1.
- [ ] **2.5 Authed client.** `lib/api/client.ts` with ID-token bearer auth and a profile page. Verify it live against the real API. ~100. Deps: 2.3, 2.4.

### F3. NFL game store + schedule ingest (v1)
- [ ] **3.1 Game store.** The `pickem-nfl` table and `common/nfl_store.py` for `WEEK` and `GAME` items. Team-code normalization comes from reeses `nflverse.py` (`LA`/`LAR`, `WAS`/`WSH`). ~150. Deps: 2.4.
- [ ] **3.2 `cron_tick` schedule refresh.** `rate(2 minutes)` with window gating, a `force` payload, and `poll_runs` in `pickem-ops`. An hourly refresh writes WEEK and GAME from the ESPN scoreboard: kickoffs, status, lines (ESPN sign convention), broadcasts and venue. `lockAt` is the first kickoff, recomputed until it passes. `tiebreakGameId` is the last game by kickoff, with the higher event id winning a tie. That equals "later MNF game" and "Week 18 last game". ~180. Deps: 3.1.
- [ ] **3.3 Hype score.** Stored components on GAME: national slot, spread, total, predictor `matchupQuality`, `div_game`. The sum is explainable, with golden tests. ~120. Deps: 3.2.
- [ ] **3.4 nflverse reader.** `games.csv` from the release asset (follows the 302), joined on the `espn` column. The tie is `result == 0`. The spread sign is flipped to match ESPN's. ~100. Deps: 3.1.

### F4. Groups, invites, versioned rules (v1)
- [ ] **4.1 Groups.** `POST /groups/create` and `GET /groups/mine`. Writes `META` and the owner `MEMBER`, with GSI1 serving "my groups". ~150. Deps: 2.4.
- [ ] **4.2 Invites.** `INVITE#code`, `POST /invites/create`, `POST /invites/accept`, and the `/join/?code=` page. `joinedWeek` is recorded on accept. ~180. Deps: 4.1.
- [ ] **4.3 Versioned rules.**
  - `common/rules.py` holds the RULES.md defaults and `rules_for(group, season, week)`.
  - `POST /rules/update` writes `RULES#S<yr>#v<n>` with `effectiveWeek` = the next unlocked week.
  - Second life is rejected after the Week 1 lock.
  - Roles are owner, admin and member.

  ~180. Deps: 4.1, 3.2.
- [ ] **4.4 Group UI.** Group home, members, invite link, and the settings form. ~200. Deps: 4.2, 4.3.

### F5. Clock + 2026 replay (v1, validation only)
- [ ] **5.1 Clock.** `common/clock.py`: `now(group)` returns `META.clock` when set and real time otherwise. Lint/test that no handler calls `datetime.now` directly. ~40. Deps: 4.1.
- [ ] **5.2 Replay loader.** Builds season-2026 `pickem-nfl` rows from nflverse (schedule, finals, closing lines) and from F1 captures (lines, injuries, weather, predictor, crowd %, taken from the latest snapshot before the virtual time). `games_as_of(season, week, now)` hides results before kickoff + 3.5 h, since nflverse has no end time. ~180. Deps: 3.1, 3.4, 1.3.
- [ ] **5.3 Replay control.** A replay flag at group creation (season 2026), `POST /replay/advance` to set `META.clock`, and an admin control in the UI. ~120. Deps: 5.1, 4.4.

### F6. Picks, lock, GOW (v1)
- [ ] **6.1 GOW selection.** `POST /gow/set`, admin only, any game that week. `cron_tick` auto-sets the top hype game at Tuesday 12:00 ET (`chosenBy: auto`). ~150. Deps: 3.3, 4.3, 5.1.
- [ ] **6.2 Picks write.** `POST /picks/set` validates:
  - a winner for every non-canceled game
  - confidences unique 1..N
  - an integer tiebreak
  - the GOW is set
  - `clock.now(group) < lockAt` from the week's rules version, re-read on every write

  It writes one `PICK#sub` item per member-week. ~150. Deps: 6.1.
- [ ] **6.3 Picks read + gate.** `common/gate.py` returns your own picks before lock and the whole group's after lock. Enforced in the API only. ~100. Deps: 6.2.
- [ ] **6.4 Picks UI.** Week page with confidence assignment, tiebreak input, GOW marker, locked state and the post-lock group grid. ~200. Deps: 6.3.
- [ ] **6.5 Canceled game.** An organizer setting that voids a game. The week's N drops by one. ~80. Deps: 6.2. See Open Questions for what happens after lock.

### F7. Grading (v1)
- [ ] **7.1 `grade_week`.** A pure function in `common/grade.py` that computes:
  - weekly score
  - yearly week score (a right GOW pick doubles, a wrong one counts negative)
  - missed-week score: the lowest submitter minus 1, computed separately for weekly and yearly; 0 if nobody submitted
  - late joiners get the missed score for weeks before `joinedWeek`
  - tied NFL game per rules (default 0)
  - canceled games removed
  - shared places ("1*")
  - the closest-total tiebreak

  **Golden fixture: Dom's 2026 Week 9 weekly scores**, anonymized to `fixtures/grade-golden.json`. ~180. Deps: 6.2.
- [ ] **7.2 Finals.** Live polling in the game window. ESPN `STATUS_FINAL` sets `confirmedBy: [espn]` and the game is provisional. nflverse agreement confirms it. A disagreement, or 6 h without confirmation, flags the game and alerts the admin. A tie is `completed && !any(winner)`. ~150. Deps: 3.2, 3.4.
- [ ] **7.3 Regrade.** On a game state change, regrade the affected group-weeks. `RESULT` is written only when `inputHash` changes. Adds `POST /results/override` (written as an input) and `POST /results/regrade`. ~180. Deps: 7.1, 7.2.
- [ ] **7.4 Results UI.** Green/red grid, weekly scores and places, and a provisional badge. ~150. Deps: 7.3, 6.4.
- [ ] **7.5 Replay check.** Replay 2026 Weeks 1–9 in a replay group with Dom's picks entered, then diff against the sheet. Mostly a script plus a fixture, ~80. Deps: 7.3, 5.3.

### F8. Standings (v1)
- [ ] **8.1 Fold.** `common/standings.py` folds over `RESULT`s for the yearly total, GOW total (the tiebreaker) and shared places. **Golden fixture: Dom's sheet season standings through Week 9.** ~120. Deps: 7.1.
- [ ] **8.2 Season table.** `STANDINGS` is written on regrade. Adds `GET /standings/season` and the season table UI. ~170. Deps: 8.1, 7.3.

### F9. Death pool (v1)
- [ ] **9.1 Entries + picks.** Multiple entries per person, each labeled. `POST /death/pick` enforces team-used-once and the shared lock, and picks are hidden until lock. ~170. Deps: 6.2, 4.3.
- [ ] **9.2 Death fold.** `common/death.py`:
  - a loss, a tie (per rules) or a missed pick takes a life
  - the second-life setting is honored
  - if every remaining entry loses in the same week, entries with a spare life just lose it and stay in
  - revive applies only when every remaining entry was on its last life
  - the pool ends with one entry left, or a split after W18

  **Golden fixture: Dom's 2026 death pool grid.** ~150. Deps: 7.2.
- [ ] **9.3 Death UI.** Grid, used teams, lives and status. ~180. Deps: 9.1, 9.2.

### F10. Payments ledger (v1)
- [ ] **10.1 Ledger API.** `PAY#sub#kind[#entryId]` rows with owed amounts from the rules fees, and `POST /pay/mark` (owner only). ~150. Deps: 4.3, 9.1.
- [ ] **10.2 Ledger UI.** Ledger page and payment links ported from reeses `payment.ts`. Handle text only for Zelle. No prefilled notes (Venmo ToS). ~180. Deps: 10.1.
- [ ] **10.3 Payouts.** Payout view from the pot splits, standings and death pool result. ~120. Deps: 10.1, 8.2, 9.2.

### F11. Email (v1)
- [ ] **11.1 SES.** Copy smirnoff `ses.tf`: domain identity, DKIM, MAIL FROM, config set, and SNS bounce/complaint to a suppression Lambda. Confirm production access. ~40 logic, ~150 HCL. Deps: 1.2.
- [ ] **11.2 Mailer port.** `mailer.py`, `unsubscribe.py` and `email_prefs.py` from smirnoff. Claims go to `pickem-ops` `MAIL#`, prefs live on `MEMBER`. Jinja2 HTML plus a text part. ~200, mostly copied. Deps: 11.1, 2.4.
- [ ] **11.3 Results emails.** Week result and week winner emails, sent only once the week is confirmed. Golden HTML snapshots and an admin `GET /email/preview`. ~150. Deps: 11.2, 7.3.
- [ ] **11.4 Reminders.** Late reminders at 24 h and 2 h before lock, with a warning that a missing death pick eliminates the entry. ~120. Deps: 11.2, 6.2, 9.1.
- [ ] **11.5 Death emails.** Life-lost and elimination emails. ~100. Deps: 11.2, 9.2.
- [ ] **11.6 GOW admin email.** The top-3 hype games plus "any game". Each button opens `/gow/?t=…`, which shows a confirm button that POSTs the HMAC token (scanner-safe). ~180. Deps: 11.2, 6.1.
- [ ] **11.7 Announcements + corrections.** "GOW is set, picks open" to members, and a correction email when a regrade flips a winner or a death status after the emails went out. ~120. Deps: 11.3, 11.6.

### F12. Game info + Haiku analysis (later)
- [ ] **12.1** Per-game `INFO#injuries`/`INFO#weather` from `cron_tick`, plus a stadium coordinates table (~35 rows) with NWS (US) and Open-Meteo (international). ~180. Deps: 3.2.
- [ ] **12.2** H2H and team-at-stadium history from nflverse. ~120. Deps: 3.4.
- [ ] **12.3** Haiku 4.5 write-ups on Wednesday with a Saturday refresh, API key in SSM. ~120. Deps: 12.1, 12.2.
- [ ] **12.4** `/game/?id=` page. Replay groups read F1 captures. ~200. Deps: 12.3, 5.2.

### F13. Analytics (later; 13.1 can move to v1)
- [ ] **13.1** Group pick breakdowns after lock. ~120. Deps: 6.3.
- [ ] **13.2** Weekly win probability: Monte Carlo over remaining games using moneyline/predictor probabilities, recomputed per game final. ~180. Deps: 7.3.
- [ ] **13.3** Yearly win probability. ~150. Deps: 13.2, 8.2.
- [ ] **13.4** Rooting guide: the result in each remaining game that maximizes each member's win probability. ~150. Deps: 13.2.
- [ ] **13.5** Analytics UI. ~200. Deps: 13.1–13.4.

## Out of Scope
- Moving money, or any payment processor.
- Per-game lock (the data model supports it; RULES says the whole week locks at first kickoff).
- Native apps and push notifications.
- Postseason pools. F1 still captures postseason snapshots because they cost nothing.
- Backfilling pre-game injuries, weather or predictor data for 2026 Weeks 1–9. ESPN doesn't serve them historically, so those weeks replay with nflverse closing lines only.

## Risks / Tradeoffs
- **F1 timing**: today is Thursday of Week 10. Catching the Week 10 Sunday slate needs 1.1–1.3 deployed by Sunday 17:00 UTC, and 1.1 waits on an approved `xomware-infrastructure` apply. Accepted fallback: capture starts Week 11.
- **ESPN 403s** (August 2026 precedent): a capture outage loses data for good. Mitigation: the 1.4 alarm, and nflverse lines as a replay fallback.
- **Gambit**: the key changes per season and the `scoringFormatId` meanings are unverified. Mitigation: store raw and interpret later.
- **Public repo vs Dom's sheet**: friends' names must not land in git. Fixtures use member ids, and the mapping stays out of the repo.
- **Capture and `cron_tick` both hit ESPN** once F3 ships. That doubles the request volume against an undocumented API. Accepted for 2026. See Open Questions.
- **Result emails wait on nflverse** (5–120 min lag). Accepted: no retracted "you won" emails.
- **Stub trap**: a new function can run `lambda_stub.zip`. The reusable deploy's `CodeSha256` check catches it. Still invoke each new endpoint after merge.
- **`api_grants`/services map merge conflicts** (armchair lesson): keep one line per key when resolving.
- **SES production access** is unverified. It blocks F11 for real users, not for build.
- **Open-Meteo** is non-commercial only. That's fine unless ads or subscriptions are ever added.

## Decisions taken 2026-11-12 (Dom: "go, don't stop until it's up")
- Repo `Xomware/uncle-mikes-pickem`, resource prefix `pickem`.
- Weekly ties: standings show the shared place ("1*"). The MNF-total tiebreaker decides the weekly payout winner. An exact tiebreak tie splits the payout.
- A game canceled after lock is voided and its confidence scores 0. Values are not re-ranked.
- Rule changes are forward-only in v1.
- F1 capture keeps running as a raw archive until F3 has proven itself through a season.

## Open Questions
- [ ] Format of Dom's sheet export (CSV?) for the Week 9 and death pool fixtures, and who holds the member-id mapping.
- [ ] F12 and F13 are marked later. RULES.md lists analytics, so confirm they're fine to land after launch, or pull 13.1 into v1.
- [ ] Late joiner fees: full or prorated?

## Skills / Agents to Use
- **/goals uncle-mikes-pickem** (F1 only, now): turn 1.1–1.4 into issues and PRs today. It skips `/orchestrate` because F1's pieces are already specified.
- **/orchestrate**: stub F2–F13 as feature plans after F1 ships, then **/plan** each stub before **/goals**.
- **terraform / infra-standards skills**: every HCL piece (1.1, 1.2, 1.4, 2.1, 2.2, 2.4, 11.1). Plan runs in Actions only.
- **/review**: before merging grading (7.x), death (9.2) and the GOW token (11.6). These are the pieces where a wrong answer reaches money or email.
