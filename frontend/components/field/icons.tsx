import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

/** The brand mark: a slingshot goalpost. */
export function Goalpost(props: IconProps) {
  return (
    <svg viewBox="0 0 32 40" fill="none" aria-hidden="true" {...props}>
      <g stroke="currentColor" strokeWidth="3.2" strokeLinecap="square">
        <path d="M16 39V30c0-3-2-4-2-6" />
        <path d="M5 22h22M5 22V2.5M27 22V2.5" />
      </g>
      <path d="M5 1 .6 3.2 5 5.4zM27 1l4.4 2.2L27 5.4z" fill="oklch(0.66 0.2 40)" />
    </svg>
  );
}

/** A thrown penalty flag, weighted knot at the corner. */
export function PenaltyFlag(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        d="M5.5 5.2c4-2.2 7.6 1.6 14.6-.6l-2.6 9.3c-6.4 2.1-9.8-1.6-14 .5z"
        fill="var(--flag)"
        stroke="oklch(0.3 0.06 90)"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path d="M8 7.6c2.6-.5 5 .7 8.4.1" stroke="oklch(0.62 0.13 90)" strokeWidth="1" fill="none" />
      <circle cx="4.6" cy="5.4" r="2.6" fill="oklch(0.93 0.12 98)" stroke="oklch(0.3 0.06 90)" strokeWidth="1.1" />
      <path d="M4 7.6 2.6 12M5.6 7.8l.6 3.6" stroke="oklch(0.3 0.06 90)" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

/** The coin toss coin: milled rim, goalpost on the face. */
export function Coin(props: IconProps) {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true" {...props}>
      <circle cx="20" cy="20" r="19" fill="oklch(0.78 0.11 85)" />
      <circle cx="20" cy="20" r="17" fill="none" stroke="oklch(0.55 0.09 80)" strokeWidth="2.4" strokeDasharray="1.2 1.2" />
      <circle cx="20" cy="20" r="14.5" fill="oklch(0.84 0.12 88)" stroke="oklch(0.6 0.1 80)" strokeWidth="1" />
      <g stroke="oklch(0.45 0.08 75)" strokeWidth="2" strokeLinecap="square" fill="none">
        <path d="M20 30v-6M13 24h14M13 24v-12M27 24v-12" />
      </g>
    </svg>
  );
}

/** A bank of stadium lights on its pole, for Primetime. */
export function LightBank(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <rect x="3" y="2" width="18" height="11" rx="1.5" fill="oklch(0.3 0.01 70)" />
      {[6.5, 12, 17.5].flatMap((x) =>
        [5.3, 9.7].map((y) => <circle key={`${x}${y}`} cx={x} cy={y} r="2" fill="oklch(0.98 0.06 95)" />),
      )}
      <path d="M12 13v10" stroke="oklch(0.55 0.01 70)" strokeWidth="2" />
    </svg>
  );
}
