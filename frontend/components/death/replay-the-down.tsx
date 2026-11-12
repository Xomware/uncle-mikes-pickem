import { PenaltyFlag } from "@/components/field/icons";

/** The revive rule, as the referee would announce it. */
export function ReplayTheDown() {
  return (
    <aside className="mt-6 flex items-center gap-3 rounded-lg border-y-4 border-flag bg-[repeating-linear-gradient(-45deg,oklch(0.2_0.02_90)_0_10px,oklch(0.17_0.015_90)_10px_20px)] px-4 py-3">
      <PenaltyFlag className="size-10 shrink-0" />
      <p className="min-w-0">
        <span className="block font-stencil text-2xl leading-none font-black tracking-wide text-flag uppercase">
          Replay the down
        </span>
        <span className="mt-1 block text-sm text-muted-foreground">
          If every helmet still lit goes down in the same week on its last life, they all come back.
        </span>
      </p>
    </aside>
  );
}
