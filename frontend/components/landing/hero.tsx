import { ChevronDown } from "lucide-react";

import { LightBank } from "@/components/field/icons";
import { LandingCta } from "@/components/landing/landing-cta";
import { delay } from "@/components/landing/reveal";
import { Wordmark } from "@/components/landing/wordmark";
import { buttonVariants } from "@/components/ui/button";

const TICKER = [
  "Picks lock at the first kickoff",
  "Rank every game 16 down to 1",
  "Game of the Week counts double",
  "Monday night total breaks the tie",
  "Sudden Death: one team a week, each team once",
  "Missed week: last place minus 1",
];

function TickerRun() {
  return (
    <span className="flex shrink-0 items-center">
      {TICKER.map((t) => (
        <span key={t} className="led flex items-center px-5 text-lg whitespace-nowrap uppercase">
          {t}
          <span className="ml-10 inline-block size-2 rotate-45 bg-primary" />
        </span>
      ))}
    </span>
  );
}

/** The end zone under the lights: the lockup, what this is in one line, the way in, and the rules crawling past. */
export function Hero() {
  return (
    <div className="endzone relative isolate overflow-hidden pt-16">
      <div aria-hidden="true" className="absolute inset-0 -z-10">
        <span data-side="left" className="hero-beam" />
        <span data-side="right" className="hero-beam" />
        <LightBank data-side="left" className="hero-bank absolute top-18 left-1 size-12 -rotate-12 sm:top-20 sm:left-6 sm:size-20" />
        <LightBank data-side="right" className="hero-bank absolute top-18 right-1 size-12 rotate-12 sm:top-20 sm:right-6 sm:size-20" />
      </div>

      <div className="mx-auto flex max-w-5xl flex-col items-center px-4 pt-8 pb-10 text-center sm:pt-12 sm:pb-14">
        <Wordmark />
        <p className="hero-rise mt-7 max-w-xl text-lg leading-relaxed text-chalk sm:text-xl" style={delay(1100)}>
          The weekly confidence pick-em and death pool your group already runs, without the spreadsheet.
        </p>
        <div
          className="hero-rise mt-7 flex w-full flex-col gap-3 sm:w-auto sm:flex-row [&>*]:w-full sm:[&>*]:w-auto"
          style={delay(1250)}
        >
          <LandingCta />
          <a
            href="#how"
            className={buttonVariants({
              variant: "outline",
              size: "lg",
              className: "w-full border-chalk/50 bg-transparent text-chalk hover:bg-chalk/10 sm:w-auto dark:bg-transparent",
            })}
          >
            How it works
            <ChevronDown className="scroll-cue" aria-hidden="true" />
          </a>
        </div>
      </div>

      <div aria-hidden="true" className="overflow-hidden border-y border-chalk/15 bg-board py-2.5">
        <div className="ticker">
          <TickerRun />
          <TickerRun />
        </div>
      </div>
    </div>
  );
}
