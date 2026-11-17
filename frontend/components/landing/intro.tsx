"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";

import { Helmet } from "@/components/field/helmet";
import { LightBank } from "@/components/field/icons";
import { Wordmark } from "@/components/landing/wordmark";
import { endIntro, INTRO_SCRIPT } from "@/lib/intro";

import styles from "./intro.module.css";

// Long enough for the skip fade in intro.module.css.
const SKIP_FADE = 260;

// An invented week: confidence 16 down to 1, each with a pick that went right or wrong.
const SHEET = [
  ["BUF", 1], ["PHI", 1], ["DET", 0], ["BAL", 1],
  ["KC", 1], ["SF", 0], ["GB", 1], ["MIA", 0],
  ["LAR", 1], ["HOU", 1], ["CIN", 0], ["DAL", 1],
  ["SEA", 0], ["MIN", 1], ["NYJ", 0], ["ATL", 1],
] as const;
const SCORE = SHEET.reduce((n, [, won], i) => n + (won ? 16 - i : 0), 0);

const YARDS = [10, 20, 30, 40, 50, 40, 30];
const BANKS = [8, 30, 70, 92];

const at = (ms: number) => ({ "--at": `${ms}ms` }) as CSSProperties;
const noSubscribe = () => () => {};
// The inline gate has already set this by the time React runs; a client-side trip to / has "done" or nothing.
const playing = () => document.documentElement.getAttribute("data-intro") === "play";

/**
 * The first-visit open, all CSS: the stadium lights flicker on over a dark
 * field and the yard lines chalk in, a scoreboard drops with a pick sheet
 * ranked 16 down to 1, the picks go green and red and the total counts up,
 * overtime turns the screen red for Sudden Death, then the lockup lands on
 * the end zone exactly where the hero has it, and the whole thing fades off it.
 *
 * Server-rendered so it moves from the first paint; the inline gate hides it
 * before then for repeat visits, members and reduced motion.
 */
export function Intro() {
  const allowed = useSyncExternalStore(noSubscribe, playing, () => true);
  const [done, setDone] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  const finish = useCallback(() => {
    endIntro(document, window);
    setDone(true);
  }, []);

  const skip = useCallback(() => {
    setLeaving(true);
    setTimeout(finish, SKIP_FADE);
  }, [finish]);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    // The stage's own fade-out is the clock; it started at first paint, before hydration.
    const [exit] = el.getAnimations();
    if (!exit) return finish();
    let live = true;
    // Skip swaps the animation, which rejects this; skip has its own timer.
    exit.finished.then(() => live && finish(), () => {});
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && skip();
    window.addEventListener("keydown", onKey);
    return () => {
      live = false;
      window.removeEventListener("keydown", onKey);
    };
  }, [finish, skip]);

  return (
    <>
      <script
        type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: INTRO_SCRIPT }}
      />
      {allowed && !done && (
        // A tap anywhere skips too; the button is the keyboard and screen reader way out.
        <div ref={root} className={styles.stage} data-leaving={leaving || undefined} onClick={skip}>
          <div aria-hidden="true" className={styles.scene}>
            <div className={styles.field}>
              <div className={styles.plane}>
                {YARDS.map((y, i) => (
                  <span key={i} className={styles.yard} style={{ ...at(350 + i * 90), top: `${8 + i * 13}%` }}>
                    <span className={styles.yardNumber}>{y}</span>
                  </span>
                ))}
              </div>
            </div>
            <div className={styles.dark} />
            {BANKS.map((x, i) => (
              <div key={x} className={styles.bank} style={{ ...at(120 + i * 170), left: `${x}%` }}>
                <span className={styles.cone} />
                <LightBank className={styles.lights} />
              </div>
            ))}

            <div className={`scoreboard ${styles.board}`}>
              <p className={styles.boardHead}>
                <span className="led">WEEK 1</span>
                <span className="led">CONFIDENCE</span>
              </p>
              <ol className={styles.tiles}>
                {SHEET.map(([team, won], i) => (
                  <li
                    key={team}
                    className={styles.tile}
                    data-won={won ? "" : undefined}
                    style={{ ...at(1650 + i * 65), "--flash": `${2950 + i * 35}ms` } as CSSProperties}
                  >
                    <span className={styles.conf}>{16 - i}</span>
                    <span className={styles.team}>{team}</span>
                  </li>
                ))}
              </ol>
              <p className={styles.total}>
                <span className={styles.totalLabel}>Total</span>
                <span className={`led ${styles.score}`} style={{ "--score-to": SCORE } as CSSProperties} />
              </p>
            </div>

            <div className={styles.flash} />
            <div className={styles.overtime}>
              <span className={`led ${styles.otLed}`}>OVERTIME</span>
              <span className={`paint ${styles.sudden}`}>Sudden Death</span>
              <Helmet out className={styles.helmet} />
            </div>

            <div className={`endzone ${styles.endzone}`}>
              <div className={styles.lockup}>
                <Wordmark as="div" />
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              skip();
            }}
            className={styles.skip}
          >
            Skip intro
          </button>
        </div>
      )}
    </>
  );
}
