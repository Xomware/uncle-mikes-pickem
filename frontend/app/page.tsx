import { Skull, Trophy, UsersRound } from "lucide-react";

import { Brand } from "@/components/brand";
import { ExampleSheet } from "@/components/landing/example-sheet";
import { LandingCta } from "@/components/landing/landing-cta";

const POINTS = [
  { icon: Trophy, text: "Pick every game and rank it by confidence. Right picks score their number." },
  { icon: Skull, text: "Run a death pool alongside it: one team a week, each team once." },
  { icon: UsersRound, text: "Private groups only. Picks stay hidden until the week locks." },
];

export default function LandingPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 pt-6 pb-10 sm:px-6">
      <Brand href="/" />

      <div className="mt-10 grid gap-10 md:mt-16 md:grid-cols-[1.1fr_1fr] md:items-center">
        <section>
          <h1 className="font-display text-5xl leading-[1.05] font-bold uppercase sm:text-6xl">
            Your group&apos;s Sunday, <span className="text-primary">scored.</span>
          </h1>
          <p className="mt-4 max-w-prose text-lg leading-relaxed text-muted-foreground">
            The weekly confidence pick-em and death pool your group already runs, without the spreadsheet.
          </p>
          <div className="mt-8">
            <LandingCta />
          </div>
          <ul className="mt-8 space-y-3">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex gap-3 leading-relaxed">
                <Icon className="mt-1 size-5 shrink-0 text-primary" aria-hidden="true" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </section>

        <ExampleSheet />
      </div>
    </main>
  );
}
