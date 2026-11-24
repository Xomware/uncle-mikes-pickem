"use client";

import { BarChart3, ChevronRight, CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import { type CSSProperties, type ReactNode, useState } from "react";

import { LightBank } from "@/components/field/icons";
import { TeamLogo } from "@/components/field/team-logo";
import { GameInfoLink } from "@/components/game/game-info-link";
import { CopyPicks } from "@/components/picks/copy-picks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Game, type GroupSummary, type Team, type WeekView, setPicks } from "@/lib/api/client";
import { isOrganizer } from "@/lib/groups";
import { type ConfCheck, type Sheet, carry, checkConf, confError, isComplete, pickedCount, sameSheet, spreadText, toPayload, toSheet } from "@/lib/picks";
import { etTime } from "@/lib/time";
import { cn } from "@/lib/utils";

type SaveState = { kind: "idle" | "saving" } | { kind: "saved"; at: string } | { kind: "failed"; message: string };

interface Props {
  view: WeekView;
  locked: boolean;
  otherGroups: GroupSummary[];
}

export function PickSheet({ view, locked, otherGroups }: Props) {
  const { group, week, games, gow, role } = view;
  const [saved, setSaved] = useState<Sheet>(() => toSheet(games, view.mine));
  const [sheet, setSheet] = useState<Sheet>(saved);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [base, setBase] = useState(view);

  const byId = Object.fromEntries(games.map((g) => [g.gameId, g]));
  const editable = !locked && gow !== null;
  const dirty = !sameSheet(sheet, saved);

  // A refreshed week (live poll, an organizer change) updates the sheet in place and keeps a draft.
  if (base !== view) {
    setBase(view);
    const fresh = toSheet(games, view.mine);
    setSaved(fresh);
    setSheet(dirty ? carry(sheet, fresh) : fresh);
  }
  const check = checkConf(sheet);
  const canceled = games.filter((g) => g.canceled);
  const n = sheet.order.length;

  function edit(next: Sheet) {
    setSheet(next);
    setSave((s) => (s.kind === "saving" ? s : { kind: "idle" }));
  }


  async function submit() {
    setSave({ kind: "saving" });
    const { picks, tiebreak } = toPayload(sheet);
    try {
      const { pick } = await setPicks(group.groupId, week.week, picks, tiebreak);
      setSaved(sheet);
      setSave({ kind: "saved", at: pick.submittedAt });
    } catch (err) {
      setSave({ kind: "failed", message: err instanceof Error ? err.message : "Couldn't save." });
    }
  }

  return (
    <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-6">
      <div className="min-w-0">
        {!gow && !locked && (
          <p className="panel mb-4 p-3 text-sm text-muted-foreground">
            Picks open once the organizer chooses the game of the week.
            {isOrganizer(role) && " Choose it in the Organizer booth above."}
          </p>
        )}

        <h2 className="chalk mb-2 text-sm">My picks</h2>
        {editable && (
          <p className="mb-3 rounded-md bg-card/90 px-3 py-2 text-sm text-muted-foreground">
            Tap a team to pick it. Type your confidence in the box: {n} for your surest pick, 1 for your least. Each number once.
          </p>
        )}

        <ol className="space-y-2">
          {sheet.order.map((id, index) => (
            <GameRow
              key={id}
              index={index}
              groupId={group.groupId}
              dirty={dirty}
              game={byId[id]}
              conf={sheet.conf[id]}
              confIssue={confIssue(sheet, check, id, n)}
              team={sheet.teams[id]}
              isGow={gow?.gameId === id}
              tiebreak={
                week.tiebreakGameId === id
                  ? {
                      value: sheet.tiebreak,
                      invalid: sheet.tiebreak.trim() !== "" && toPayload(sheet).tiebreak === null,
                      onChange: (value) => edit({ ...sheet, tiebreak: value.replace(/\D/g, "").slice(0, 3) }),
                    }
                  : null
              }
              editable={editable}
              onPick={(team) => edit({ ...sheet, teams: { ...sheet.teams, [id]: team } })}
              onConf={(value) => edit({ ...sheet, conf: { ...sheet.conf, [id]: value.replace(/\D/g, "").slice(0, 2) } })}
            />
          ))}
        </ol>

        {canceled.length > 0 && (
          <section className="mt-6">
            <h2 className="chalk text-sm">Canceled</h2>
            <ul className="mt-2 space-y-2">
              {canceled.map((g) => (
                <li key={g.gameId} className="flex min-h-11 items-center gap-3 rounded-lg border border-dashed bg-card/90 px-3 text-muted-foreground">
                  <span className="flex-1 line-through">
                    {g.away.abbr} @ {g.home.abbr}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* Phones keep one column (contents) so the save bar sticks to the whole sheet; desktop gets a sticky side rail. */}
      <aside className="contents lg:sticky lg:top-4 lg:flex lg:flex-col lg:gap-4">
        {editable && !dirty && pickedCount(saved) > 0 && !confError(checkConf(saved)) && otherGroups.length > 0 && <CopyPicks sheet={saved} week={week.week} groups={otherGroups} />}

        {editable && <SaveBar sheet={sheet} check={check} dirty={dirty} save={save} onSave={submit} />}
      </aside>
    </div>
  );
}

interface RowProps {
  index: number;
  groupId: string;
  dirty: boolean;
  game: Game;
  conf: string;
  confIssue: string | null;
  team: string | null;
  isGow: boolean;
  /** Set on the tiebreak game: the total-points guess lives in its row. */
  tiebreak: { value: string; invalid: boolean; onChange: (value: string) => void } | null;
  editable: boolean;
  onPick: (team: string) => void;
  onConf: (value: string) => void;
}

function GameRow({ index, groupId, dirty, game, conf, confIssue, team, isGow, tiebreak, editable, onPick, onConf }: RowProps) {
  const matchup = `${game.away.abbr} at ${game.home.abbr}`;
  const details = [
    etTime(game.kickoff),
    game.broadcasts?.[0],
    spreadText(game),
    game.lines?.overUnder != null ? `O/U ${game.lines.overUnder}` : null,
  ].filter(Boolean);

  return (
    <li
      style={{ "--i": index } as CSSProperties}
      className={cn(
        "panel animate-rise p-2",
        // Game of the week: the row sits under a bank of stadium lights.
        isGow &&
          "border-primary/70 bg-[image:radial-gradient(ellipse_90%_70%_at_50%_-10%,oklch(0.92_0.1_95/0.26),transparent_70%)] shadow-[0_0_24px_-6px_oklch(0.9_0.12_95/0.55)]",
      )}
    >
      <div className="flex items-stretch gap-2">
        <label className="flex w-14 shrink-0 flex-col items-center justify-center gap-1">
          <span className="font-display text-[0.6rem] font-bold tracking-[0.18em] text-muted-foreground uppercase">Pts</span>
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={2}
            disabled={!editable}
            value={conf}
            placeholder="–"
            aria-label={`Confidence points for ${matchup}`}
            aria-invalid={confIssue !== null}
            aria-describedby={confIssue ? `conf-${game.gameId}` : undefined}
            onChange={(e) => onConf(e.target.value)}
            onFocus={(e) => e.target.select()}
            className={cn(
              // A yard marker: stencilled numeral on turf.
              "h-12 w-full rounded-md bg-turf text-center font-stencil text-3xl leading-none font-black text-chalk shadow-[inset_0_-3px_0_var(--chalk)] outline-none placeholder:text-chalk/40 focus-visible:ring-3 focus-visible:ring-ring/60 disabled:opacity-100",
              confIssue && "animate-shake bg-wrong/25 text-wrong shadow-[inset_0_-3px_0_var(--color-wrong)] ring-2 ring-wrong",
            )}
          />
        </label>

        <div className="min-w-0 flex-1">
          {(isGow || tiebreak) && (
            <div className="mb-1 flex flex-wrap gap-1.5">
              {isGow && (
                <span className="inline-flex items-center gap-1 font-display text-sm font-extrabold tracking-[0.2em] text-primary uppercase">
                  <LightBank className="size-4" />
                  Game of the Week
                </span>
              )}
              {tiebreak && <span className="rounded-sm border border-led/60 px-1.5 py-0.5 font-display text-xs font-bold tracking-wider text-led uppercase">Tiebreak game</span>}
            </div>
          )}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1" role="group" aria-label={`Pick ${matchup}`}>
            <TeamButton team={game.away} picked={team} editable={editable} onPick={onPick} />
            <span aria-hidden="true" className="px-0.5 text-xs text-muted-foreground">
              @
            </span>
            <TeamButton team={game.home} picked={team} editable={editable} onPick={onPick} />
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{details.join(" · ")}</span>
            <GameInfoLink
              groupId={groupId}
              gameId={game.gameId}
              // The sheet lives in this page's state; leaving it unsaved would drop the draft.
              onClick={(e) => dirty && !window.confirm("Leave without saving your picks?") && e.preventDefault()}
              aria-label={`Matchup details for ${matchup}`}
              className="inline-flex h-9 shrink-0 items-center gap-1 rounded-md border border-border bg-input/30 px-2.5 font-display text-xs font-bold tracking-wider uppercase outline-none hover:border-primary hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/60 [&:not(a)]:hidden"
            >
              <BarChart3 className="size-3.5" aria-hidden="true" />
              Matchup
              <ChevronRight className="size-3.5" aria-hidden="true" />
            </GameInfoLink>
          </div>
          {tiebreak && (
            <label className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-dashed border-led/50 bg-board/60 px-3 py-2">
              <span className="min-w-0 flex-1 text-sm">
                <strong className="block font-display tracking-wide uppercase">Tiebreak</strong>
                <span className="text-xs text-muted-foreground">Total points scored in {game.away.abbr} @ {game.home.abbr}</span>
              </span>
              <Input
                className="w-24 text-center font-stencil text-xl"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={3}
                placeholder="–"
                disabled={!editable}
                value={tiebreak.value}
                aria-invalid={tiebreak.invalid}
                onChange={(e) => tiebreak.onChange(e.target.value)}
              />
            </label>
          )}
        </div>

      </div>
      {confIssue && (
        <p id={`conf-${game.gameId}`} className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-wrong">
          <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
          {confIssue}
        </p>
      )}
    </li>
  );
}

interface TeamProps {
  team: Team;
  picked: string | null;
  editable: boolean;
  onPick: (team: string) => void;
}

function TeamButton({ team, picked, editable, onPick }: TeamProps) {
  const on = picked === team.abbr;
  return (
    <button
      type="button"
      disabled={!editable}
      aria-pressed={on}
      onClick={() => onPick(team.abbr)}
      className={cn(
        "flex h-11 items-center justify-center gap-1.5 rounded-md border font-display transition-[background-color,border-color,transform] active:scale-95 text-xl font-extrabold tracking-wide outline-none focus-visible:ring-3 focus-visible:ring-ring/60 disabled:opacity-100",
        on ? "border-primary bg-primary text-primary-foreground" : "bg-input/30 enabled:hover:bg-input/60",
        !editable && !on && "text-muted-foreground",
      )}
    >
      <TeamLogo key={String(on)} {...team} className={cn("size-7", on && "animate-pop")} />
      {team.abbr}
    </button>
  );
}

function confIssue(sheet: Sheet, check: ConfCheck, id: string, n: number): string | null {
  if (check.bad.includes(id)) return `Use 1 to ${n}.`;
  const c = Number(sheet.conf[id]);
  return check.dupes.includes(c) ? `${c} is used more than once.` : null;
}

function SaveBar({ sheet, check, dirty, save, onSave }: { sheet: Sheet; check: ConfCheck; dirty: boolean; save: SaveState; onSave: () => void }) {
  const complete = isComplete(sheet);
  const blocked = confError(check);
  const missing = [
    pickedCount(sheet) < sheet.order.length && `${pickedCount(sheet)} of ${sheet.order.length} picked`,
    check.left.length > 0 && `${check.left.length} point ${check.left.length === 1 ? "value" : "values"} unused`,
    toPayload(sheet).tiebreak === null && "tiebreak missing",
  ].filter(Boolean);

  let status: ReactNode = complete ? "All picks in" : missing.join(", ");
  if (blocked) status = <span className="font-semibold text-wrong">{check.dupes.length > 0 ? `Fix duplicates: ${check.dupes.join(", ")}` : `Points must be 1 to ${sheet.order.length}`}</span>;
  else if (save.kind === "failed") status = <span className="text-wrong">{save.message}</span>;
  else if (dirty) status = `Unsaved changes. ${complete ? "Ready to save." : `Draft: ${missing.join(", ")}.`}`;
  else if (save.kind === "saved") status = complete ? "Saved. All picks in." : `Draft saved. ${missing.join(", ")}.`;

  return (
    // Sticky, not fixed: it keeps its own height at the end of the sheet, so however far the
    // status text wraps, the last row and the tiebreak always scroll clear of it.
    <div className="sticky bottom-(--tabbar-h) z-10 -mx-4 mt-6 border-t-2 border-primary bg-board sm:-mx-6 sm:pb-[env(safe-area-inset-bottom)] lg:static lg:order-first lg:mx-0 lg:mt-0 lg:overflow-hidden lg:rounded-xl lg:border-2 lg:pb-0">
      <PointsLeft n={sheet.order.length} check={check} />
      <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
        <p role="status" aria-live="polite" className="flex min-w-0 flex-1 items-center gap-2 text-sm">
          {!dirty && complete && save.kind !== "failed" && <CircleCheck className="size-4 shrink-0 text-primary" aria-hidden="true" />}
          <span className="min-w-0">{status}</span>
          {!dirty && complete && save.kind === "saved" && (
            <span key={save.at} aria-hidden="true" className="ml-auto animate-stamp rounded-sm border-2 border-primary px-1.5 py-0.5 font-stencil text-sm leading-none font-black tracking-wider text-primary uppercase">
              Picks in
            </span>
          )}
        </p>
        <Button size="lg" disabled={!dirty || blocked || save.kind === "saving"} onClick={onSave}>
          {save.kind === "saving" && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          {save.kind === "saving" ? "Saving" : complete ? "Save picks" : "Save draft"}
        </Button>
      </div>
    </div>
  );
}

/** Every point value 1..N: dim once used, red when used twice, lit while still needed. */
function PointsLeft({ n, check }: { n: number; check: ConfCheck }) {
  const values = Array.from({ length: n }, (_, i) => n - i);
  return (
    <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2 sm:px-6">
      <span className="chalk shrink-0 text-[0.65rem] tracking-[0.16em]">{check.left.length === 0 ? "All used" : `${check.left.length} left`}</span>
      <ul aria-label={`Points still to use: ${check.left.join(", ") || "none"}`} className="flex min-w-0 flex-1 flex-wrap gap-1">
        {values.map((c) => {
          const dupe = check.dupes.includes(c);
          const left = check.left.includes(c);
          return (
            <li
              key={c}
              aria-hidden="true"
              className={cn(
                "grid h-6 min-w-6 place-items-center rounded-sm px-1 font-stencil text-sm leading-none font-black tabular-nums transition-colors",
                dupe ? "bg-wrong text-white" : left ? "bg-led/90 text-black" : "bg-transparent text-muted-foreground/50 line-through",
              )}
            >
              {c}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
