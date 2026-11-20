import { Helmet } from "@/components/field/helmet";
import { LightBank } from "@/components/field/icons";

interface LockupProps {
  alive: number;
  total: number;
}

const BEAM = "pointer-events-none absolute inset-0 opacity-70 blur-[2px]";

/** The Sudden Death mark under two banks of floodlights, with how many helmets are still lit. */
export function SuddenDeathLockup({ alive, total }: LockupProps) {
  return (
    <header className="relative overflow-hidden rounded-xl border border-blood/40 bg-[oklch(0.11_0.012_20)] px-4 pt-7 pb-4 text-center">
      <span
        aria-hidden="true"
        className={`${BEAM} bg-[conic-gradient(from_128deg_at_8%_0%,transparent_0deg,oklch(0.96_0.015_240/0.22)_14deg,transparent_34deg)]`}
      />
      <span
        aria-hidden="true"
        className={`${BEAM} bg-[conic-gradient(from_198deg_at_92%_0%,transparent_0deg,oklch(0.96_0.015_240/0.22)_20deg,transparent_34deg)]`}
      />
      <LightBank className="absolute top-1 left-2 size-7 -rotate-12" />
      <LightBank className="absolute top-1 right-2 size-7 rotate-12" />
      <h2 className="relative mx-auto w-full max-w-[22rem]">
        {/* eslint-disable-next-line @next/next/no-img-element -- static export, no image optimizer */}
        <img src="/brand/sudden-death.webp" alt="Sudden death overtime" width={1056} height={527} className="h-auto w-full" />
      </h2>
      <p className="relative mt-3 flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <Helmet className="h-5 w-6" />
        <span>
          <strong className="font-display text-base font-extrabold text-flood">{alive}</strong> of {total} still standing
        </span>
      </p>
    </header>
  );
}
