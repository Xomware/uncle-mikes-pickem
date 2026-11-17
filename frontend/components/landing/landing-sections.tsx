import { CalendarClock, ChevronDown, CloudSun, Mail, Percent, Printer, UsersRound, WalletCards } from "lucide-react";
import type { ReactNode } from "react";

import { Goalpost } from "@/components/field/icons";
import { Helmet } from "@/components/field/helmet";
import { LandingCta } from "@/components/landing/landing-cta";
import { delay, reveal } from "@/components/landing/reveal";
import { cn } from "@/lib/utils";

// Every name and score below is invented.

interface HeadingProps {
  id: string;
  eyebrow: string;
  children: ReactNode;
  className?: string;
}

function Heading({ id, eyebrow, children, className }: HeadingProps) {
  return (
    <div {...reveal()}>
      <p className="chalk text-sm">{eyebrow}</p>
      <h2 id={id} className={cn("paint worn mt-2 text-5xl leading-[0.95] sm:text-7xl", className)}>
        {children}
      </h2>
    </div>
  );
}

interface RulesProps {
  items: string[];
}

function Rules({ items }: RulesProps) {
  return (
    <ul className="mt-6 space-y-3">
      {items.map((r, i) => (
        <li key={r} className="flex gap-3 text-lg leading-snug" {...reveal(i + 1)}>
          <span aria-hidden="true" className="mt-2.5 h-[3px] w-5 shrink-0 bg-primary" />
          {r}
        </li>
      ))}
    </ul>
  );
}

const BOARD = [
  { place: "1*", name: "Sal", week: 43, season: 312, note: "MNF 44" },
  { place: "1*", name: "Aunt Dee", week: 43, season: 298, note: "MNF 51" },
  { place: "3", name: "Big Tony", week: 41, season: 305 },
  { place: "4", name: "Vinnie", week: 27, season: 287 },
  { place: "5", name: "Mo", week: 26, season: 270, note: "Missed" },
];

export function Standings() {
  return (
    <section id="standings" aria-labelledby="standings-title" className="scroll-mt-16 py-16 lg:py-24">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16">
        <div>
          <Heading id="standings-title" eyebrow="Standings">
            Week and season
          </Heading>
          <div className="panel mt-6 p-5" {...reveal(1)}>
            <p className="text-lg leading-relaxed">
              Top score takes the week. The season board adds every week up, Game of the Week doubles included.
            </p>
            <Rules
              items={[
                "Tied on the week? Closest guess at the Monday night total wins it.",
                "Didn't submit? You get last place minus 1.",
                "Season tie goes to whoever banked more Game of the Week points.",
              ]}
            />
          </div>
        </div>

        <figure className="scoreboard p-3 sm:p-5" {...reveal(2)}>
          <figcaption className="flex items-baseline justify-between border-b border-chalk/10 px-1 pb-2">
            <span className="led text-2xl">WEEK 7 FINAL</span>
            <span className="led text-base text-primary">MNF TOTAL 47</span>
          </figcaption>
          <table className="mt-2 w-full border-separate border-spacing-y-1 text-left">
            <thead className="font-display text-xs tracking-[0.2em] text-muted-foreground uppercase">
              <tr>
                <th scope="col" className="w-10 px-2 font-bold">
                  #
                </th>
                <th scope="col" className="px-2 font-bold">
                  Player
                </th>
                <th scope="col" className="px-2 text-right font-bold">
                  Week
                </th>
                <th scope="col" className="px-2 text-right font-bold">
                  Season
                </th>
              </tr>
            </thead>
            <tbody>
              {BOARD.map((r, i) => (
                <tr key={r.name} className="lx-slide bg-chalk/5" style={delay(300 + i * 120)}>
                  <td className="rounded-l-md px-2 py-2 led text-xl">{r.place}</td>
                  <td className="px-2 py-2">
                    <span className="font-display text-xl font-extrabold">{r.name}</span>
                    {r.note && (
                      <span
                        className={cn(
                          "ml-2 font-display text-xs font-bold tracking-[0.15em] uppercase",
                          r.note === "Missed" ? "text-wrong" : "text-muted-foreground",
                        )}
                      >
                        {r.note}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right led text-xl">{r.week}</td>
                  <td className="rounded-r-md px-2 py-2 text-right led text-xl">{r.season}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="lx-pop mx-1 mt-3 w-fit font-display text-sm font-bold tracking-[0.15em] text-primary uppercase" style={delay(1100)}>
            Sal wins the week, 3 off the Monday total
          </p>
        </figure>
      </div>
    </section>
  );
}

const ENTRIES = [
  { name: "Entry 1", picks: ["BUF", "PHI", "DET", "BAL"], state: "Alive" },
  { name: "Entry 2", picks: ["KC", "SF", "LAR", "GB"], lost: 1, state: "Last life" },
  { name: "Entry 3", picks: ["DAL", "MIA", "NYJ"], lost: 2, state: "Out, week 3" },
];

export function SuddenDeath() {
  return (
    <section id="sudden-death" aria-labelledby="sd-title" className="night scroll-mt-16 py-16 lg:py-24">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16">
        <div>
          <Heading id="sd-title" eyebrow="The death pool" className="text-blood [text-shadow:0.035em_0.045em_0_oklch(0.1_0.02_20)]">
            Sudden Death
          </Heading>
          <p className="mt-5 max-w-prose text-lg leading-relaxed" {...reveal(1)}>
            Runs alongside the pick-em with its own pot. One team a week. Win and you&apos;re through.
          </p>
          <Rules
            items={[
              "Each team once a season.",
              "Lose, tie or miss a pick and you're out.",
              "Optional second life, if your organizer turns it on before week 1.",
              "Everyone goes out the same week? Everyone's back.",
              "Last entry standing takes the pot.",
            ]}
          />
        </div>

        <figure className="scoreboard overflow-hidden p-0" {...reveal(2)}>
          <figcaption className="flex items-center justify-between gap-3 bg-blood/25 px-4 py-2.5">
            <span className="led text-xl text-wrong [text-shadow:0_0_8px_var(--blood)]">OVERTIME</span>
            <span aria-hidden="true" className="siren size-3 rounded-full bg-blood shadow-[0_0_12px_var(--blood)]" />
          </figcaption>
          <ul className="divide-y divide-chalk/10 p-3 sm:p-4">
            {ENTRIES.map((e, i) => {
              const out = e.state.startsWith("Out");
              return (
                <li key={e.name} className="lx-slide flex items-center gap-3 py-3" style={delay(250 + i * 160)}>
                  <Helmet out={out} className="h-10 w-11 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-baseline justify-between gap-2">
                      <span className="font-display text-lg font-extrabold uppercase">{e.name}</span>
                      <span
                        className={cn(
                          "font-display text-xs font-bold tracking-[0.15em] uppercase",
                          out ? "text-wrong" : e.lost ? "text-primary" : "text-correct",
                        )}
                      >
                        {e.state}
                      </span>
                    </p>
                    <ol className="mt-1.5 flex flex-wrap gap-1.5">
                      {e.picks.map((t, w) => {
                        const lost = e.lost === w;
                        return (
                          <li
                            key={t}
                            className={cn(
                              "relative inline-flex h-7 items-center rounded-sm px-1.5 font-display text-sm font-bold",
                              lost ? "bg-blood/30 text-chalk" : "bg-chalk/10 text-chalk/85",
                            )}
                          >
                            <span className="mr-1 text-[0.7rem] text-muted-foreground">W{w + 1}</span>
                            {t}
                            {lost && (
                              <span
                                aria-hidden="true"
                                className="lx-strike absolute inset-x-1 top-1/2 h-[3px] -rotate-12 bg-blood"
                                style={delay(900 + i * 160)}
                              />
                            )}
                            {lost && <span className="sr-only"> lost</span>}
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                </li>
              );
            })}
          </ul>
        </figure>
      </div>
    </section>
  );
}

const FEATURES = [
  {
    icon: UsersRound,
    title: "Groups and invites",
    text: "Start a group, send the link. The organizer sets the fees, the lock, the tie rules and the second life.",
  },
  {
    icon: WalletCards,
    title: "Who's paid",
    text: "Venmo, Zelle, Cash App or cash: the organizer ticks off who's in. No money moves through the app.",
  },
  {
    icon: CloudSun,
    title: "Game info and Film Room",
    text: "Lines, injuries, weather and head-to-head on every game, plus an AI Film Room preview before you pick.",
  },
  {
    icon: Percent,
    title: "Win odds",
    text: "After lock, everyone's chances to take the week and the season, and a rooting guide for what you need.",
  },
  { icon: Printer, title: "Printable sheets", text: "Print the week like the old spreadsheet, for the fridge or the bar." },
  {
    icon: Mail,
    title: "Emails",
    text: "Results, weekly winners, Sudden Death knockouts and late-pick reminders, straight to your inbox.",
  },
];

// Yard numbers count up to midfield and back down, like walking the field.
const YARDS = [10, 20, 30, 40, 50, 40];

export function Features() {
  return (
    <section id="features" aria-labelledby="features-title" className="scroll-mt-16 py-16 lg:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Heading id="features-title" eyebrow="Everything else">
          Run the whole pool
        </Heading>
        <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text }, i) => (
            <li
              key={title}
              className="panel group relative overflow-hidden p-5 transition-transform duration-200 hover:-translate-y-1"
              {...reveal(i % 3)}
            >
              <span
                aria-hidden="true"
                className="lx-wipe paint worn absolute top-2 right-3 text-7xl leading-none text-chalk/15 transition-colors group-hover:text-primary/30"
                style={delay(200 + (i % 3) * 120)}
              >
                {YARDS[i]}
              </span>
              <Icon className="size-8 text-primary" aria-hidden="true" />
              <h3 className="mt-4 text-2xl leading-tight font-extrabold uppercase">{title}</h3>
              <p className="mt-2 leading-relaxed text-muted-foreground">{text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const FAQ = [
  {
    q: "Does money go through the app?",
    a: "No. The organizer sets the fees and payment handles, and marks who has paid. You pay them however your group already does.",
  },
  {
    q: "What if I forget to pick?",
    a: "A missed week scores the lowest submitted score minus 1. In Sudden Death a missed pick counts as a loss.",
  },
  { q: "Can people see my picks?", a: "Not until the week's first kickoff. Then the whole group can." },
  {
    q: "What if a game gets canceled?",
    a: "It comes off the week, so the top confidence number drops by one. Your organizer can change how that works.",
  },
  { q: "How do I join a group?", a: "Sign in with Google and open the invite link from your organizer." },
];

export function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="scroll-mt-16 py-16 lg:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <Heading id="faq-title" eyebrow="Questions">
          Ask the ref
        </Heading>
        <div className="mt-8 space-y-3">
          {FAQ.map(({ q, a }, i) => (
            <details key={q} className="panel group" {...reveal(i)}>
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-5 py-3 font-display text-xl font-extrabold uppercase outline-none focus-visible:ring-3 focus-visible:ring-ring/60 [&::-webkit-details-marker]:hidden">
                {q}
                <ChevronDown aria-hidden="true" className="size-5 shrink-0 text-primary transition-transform group-open:rotate-180" />
              </summary>
              <p className="px-5 pb-5 text-lg leading-relaxed text-muted-foreground">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section aria-labelledby="kickoff-title" className="endzone border-t-6 border-t-chalk">
      <div className="mx-auto flex max-w-3xl flex-col items-center px-4 py-16 text-center sm:py-20" {...reveal()}>
        <CalendarClock className="size-10 text-primary" aria-hidden="true" />
        <h2 id="kickoff-title" className="paint worn mt-4 text-5xl leading-[0.95] sm:text-7xl">
          Kickoff&apos;s Thursday
        </h2>
        <p className="mt-4 max-w-md text-lg leading-relaxed text-chalk">
          Sign in with Google to start a group or join one. Your group&apos;s Sunday, scored.
        </p>
        <div className="mt-7 w-full sm:w-auto [&>*]:w-full sm:[&>*]:w-auto">
          <LandingCta />
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="bg-card">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 py-8 text-center text-sm text-muted-foreground sm:flex-row sm:justify-between sm:text-left">
        <span className="flex items-center gap-2">
          <Goalpost className="h-6 w-5 text-primary" />
          Uncle Mike&apos;s Pick Em
        </span>
        <span>Not affiliated with the NFL or any team.</span>
        <a
          href="https://xomware.com"
          className="inline-flex min-h-11 items-center rounded-sm px-2 underline-offset-4 outline-none hover:text-chalk hover:underline focus-visible:ring-3 focus-visible:ring-ring/60"
        >
          A Xomware app
        </a>
      </div>
    </footer>
  );
}
