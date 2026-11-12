# Research: NFL data sources (free) + payment links + transactional email

**Date**: 2026-11-12 (NFL 2026, regular season Week 10)
**Decision it informs**: `/brainstorm` and `/plan` for Uncle Mike's NFL Pick Em: confidence pool and survivor pool
**Status**: Complete. Gaps are marked **unverified**.

## Question
Which free sources can supply schedule, scores (ties included), lines, injuries, standings, weather, history and a "game of the week" signal for Python Lambdas on an EventBridge cron? And what is free for payment deep links and HTML email?

All samples below were pulled with `curl` on 2026-11-12 unless marked otherwise.

## Prior art in Dom's repos (read first)
- `reeses-playoff-challenge/backend/lambdas/common/nflverse.py`: **ESPN started returning 403 on every User-Agent, from both Lambda and a home laptop, around 2026-08-09** (commit `fix: a feed that cannot refuse us…`). nflverse was promoted to primary and ESPN kept as an optional enrichment. ESPN answered every request today, so the block was temporary, but it did happen.
- That same file: nflverse uses `LA` for the Rams. ESPN and Sleeper use `LAR`. **nflverse also uses `WAS` where ESPN uses `WSH`** (checked in today's `games.csv`).
- `reeses-playoff-challenge/frontend/lib/league/payment.ts` already builds plain profile links for Venmo, Cash App and PayPal. Zelle and Apple Cash return `null`.
- `smirnoff-league` already runs SES v2 with a domain identity, DKIM, a custom MAIL FROM, a configuration set, and an SNS destination for `BOUNCE`/`COMPLAINT` (`infrastructure/terraform/ses.tf`). It renders HTML in Python (`backend/lambdas/common/email_templates.py`) rather than using SES stored templates.
- `today-in-sports-backend/lambdas/common/sources/nflverse.py` reads `nflverse-data` release assets and carries an attribution string.

---

## 1. Schedule, live scores, finals and ties

### ESPN site API (unofficial)
- `GET https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard`: the current week. 200, 254 KB.
- `…/scoreboard?seasontype=2&week=5&dates=2026`: any week. `seasontype` 1 is pre, 2 is regular, 3 is post.
- `GET https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=401873052`: one game. 126 KB.
- Top-level fields: `leagues[0].calendar` (week windows, e.g. `{"label":"Week 1","startDate":"2026-09-06T07:00Z","endDate":"2026-09-16T06:59Z"}`), `week.number` = 10, `week.teamsOnBye` (CHI, DEN, PHI, TB).
- Event sample (trimmed):
  ```json
  {"id":"401873052","date":"2026-11-13T01:15Z","shortName":"WSH @ NYG",
   "competitions":[{"neutralSite":false,"venue":{"id":"3839","fullName":"MetLife Stadium","indoor":false},
     "competitors":[{"homeAway":"home","team":{"id":"19","abbreviation":"NYG"},"score":"0",
                     "records":[{"summary":"5-2-1"},{"summary":"3-1"},{"summary":"2-1-1"}]}],
     "status":{"period":0,"displayClock":"0:00","type":{"name":"STATUS_SCHEDULED","state":"pre","completed":false}},
     "broadcasts":[{"names":["Prime Video"]}]}]}
  ```
- **Tie, verified.** Week 5 `401872988` NYG @ WSH ended 27-27. Both competitors have `winner: false`. Status is `{"name":"STATUS_FINAL","state":"post","completed":true,"detail":"Final/OT","altDetail":"OT"}`. A finished game with no winner is therefore `completed && !any(winner)`.
- A normal final carries `winner: true/false` and `linescores[]` per quarter.
- Neutral-site and international games appear as `"NE VS DET"`, kicking off at 14:30Z.
- Rate limits and ToS: no public docs and no API terms. The response sends `cache-control: max-age=6`, and no rate-limit headers were seen. Risk is **high**: the endpoint is undocumented and was 403'd for a stretch in August 2026 (prior art above).
- Cadence: data is cached for 6 s at the edge. Fields change during live windows (Thu/Sun/Mon, plus Sat/Wed late season and international mornings).

### nflverse `games.csv` (fallback for scores, primary for history)
- `https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv`. Also available as `.csv.gz`, `.parquet` and `.rds`.
- Raw mirror: `https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv`. Reeses uses this one.
- Row for tonight's game:
  `2026_10_WAS_NYG,2026,REG,10,2026-11-12,Thursday,20:15,WAS,,NYG,,Home,,,,…,espn=401873052,…,away_moneyline=114,home_moneyline=-135,spread_line=2.5,…,total_line=40.5,…,div_game=1,roof=outdoors,surface=fieldturf,…,stadium_id=NYC01,stadium=MetLife Stadium`
- The `espn` column holds ESPN's event id (`401873052`), so the two sources join with no fuzzy matching.
- Tie row: `2026_05_NYG_WAS` has `result=0, overtime=1`. `result` = home score minus away score.
- Today 136 of 272 games in 2026 had results. `timestamp.json` read `{"last_updated":"2026-11-12 11:16:41 EST"}`.
- No live in-game scores: it only has final scores.

### The Odds API `/scores` (paid-quota fallback)
- `GET /v4/sports/americanfootball_nfl/scores/?daysFrom=1..3` costs 1 credit, or 2 with `daysFrom` ([guide](https://the-odds-api.com/liveapi/guides/v4/)). Needs a key. **Not hit**, because a keyless call returns 401 `INVALID_KEY`.

---

## 2. Betting lines

### ESPN, embedded in the scoreboard and summary
- `competitions[0].odds[]` on the scoreboard has a single provider today: DraftKings, id 100.
  ```json
  {"provider":{"name":"DraftKings"},"details":"NYG -2.5","spread":-2.5,"overUnder":40.5,
   "homeTeamOdds":{"favorite":true,"favoriteAtOpen":true},
   "moneyline":{"home":{"close":{"odds":"-135"},"open":{"odds":"-125"}},"away":{"close":{"odds":"+114"},"open":{"odds":"+105"}}},
   "pointSpread":{"home":{"close":{"line":"-2.5","odds":"-110"}}}}
  ```
- The summary's `pickcenter[]` gives flat numbers: `"moneyLine":-135,"spreadOdds":-110.0,"overOdds":-118.0,"underOdds":-102.0`.
- **Sign convention:** ESPN `spread` is the home team's line. `"KC -3"` with KC as the away team at ATL gives `spread: 3.0`. **nflverse `spread_line` is the opposite**: positive means home favored, so NYG -2.5 is `2.5`.
- The core API returns the same data with open lines included: `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events/{id}/competitions/{id}/odds` (200, 5.8 KB).
- Risk: the same unofficial-endpoint risk as section 1, and only one book. Lines move until kickoff. ESPN keeps "close" and "open" values.

### The Odds API, free "Starter" tier
- **500 credits/month free.** Paid tiers: 20K credits for $30, 100K for $59, 5M for $119, 15M for $249 per month ([pricing](https://the-odds-api.com/), fetched 2026-11-12).
- Endpoint: `GET /v4/sports/americanfootball_nfl/odds/?regions=us&markets=h2h,spreads,totals&apiKey=…`.
- Cost per call = markets × regions, so the call above costs 3 credits, which allows ~166 calls/month. `/sports` and `/events` are free. A call that returns no events costs nothing. Remaining quota comes back in the `x-requests-remaining` header ([guide](https://the-odds-api.com/liveapi/guides/v4/)).
- US books listed: DraftKings, FanDuel, BetMGM, Caesars, BetRivers, theScore. Historical odds are paid only.
- Response fields **unverified**. I could not call without a key.

### nflverse `games.csv` (no quota)
- Has `away_moneyline, home_moneyline, spread_line, away_spread_odds, home_spread_odds, total_line, under_odds, over_odds` for upcoming games. Tonight's values exactly match ESPN/DraftKings (114 / -135 / 2.5 / 40.5 / -102 / -118).
- Which book it copies, and when it snapshots, is **unverified**.

---

## 3. Injuries

| Endpoint | Result today |
|---|---|
| `site.api.espn.com/apis/site/v2/sports/football/nfl/injuries` | 200, **8.7 MB**. `injuries[team].injuries[]` with `status`, `date`, `shortComment`, `longComment`, `type.name` (`INJURY_STATUS_OUT`…), `athlete.displayName/position`. Status counts: Active 514, Questionable 168, IR 58, Out 53, Doubtful 7. It includes "Active" fantasy blurbs, which is why it is so large. |
| `…/summary?event={id}` → `injuries[]` | Per-game list, short. NYG: `Colton Hood CB Out`, `J.J. McCarthy Questionable`, `Malik Harrison Questionable (Groin)`, `Tyrone Tracy Jr. Injured Reserve (Hamstring)`. Body part is under `details.type` and is sometimes missing. |
| `site.api.espn.com/…/teams/19/injuries` | 200 but **empty `{}`** |
| `sports.core.api.espn.com/v2/…/teams/19/injuries?limit=100` | 200. 64 `$ref` links that need one call each. Items look like the league feed. |
| `…/teams/19?enable=injuries` | `injuries: null` |

- No free official NFL injury-report API was found. nflverse publishes injury data, but its timeliness was **not checked**.
- Cadence: NFL practice reports come out Wed–Fri, with game statuses Friday and inactives ~90 min before kickoff. That timing is general knowledge and **unverified** here.

---

## 4. Standings, records, form
- `GET https://site.api.espn.com/apis/v2/sports/football/nfl/standings` (note: **`/apis/v2`**, not `/apis/site/v2`). 200, 158 KB. `children[AFC|NFC].standings.entries[].stats[]`.
  - BUF sample: `overall 7-1`, `streak W4`, `playoffSeed 1`, `pointDifferential +69`, `Home 3-1`, `Road 4-0`, `vs. Div. 0-1`, `vs. Conf. 4-1`, `winPercent .875`, `ties 0`.
- Records also appear on every scoreboard competitor: `records[].summary` = overall / home / road (`5-2-1`, `3-1`, `2-1-1`).
- Core: `sports.core.api.espn.com/v2/…/seasons/2026/types/2/teams/19/record` gives `OTWins`, `avgPointsFor` and similar.
- Form: summary `lastFiveGames[].events[]` with `gameResult:"W"`, `score:"36-24"`, `atVs`, `week`. Summary `standings` holds the division table.
- Fallback: derive everything from nflverse `games.csv` results, ties included. `nfldata/data/standings.csv` also exists (57 KB). Its 2026 freshness is **unverified**.

---

## 5. Weather, roof and stadium coordinates

### ESPN
- Scoreboard `events[].weather` gives `{"displayValue":"Showers","temperature":52,"highTemperature":52,"conditionId":"12","link":{accuweather…}}`.
- Summary `gameInfo.weather` adds `gust:14` and `precipitation:64`. Units are **unverified**; it is probably a percentage.
- `weather` was present for indoor venues too, so it cannot tell you about roofs. It was `None` for the international NE VS DET game.
- Roof: `venue.indoor` is a boolean only. Allegiant, Lucas Oil, Mercedes-Benz, AT&T, State Farm and Superdome all read `true`, so retractable roofs are not distinguished.
- `sports.core.api.espn.com/v2/…/venues/3839` gives `indoor`, `grass` and address. **No lat/lon.**

### Open-Meteo
- `GET https://api.open-meteo.com/v1/forecast?latitude=40.8135&longitude=-74.0745&hourly=temperature_2m,precipitation_probability,wind_speed_10m,wind_gusts_10m,weather_code&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America/New_York&start_hour=2026-11-12T20:00&end_hour=2026-11-12T22:00`
  → `"temperature_2m":[50.8,51.1,51.1],"precipitation_probability":[46,47,47],"wind_gusts_10m":[28.2,26.6,19.7],"weather_code":[51,3,51]`
- Headers: `X-RateLimit-Limit: 600`, `X-RateLimit-Window: 60`.
- [Terms](https://open-meteo.com/en/terms): **non-commercial only** on the free tier. Limits are <10k calls/day, 5k/hour, 600/min and 300k/month, per IP. Licence is CC BY 4.0, so attribution is required. "Commercial" means subscriptions or ads.
- Works worldwide, including London, Munich, Madrid and Melbourne games.

### NWS api.weather.gov
- `GET https://api.weather.gov/points/40.8135,-74.0745` returns `gridId OKX, gridX 30, gridY 46, forecastHourly …/gridpoints/OKX/30,46/forecast/hourly`.
- The hourly feed has 156 periods (~6.5 days): `{"startTime":"2026-11-12T20:00:00-05:00","temperature":52,"probabilityOfPrecipitation":{"value":74},"windSpeed":"12 mph","windDirection":"NE","shortForecast":"Light Rain Likely"}`.
- **A User-Agent is required.** An empty UA returned 403. The rate limit is "not public information" ([docs](https://www.weather.gov/documentation/services-web-api)). The data is open with no fee.
- Covers US venues only, so no forecast for international games. `windSpeed` is a string.

### Roof type and coordinates
- nflverse `games.csv` has `roof` per game, one of `outdoors|open|closed|dome`. For retractable stadiums it records the state on game day.
  - 2026 counts: outdoors 177, dome 52, closed 14, open 6, **blank 23** (future retractable games, e.g. `ATL97 ''`, `DAL00 ''`).
  - **Data-quality flags:** Stade de France, FC Bayern Munich Stadium and Melbourne Cricket Ground are tagged `dome`. Houston is still named "Reliant Stadium".
- Lat/lon: neither ESPN nor nflverse provides it. Wikidata SPARQL (`P118=Q1215884`, `P115` home venue, `P625` coords) returned 34 rows, e.g. `MetLife Stadium Point(-74.0744 40.8136)`.
  - It is stale and noisy: Bills → "Ralph Wilson Stadium", and the Chiefs also map to Cotton Bowl and Municipal Stadium.
  - Expect a ~35-row hand-curated table, keyed by ESPN `venue.id` or nflverse `stadium_id`, with Wikidata as the seed.

---

## 6. Head-to-head and team-at-stadium history (nflverse)

| Asset (`releases/download/schedules/…`) | Size |
|---|---|
| `games.csv` | 2,189,959 B (7,549 lines, seasons **1999–2026**) |
| `games.csv.gz` | 516,904 B |
| `games.parquet` | 523,761 B |

- Columns: `game_id, season, game_type, week, gameday, weekday, gametime, away_team, away_score, home_team, home_score, location, result, total, overtime, …, espn, …, away_moneyline, home_moneyline, spread_line, …, total_line, …, div_game, roof, surface, temp, wind, away_qb_name, home_qb_name, away_coach, home_coach, referee, stadium_id, stadium`.
- H2H means filtering team pairs. Team-at-stadium means filtering on `stadium_id`. `location` is `Home|Neutral`; per the dictionary, Giants–Jets games stay `Home`.
- 16 ties since 1999.
- **Cadence:** "Game/Schedule data updates every 5 minutes during the season" ([nflreadr article source](https://github.com/nflverse/nflreadr/blob/main/vignettes/articles/nflverse_data_schedule.Rmd)). The release asset was updated 2026-11-12T16:16Z. `nfldata` shows "Automated data update" commits every 10–120 min today. `nfldata/.github/workflows/release_games.yml` republishes the release on every push to `data/games.rds`.
- **License:**
  - The `nflverse/nflverse-data` repo is **CC-BY-4.0** (GitHub license API).
  - `nflverse/nfldata`, the upstream raw repo, has **no LICENSE file** (404).
  - nflreadr says: "NFL data accessed by this package belong to their respective owners, and are governed by their terms of use."
  - Attribute nflverse, and pull from the release asset rather than raw `nfldata`.
- Reliability: a static file on GitHub's CDN. It has no key, no quota and no per-IP throttle seen. Release-asset URLs 302 to a signed `release-assets.githubusercontent.com` URL, so redirects must be followed.

---

## 7. "Game of the week" signals

| Signal | Source | Sample |
|---|---|---|
| National / primetime slot | ESPN `broadcasts[].names`, `geoBroadcasts[].market.type`, plus kickoff time | TNF `["Prime Video"]` market `National`. SNF `PIT @ CIN ["NBC"] 01:20Z`. MNF `LAC @ BAL ["ESPN"]`. `isTBDFlex` flag on `status`. |
| Closest spread / highest total | ESPN `odds[0].spread/overUnder`, or nflverse `spread_line/total_line` | Wk10 narrowest is 2.5 (WSH@NYG, NE-DET, CAR@NO). Highest total is SF@DAL 55.5. |
| ESPN Matchup Predictor (FPI) | Summary `predictor`, or core `…/competitions/{id}/predictor` | `gameProjection 50.143`, `teamChanceTie 0.397`, **`matchupQuality 38.687`**, `teamPredPtDiff 0.137`, `lastModified 2026-11-12T10:00Z` |
| Division game | nflverse `div_game=1` | WSH@NYG = 1 |
| Crowd pick % | **ESPN Pick'em "gambit" API** (unofficial) | see below |

### Crowd pick % (ESPN NFL Pick'em), unofficial and found by probing
- `GET https://gambit-api.fantasy.espn.com/apis/v1/challenges/nfl-pickem-2026`: 200, 175 KB, no auth.
  - `currentScoringPeriod.id` = 10. 14 `propositions` for the week.
  - Each `possibleOutcomes[]` has `abbrev`, `additionalInfo` (record), `mappings` (`COMPETITION_ID 401873059`, which equals the ESPN event id, plus `BETTING_LINE`), and `choiceCounters[]`.
  ```json
  {"abbrev":"SEA","choiceCounters":[{"scoringFormatId":1,"count":374096,"percentage":0.908},
    {"scoringFormatId":2,"percentage":0.93},{"scoringFormatId":3,"percentage":0.83},{"scoringFormatId":7,"percentage":0.928}]}
  ```
  - The challenge description lists four modes: "Standard, Spread, Pick 5 (NEW) and Confidence". Which `scoringFormatId` is which mode is **unverified**. `clientFlags.moneylineVisibleScoringTypes ["CONFIDENCE","STRAIGHT"]` lines up with `moneylineVisibleScoringFormatIds ["1","2"]`, which suggests 1/2 = Straight/Confidence and 3 = Spread. Format 1 has the largest sample (~410k entries).
- `…/challenges/nfl-survivor-2026`: 200. Survivor pick share, e.g. WSH `count 58, percentage 0.0035` (`scoringFormatId 4`). It only showed the one currently open proposition. Whether `?scoringPeriodId=N` returns the full week is **unverified**: it returned the same single proposition.
- Wrong keys return `CHALLENGE_KEY_NOT_FOUND`. `nfl-pigskin-pickem-2025` exists, but the 2026 key is `nfl-pickem-2026`, so **the key changes by season**.
- Headers are `cache-control: must-revalidate`, with no rate-limit info. Risk is **high**: undocumented, and the key is guessed per season.
- No other free crowd-pick source was verified. Covers, Action Network and similar were not checked.

---

## Payment deep links (links only, no processing)

| Method | Format | Verified? |
|---|---|---|
| Venmo web | `https://venmo.com/{user}?txn=pay&amount=10.00&note=Week+10` | Community-documented. **No first-party doc found** (`venmo.com/paymentlinks` is a business-profile page). **Unverified** |
| Venmo app | `venmo://paycharge?txn=pay&recipients={user}&amount=10&note=…` | **Unverified** (community). Reeses currently links only `https://venmo.com/{user}` |
| Cash App | `https://cash.app/$tag` (official). `https://cash.app/$tag/25` prefills the amount per third parties | Amount **unverified**. No note param found |
| PayPal | `https://paypal.me/{user}/25` (25.00 in default currency, per PayPal help FAQ3025). `…/25USD` per third parties | No note/memo param exists |
| Zelle | **No public deep link or prefill scheme found.** Zelle QR codes encode only the email/phone. Sending happens inside the bank app | Confirmed absent (no spec found) |

- **Venmo ToS:** under Prohibited Transactions, item 4, Venmo may not be used for transactions that "involve gambling, gaming and/or any other activity with an entry fee and a prize" ([venmo.com/legal/us-helpful-information](https://venmo.com/legal/us-helpful-information), fetched 2026-11-12). That applies to all transactions, not only business ones. A buy-in plus payout pool fits the wording.
- **PayPal AUP:** regional copies list "gambling, gaming and/or any other activity with an entry fee and a prize, including… fantasy sports…" under activities that **require prior approval** ([AUP regional pages](https://www.paypal.com/legalhub/acceptableuse-full)). The US page returned 403 to fetch, so the exact US wording is **unverified**.

## Transactional email

### Amazon SES (prior art: `smirnoff-league`)
- Price is **$0.10 per 1,000** emails plus $0.12/GB of attachments. New AWS accounts get up to $200 in credits, but there is no permanent SES free tier ([pricing](https://aws.amazon.com/ses/pricing/)). Optional extras: VDM at $0.07/1k, dedicated IP at $24.95/mo.
- **Sandbox** applies per region. It allows only verified recipients, 200 messages per 24 h and 1 msg/s. Production access is requested in the console or with `aws sesv2 put-account-details --production-access-enabled --mail-type TRANSACTIONAL …`. The request needs a site URL and an acknowledgement that a bounce/complaint process exists. "Initial response within 96 hours" ([docs](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html)).
- Whether Dom's account is already in production in us-east-1 is **unknown**: `aws sesv2 get-account` failed on an expired session. Smirnoff sending to real users implies yes. Re-check with `aws sesv2 get-account --region us-east-1`.
- Templates: SES stored templates exist (`CreateEmailTemplate` / `SendEmail` with `Template`). Their limits and syntax were **not checked**. Smirnoff renders HTML in Python and sends `Content.Raw`/`Simple`.
- Bounces and complaints: a configuration-set event destination goes to SNS, then to a Lambda. That wiring already exists in `smirnoff-league/infrastructure/terraform/ses.tf`.

### Alternatives
- **Resend:** free plan is 3,000 emails/month **capped at 100/day**, 3 domains, 30-day log retention. Pro is $20/mo for 50k ([pricing](https://resend.com/pricing)).
- **Postmark:** free plan is 100 emails/month and does not expire. Basic is $15/mo for 10k ([pricing](https://postmarkapp.com/pricing)).

---

## Recommendation (separable from findings)

| Category | Primary | Fallback | Reason |
|---|---|---|---|
| Schedule + live scores | ESPN scoreboard | nflverse `games.csv` (finals only) | ESPN has live clock, status, `winner` and ties. nflverse cannot be throttled and joins on the `espn` column |
| Finals / grading (ties) | ESPN `STATUS_FINAL` + `winner` | nflverse `result` (0 = tie) | Two independent confirmations before scoring. ESPN was 403'd in Aug 2026 |
| Lines (spread/ML/total) | ESPN `odds[]` (DraftKings, open+close) | nflverse line columns. The Odds API only if multi-book is needed | Both free with no quota and identical today. Odds API's 500 credits ≈ 166 three-market calls/month. **Watch the opposite spread signs** |
| Injuries | ESPN summary `injuries[]` per game | ESPN league `/injuries` (8.7 MB, filter non-Active) | The per-game list is small and already scoped. Team endpoint is empty |
| Standings / form | ESPN `/apis/v2/…/standings` + summary `lastFiveGames` | Compute from nflverse `games.csv` | ESPN has streak and seed ready-made. Computing from nflverse is deterministic |
| Weather | NWS hourly (US venues) | Open-Meteo (international venues) | NWS is open data with no commercial restriction. Open-Meteo free tier is non-commercial plus CC-BY. ESPN weather ignores roofs |
| Roof / coords | nflverse `roof` + hand-curated stadium table (Wikidata seed) | ESPN `venue.indoor` | No source has lat/lon. Neither source fully captures retractable roofs |
| H2H / stadium history | nflverse `games.parquet`/`.csv.gz` release asset | none needed | CC-BY-4.0, 1999+, ~0.5 MB, updated every 5 min |
| Game of the week | ESPN broadcasts (national slot) + predictor `matchupQuality` + spread/total | nflverse `div_game`, spread, total | All free. Crowd % is a nice-to-have |
| Crowd pick % | ESPN gambit `nfl-pickem-2026` `choiceCounters` | none found | The only free source; unofficial, and the key is per season |
| Payments | Plain profile links (existing `payment.ts`), optional Venmo `txn/amount/note` | Show handle text for Zelle/Apple Cash | Prefill params are unofficial. Venmo ToS bars entry-fee-plus-prize transactions |
| Email | SES v2, rendered in Python (smirnoff pattern) | Resend free (100/day) | Already built and wired for bounces. Costs pennies at pool scale |

## Open questions
- [ ] Does the SES account in us-east-1 already have production access? (`aws sesv2 get-account`)
- [ ] Mapping of gambit `scoringFormatId`s to modes, and how to get full-week survivor percentages.
- [ ] Do Venmo `amount`/`note` prefill and Cash App `/amount` work today? A manual phone test is needed.
- [ ] Which book nflverse line columns come from, and when they freeze.
- [ ] Units of ESPN `gameInfo.weather.precipitation`.
- [ ] Is the app "commercial" under Open-Meteo terms? Only if it adds ads or subscriptions.
- [ ] ESPN rate limits are unknown. The August 2026 403 episode had no published cause.

## Key links
- ESPN: `site.api.espn.com/apis/site/v2/sports/football/nfl/{scoreboard,summary,injuries}`, `site.api.espn.com/apis/v2/sports/football/nfl/standings`, `sports.core.api.espn.com/v2/sports/football/leagues/nfl/…`, `gambit-api.fantasy.espn.com/apis/v1/challenges/nfl-pickem-2026`
- nflverse: https://github.com/nflverse/nflverse-data/releases/tag/schedules, dictionary `nflverse/nflreadr/data-raw/dictionary_schedules.csv`
- The Odds API: https://the-odds-api.com/ and https://the-odds-api.com/liveapi/guides/v4/
- Open-Meteo terms: https://open-meteo.com/en/terms. NWS: https://www.weather.gov/documentation/services-web-api
- Venmo: https://venmo.com/legal/us-helpful-information. PayPal.Me: https://www.paypal.com/smarthelp/article/FAQ3025
- SES: https://aws.amazon.com/ses/pricing/ and https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html
- Resend: https://resend.com/pricing. Postmark: https://postmarkapp.com/pricing
