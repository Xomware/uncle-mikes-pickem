# Win odds model (F13)

How `common/odds.py` and `common/winprob.py` turn lines and picks into the numbers on the week and
standings pages. Every figure here is an approximation, and this file says where.

## One game: P(home wins)

1. **Moneyline, de-vigged.** Each American price becomes an implied probability (−150 → 0.600,
   +130 → 0.435). The pair sums past 1 by the book's margin, so each side is divided by the sum.
2. **Spread, when there's no moneyline** (replay groups: nflverse carries spreads only). The final
   margin is taken as normal around the spread with **σ = 13.5 points**. Stern (1991) measured 13.86 for
   1981–84; ~13.5 is the modern figure. So P(home) = Φ(−spread / 13.5). The spread is ESPN's home line.
3. **Neither**: 0.5.

The line is the stored closing line. Live state (score, clock, possession) is ignored, so a game 28–0
at halftime still counts at its pregame odds. NFL ties (~0.3%) aren't drawn.

## The week (13.2)

- A Monte Carlo over the week's **undecided** games, 10,000 sims. A cap of 4M member×game additions
  lowers that for big groups (floor 2,000). A 20-member, 16-game week takes ~0.15 s locally.
- **Scoring is grade.py's.** grade.grade is a sum over games, so each sheet is graded once per outcome of
  each undecided game. A sim then adds those deltas. A test checks this against a full grade.grade.
- **The winner is standings.weekly_winners.** Only complete sheets can win, and a missed week can't.
  A split pot gives each member 1/k of the sim.
- **MNF tiebreak.** A decided tiebreak game uses its real total. An undecided one draws its total from
  N(over/under, **13.5**), rounded and floored at 0, independent of the drawn winner. With no
  over/under, a tie on points splits evenly.
- **Seed**: the RESULT's inputHash, so an unchanged week gives the same numbers on every regrade.

## Rooting guide (13.4)

From the same sims: for each member and undecided game, P(win the week | away wins) and
P(win | home wins). Root for the side with the higher one; the gap is the swing. A side that never
won in the sims (a certain game) has no conditional, and is shown as no swing.

## The season (13.3)

Season members only, 10,000 sims, read off the RESULT items:

- **Known**: every graded week but the latest open one counts at its graded yearly score. An older week
  still waiting on a postponed game counts as graded so far.
- **The open week**: season sim k takes week sim k's yearly scores, so this week's scores keep their
  joint distribution (two members on the same side of a game rise and fall together). A season member
  with no sheet gets the missed score for that sim: the lowest season sheet minus 1.
- **Future weeks: an approximation.** Picks are unknown, so each member's remaining n weeks are one draw
  from N(n·mean, √n·SD) of their own past yearly week scores. Members are independent, though in
  reality they share game outcomes. Under two weeks of history, the group's pooled scores stand in. In
  Week 1 that pool is the open week's sims. The missed-week rule isn't modelled forward, beyond
  being in the history.
- **Ties** on the total go to GOW points from the known weeks (the real tiebreak), then split.
- Recomputed with every regrade that changes a RESULT, so it moves per game as well as per week.

## When it runs

`results.regrade` writes `GROUP#g#S<yr>#W<nn> / ANALYTICS` with each RESULT it rewrites, so every final,
override, cancel or new sheet refreshes the odds. It also writes the item when it's missing or older than
`analytics.MODEL`, which backfills existing weeks on the first hourly sweep. Lines aren't RESULT inputs,
so a line that moves between lock and a later kickoff is picked up at the next final.
`GET /analytics/week` reads it. The regrade never touches an unlocked week, so nothing exists before lock.
