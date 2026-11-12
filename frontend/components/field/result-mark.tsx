import { PenaltyFlag } from "@/components/field/icons";
import { cn } from "@/lib/utils";

interface ResultMarkProps {
  result: "correct" | "wrong";
  className?: string;
}

/** A chalk TD stamp for a correct pick, a thrown flag for a wrong one. Carries its own sr-only word. */
export function ResultMark({ result, className }: ResultMarkProps) {
  if (result === "wrong") {
    return (
      <span className={cn("inline-flex", className)}>
        <PenaltyFlag className="size-[1.9em]" />
        <span className="sr-only">Wrong</span>
      </span>
    );
  }
  return (
    <span className={cn("inline-flex", className)}>
      <span
        aria-hidden="true"
        className="worn inline-block -rotate-8 rounded-[3px] border-2 border-current px-[0.3em] pt-[0.12em] pb-[0.04em] font-stencil leading-none font-black tracking-wide text-correct"
      >
        TD
      </span>
      <span className="sr-only">Correct</span>
    </span>
  );
}
