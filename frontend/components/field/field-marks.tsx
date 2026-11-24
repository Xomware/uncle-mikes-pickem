// Matches --yard in globals.css: the body's chalk lines sit on the last 3px of every 5 yards.
// The page opens on the 25 so midfield, and the logo on it, lands within the first screen.
const YARD = 24;
const YARDS = [10, 20, 30, 40, 50, 40, 30, 20, 10];

function Numbers({ side }: { side: "left" | "right" }) {
  const left = side === "left";
  return (
    <svg className={`field-numbers ${side}`}>
      <defs>
        <pattern id={`yards-${side}`} y={YARD * -25} width="80" height={YARD * 100} patternUnits="userSpaceOnUse">
          {YARDS.map((n, i) => {
            // Bottoms face the sideline; the arrow sits on the near goal line's side.
            const toGoal = (i < 4 ? -1 : 1) * (left ? 1 : -1);
            const [a, b] = String(n);
            return (
              <g key={i} transform={`translate(${left ? 50 : 30} ${YARD * 10 * (i + 1) - 1.5}) rotate(${left ? 90 : -90})`}>
                <text x="-7" y="15" textAnchor="end">
                  {a}
                </text>
                <text x="7" y="15">
                  {b}
                </text>
                {n !== 50 && <path d={toGoal < 0 ? "M-60 -8 l10 -6 v12z" : "M60 -8 l-10 -6 v12z"} />}
              </g>
            );
          })}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#yards-${side})`} />
    </svg>
  );
}

/** Paint on the grass behind every page: yard numbers down both sidelines and the logo at midfield. */
export function FieldMarks() {
  return (
    <div aria-hidden="true" className="field-marks">
      <Numbers side="left" />
      <Numbers side="right" />
      <div className="midfield" />
    </div>
  );
}
