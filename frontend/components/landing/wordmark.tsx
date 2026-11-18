import { Goalpost } from "@/components/field/icons";

interface WordmarkProps {
  /** The hero's is the page heading; the intro's copy is decoration. */
  as?: "h1" | "div";
}

/** The goalpost and the end-zone lockup, at hero size. */
export function Wordmark({ as: Tag = "h1" }: WordmarkProps) {
  return (
    <div className="flex flex-col items-center">
      <Goalpost className="hero-post h-12 w-10 text-primary sm:h-16 sm:w-13" />
      <Tag className="mt-3 flex flex-col items-center">
        <span className="hero-paint paint worn text-[clamp(4.5rem,27vw,9.5rem)] leading-[0.9] [text-shadow:0.035em_0.045em_0_var(--primary)]">
          Uncle Mike&apos;s
        </span>
        <span className="hero-chalk chalk mt-3 flex items-center gap-3 text-xl tracking-[0.5em] sm:text-3xl">
          <span aria-hidden="true" className="h-[3px] w-8 bg-chalk/80 sm:w-16" />
          Pick Em
          <span aria-hidden="true" className="h-[3px] w-8 bg-chalk/80 sm:w-16" />
        </span>
      </Tag>
    </div>
  );
}
