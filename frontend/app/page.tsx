import { Goalpost } from "@/components/field/icons";
import { Helmet } from "@/components/field/helmet";
import { ExampleSheet } from "@/components/landing/example-sheet";
import { LandingCta } from "@/components/landing/landing-cta";

const POINTS = [
  { title: "Confidence picks", text: "Pick every game and rank it 16 down to 1. Right picks score their number." },
  { title: "Sudden death", text: "A death pool alongside it: one team a week, each team once." },
  { title: "Private groups", text: "Picks stay hidden from everyone until the week locks." },
];

export default function LandingPage() {
  return (
    <main className="flex flex-1 flex-col">
      <header className="endzone">
        <div className="mx-auto flex max-w-5xl flex-col items-center px-4 pt-8 pb-6 text-center sm:pt-12 sm:pb-9">
          <Goalpost className="h-12 w-10 text-primary sm:h-16 sm:w-13" />
          <h1 className="mt-3 flex flex-col items-center">
            <span className="paint worn text-[clamp(4.5rem,27vw,9.5rem)] leading-[0.9] [text-shadow:0.035em_0.045em_0_var(--primary)]">
              Uncle Mike&apos;s
            </span>
            <span className="chalk mt-3 flex items-center gap-3 text-xl tracking-[0.5em] sm:text-3xl">
              <span aria-hidden="true" className="h-[3px] w-8 bg-chalk/80 sm:w-16" />
              Pick Em
              <span aria-hidden="true" className="h-[3px] w-8 bg-chalk/80 sm:w-16" />
            </span>
          </h1>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-5xl gap-8 px-4 pt-8 pb-12 sm:px-6 md:grid-cols-[1fr_1fr] md:items-start md:pt-12">
        <section className="panel p-5 sm:p-7">
          <h2 className="font-display text-4xl leading-none font-extrabold uppercase sm:text-5xl">
            Your group&apos;s Sunday, <span className="text-primary">scored.</span>
          </h2>
          <p className="mt-4 max-w-prose text-lg leading-relaxed text-muted-foreground">
            The weekly confidence pick-em and death pool your group already runs, without the spreadsheet.
          </p>
          <div className="mt-6">
            <LandingCta />
          </div>
          <ul className="mt-7 space-y-4 border-t pt-6">
            {POINTS.map(({ title, text }, i) => (
              <li key={title} className="flex gap-4">
                {i === 1 ? (
                  <Helmet className="mt-0.5 h-8 w-9 shrink-0" />
                ) : (
                  <span
                    aria-hidden="true"
                    className="w-9 shrink-0 text-center font-stencil text-3xl leading-none font-black text-primary"
                  >
                    {i === 0 ? "16" : "1"}
                  </span>
                )}
                <span className="leading-relaxed">
                  <span className="block font-display text-lg font-bold tracking-wide uppercase">{title}</span>
                  <span className="text-muted-foreground">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <ExampleSheet />
      </div>
    </main>
  );
}
