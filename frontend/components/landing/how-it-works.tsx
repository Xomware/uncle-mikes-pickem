"use client";

import { Lock } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { LightBank } from "@/components/field/icons";
import { ResultMark } from "@/components/field/result-mark";
import { delay } from "@/components/landing/reveal";
import { cn } from "@/lib/utils";

const STEPS = [
  { title: "Pick every game", text: "Every game on the slate, every week. Tap the team you think wins." },
  {
    title: "Rank your confidence",
    text: "Give each game a number from 16 down to 1, each one once. Your lock of the week gets 16, your coin flip gets 1.",
  },
  {
    title: "Locked at kickoff",
    text: "Every pick locks at the week's first kickoff, usually Thursday night. Until then nobody sees your sheet. After, the whole group does.",
  },
  { title: "Score it", text: "Right pick, you bank its number. Wrong pick, zero. Green or red, game by game." },
  {
    title: "Game of the Week",
    text: "One game a week counts double on the season board. Get it wrong and its number comes off your season total.",
  },
];

// An invented week. Rows run in kickoff order, not by confidence.
const GAMES = [
  { away: "PIT", home: "BAL", pick: "home", confidence: 13, result: "correct" },
  { away: "DET", home: "GB", pick: "away", confidence: 15, result: "wrong" },
  { away: "KC", home: "BUF", pick: "home", confidence: 16, result: "correct", gow: true },
  { away: "DAL", home: "PHI", pick: "home", confidence: 14, result: "correct" },
  { away: "SF", home: "SEA", pick: "away", confidence: 12, result: "wrong" },
] as const;

const WEEK = GAMES.reduce((n, g) => n + (g.result === "correct" ? g.confidence : 0), 0);
const SEASON = GAMES.reduce((n, g) => n + (g.result === "correct" ? g.confidence * ("gow" in g ? 2 : 1) : 0), 0);

/** Five steps down the left, and a sample sheet that fills in to match whichever one is mid-screen. */
export function HowItWorks() {
  // -1 until the first step scrolls in, so the picks go in as the reader arrives.
  const [step, setStep] = useState(-1);
  const items = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    let frame = 0;
    // The current step is the last one whose top has passed 60% down the screen, below where the sheet sticks on a phone.
    const update = () => {
      frame = 0;
      const line = window.innerHeight * 0.6;
      setStep(items.current.findLastIndex((el) => el !== null && el.getBoundingClientRect().top <= line));
    };
    const onScroll = () => {
      frame ||= requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <section id="how" aria-labelledby="how-title" className="scroll-mt-16 py-16 lg:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="chalk text-sm">How it works</p>
        <h2 id="how-title" className="paint worn mt-2 text-5xl leading-[0.95] sm:text-7xl">
          One sheet a week
        </h2>

        <div className="mt-8 grid grid-cols-1 gap-x-14 lg:grid-cols-[1fr_minmax(0,30rem)]">
          <div className="sticky top-18 z-10 lg:order-last lg:top-24 lg:self-start">
            <SampleSheet step={step} />
          </div>
          <ol className="mt-4 lg:mt-0">
            {STEPS.map((s, i) => (
              <li
                key={s.title}
                ref={(el) => {
                  items.current[i] = el;
                }}
                data-step={i}
                aria-current={step === i ? "step" : undefined}
                className="flex min-h-[46vh] items-start gap-4 py-6 lg:min-h-[58vh] lg:items-center"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "sheet-step flex size-12 shrink-0 items-center justify-center rounded-sm font-stencil text-2xl font-black",
                    step === i ? "bg-primary text-primary-foreground" : "bg-card text-chalk shadow-[inset_0_-3px_0_var(--chalk)]",
                  )}
                >
                  {i + 1}
                </span>
                <div className={cn("panel sheet-step max-w-md p-5", step === i ? "opacity-100" : "opacity-75")}>
                  <h3 className="text-2xl leading-tight font-extrabold uppercase sm:text-3xl">{s.title}</h3>
                  <p className="mt-2 text-lg leading-relaxed text-muted-foreground">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

interface SampleSheetProps {
  step: number;
}

function SampleSheet({ step }: SampleSheetProps) {
  const locked = step >= 2;
  const scored = step >= 3;
  const gow = step >= 4;
  return (
    <figure
      className="scoreboard relative p-3 sm:p-4"
      aria-label={`Sample week: ${STEPS[Math.max(step, 0)].title}`}
    >
      <figcaption className="flex items-center justify-between gap-2 border-b border-chalk/10 px-1 pb-2">
        <span className="led text-xl sm:text-2xl">WEEK 7</span>
        <span
          className={cn(
            "flex items-center gap-1.5 font-display text-xs font-bold tracking-[0.18em] uppercase sm:text-sm",
            locked ? "text-primary" : "text-muted-foreground",
          )}
        >
          {locked && <Lock className="size-3.5" aria-hidden="true" />}
          {locked ? "Locked, group can see" : "Hidden till kickoff"}
        </span>
      </figcaption>

      <ol className="mt-2 space-y-1" aria-hidden="true">
        {GAMES.map((g, i) => {
          const shown = { correct: "bg-correct-muted", wrong: "bg-wrong-muted" }[g.result];
          const isGow = "gow" in g && gow;
          return (
            <li
              key={g.home}
              style={delay(i * 70)}
              className={cn(
                "sheet-step flex min-h-12 items-center gap-2 rounded-md px-1.5 py-1 sm:gap-3",
                scored ? shown : "bg-chalk/5",
                isGow && "shadow-[inset_0_0_0_2px_var(--primary)]",
              )}
            >
              <span
                style={delay(i * 90)}
                className={cn(
                  "sheet-step flex size-10 shrink-0 items-center justify-center rounded-sm bg-turf font-stencil text-xl font-black text-chalk shadow-[inset_0_-3px_0_var(--chalk)]",
                  step >= 1 ? "scale-100 opacity-100" : "scale-150 opacity-0",
                )}
              >
                {g.confidence}
              </span>
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <Team code={g.away} picked={step >= 0 && g.pick === "away"} dim={step >= 1} at={i * 110} />
                <span className="text-xs text-muted-foreground">@</span>
                <Team code={g.home} picked={step >= 0 && g.pick === "home"} dim={step >= 1} at={i * 110} />
                {isGow && <LightBank className="ml-1 size-5 shrink-0" />}
              </span>
              <span className={cn("sheet-step w-9", scored ? "opacity-100" : "opacity-0")} style={delay(i * 90)}>
                {scored && <ResultMark result={g.result} className="text-sm" />}
              </span>
              <span className="led w-14 text-right text-xl">
                {!scored ? "--" : g.result === "wrong" ? 0 : g.confidence * (isGow ? 2 : 1)}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-1.5 px-1 text-sm text-muted-foreground" aria-hidden="true">
        + 11 more games, 11 down to 1
      </p>

      <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-chalk/10 px-1 pt-2" aria-hidden="true">
        <span className="font-display text-sm font-bold tracking-[0.2em] text-muted-foreground uppercase">
          {gow ? "Week / Season" : "Week"}
        </span>
        <span className="led text-2xl sm:text-3xl">{scored ? (gow ? `${WEEK} / ${SEASON}` : WEEK) : "--"}</span>
      </div>

      <span
        aria-hidden="true"
        className={cn(
          "lock-stamp pointer-events-none absolute top-1/2 left-1/2 -translate-1/2 -rotate-12 rounded-sm border-4 border-primary bg-board/80 px-4 py-1 font-stencil text-4xl font-black tracking-widest text-primary uppercase",
          step === 2 ? "scale-100 opacity-100" : "scale-150 opacity-0",
        )}
      >
        Locked
      </span>
    </figure>
  );
}

interface TeamProps {
  code: string;
  picked: boolean;
  dim: boolean;
  at: number;
}

function Team({ code, picked, dim, at }: TeamProps) {
  return (
    <span
      style={delay(at)}
      className={cn(
        "sheet-step inline-flex h-8 min-w-12 items-center justify-center rounded-sm border-2 px-1.5 font-display text-base font-extrabold tracking-wide",
        picked ? "border-primary bg-primary text-primary-foreground" : "border-chalk/25 text-chalk",
        !picked && dim && "opacity-40",
      )}
    >
      {code}
    </span>
  );
}
