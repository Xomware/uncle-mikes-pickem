"use client";

import { ChevronDown, ChevronUp, CircleAlert, CircleCheck, LoaderCircle, Star, Undo2 } from "lucide-react";
import { type ReactNode, useState } from "react";

import { LightBank } from "@/components/field/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Game, type WeekView, cancelGame, setGow, setPicks } from "@/lib/api/client";
import { isOrganizer } from "@/lib/groups";
import { type Sheet, confAt, isComplete, pickedCount, sameSheet, spreadText, swap, toPayload, toSheet } from "@/lib/picks";
import { etTime } from "@/lib/time";
import { cn } from "@/lib/utils";

type SaveState = { kind: "idle" | "saving" } | { kind: "saved"; at: string } | { kind: "failed"; message: string };

interface Props {
  view: WeekView;
  locked: boolean;
  reload: () => void;
}

export function PickSheet({ view, locked, reload }: Props) {
  const { group, week, games, gow, role } = view;
  const [saved, setSaved] = useState<Sheet>(() => toSheet(games, view.mine));
  const [sheet, setSheet] = useState<Sheet>(saved);
  const [selected, setSelected] = useState<number | null>(null);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [managing, setManaging] = useState(false);
  const [organizerError, setOrganizerError] = useState<string | null>(null);

  const byId = Object.fromEntries(games.map((g) => [g.gameId, g]));
  const editable = !locked && gow !== null;
  const dirty = !sameSheet(sheet, saved);
  const tiebreakGame = byId[week.tiebreakGameId];

  function edit(next: Sheet) {
    setSheet(next);
    setSave((s) => (s.kind === "saving" ? s : { kind: "idle" }));
  }

  function tapConf(index: number) {
    if (selected === null) return setSelected(index);
    edit({ ...sheet, order: swap(sheet.order, selected, index) });
    setSelected(null);
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

  async function organize(action: () => Promise<unknown>) {
    setOrganizerError(null);
    try {
      await action();
      reload();
    } catch (err) {
      setOrganizerError(err instanceof Error ? err.message : "That didn't work.");
    }
  }

  const canManage = isOrganizer(role) && !locked;
  const canceled = games.filter((g) => g.canceled);

  return (
    <div className="mt-6">
      {!gow && !locked && (
        <p className="panel mb-4 p-3 text-sm text-muted-foreground">
          Picks open once the organizer chooses the game of the week.
          {isOrganizer(role) && " Use Manage games to choose it."}
        </p>
      )}

      {canManage && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button variant="outline" aria-pressed={managing} onClick={() => setManaging((m) => !m)}>
            {managing ? "Done managing" : "Manage games"}
          </Button>
          {managing && dirty && <span className="chalk text-xs tracking-[0.12em]">Save your picks first.</span>}
        </div>
      )}
      {organizerError && (
        <p role="alert" className="mb-3 flex items-center gap-2 text-sm text-wrong">
          <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
          {organizerError}
        </p>
      )}

      {editable && (
        <p className="mb-3 rounded-md bg-card/90 px-3 py-2 text-sm text-muted-foreground">
          {selected === null
            ? "Tap a team to pick it. Tap a number, then another, to swap confidence."
            : `Tap another number to swap with ${confAt(sheet, selected)}.`}
        </p>
      )}

      {/* The drive: top confidence sits on the goal line, 1 is the long way back. */}
      <div className="endzone flex items-end justify-between rounded-t-lg px-3 pt-3 pb-1.5">
        <span className="paint worn text-2xl leading-none">End zone</span>
        <span className="chalk text-xs tracking-[0.16em]">Most confident</span>
      </div>
      <ol className="space-y-2 pt-2">
        {sheet.order.map((id, index) => (
          <GameRow
            key={id}
            game={byId[id]}
            conf={confAt(sheet, index)}
            team={sheet.teams[id]}
            isGow={gow?.gameId === id}
            isTiebreak={week.tiebreakGameId === id}
            editable={editable}
            selected={selected === index}
            first={index === 0}
            last={index === sheet.order.length - 1}
            onPick={(team) => edit({ ...sheet, teams: { ...sheet.teams, [id]: team } })}
            onConf={() => tapConf(index)}
            onMove={(by) => edit({ ...sheet, order: swap(sheet.order, index, index + by) })}
            manage={
              managing && (
                <div className="mt-2 flex flex-wrap gap-2 border-t pt-2">
                  {gow?.gameId !== id && (
                    <Button size="sm" variant="outline" disabled={dirty} onClick={() => organize(() => setGow(group.groupId, week.week, id))}>
                      <Star aria-hidden="true" />
                      Make game of the week
                    </Button>
                  )}
                  <Button size="sm" variant="destructive" disabled={dirty} onClick={() => organize(() => cancelGame(group.groupId, week.week, id, true))}>
                    Cancel game
                  </Button>
                </div>
              )
            }
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
                {managing && (
                  <Button size="sm" variant="outline" disabled={dirty} onClick={() => organize(() => cancelGame(group.groupId, week.week, g.gameId, false))}>
                    <Undo2 aria-hidden="true" />
                    Restore
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <label className="panel mt-6 block p-4">
        <span className="font-display text-lg font-bold tracking-wide uppercase">Tiebreak</span>
        <span className="block text-sm text-muted-foreground">
          Total points in {tiebreakGame ? `${tiebreakGame.away.abbr} @ ${tiebreakGame.home.abbr}` : "the last game"}
        </span>
        <Input
          className="mt-2 w-32"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={3}
          disabled={!editable}
          value={sheet.tiebreak}
          aria-invalid={sheet.tiebreak.trim() !== "" && toPayload(sheet).tiebreak === null}
          onChange={(e) => edit({ ...sheet, tiebreak: e.target.value })}
        />
      </label>

      {editable && <SaveBar sheet={sheet} dirty={dirty} save={save} onSave={submit} />}
    </div>
  );
}

interface RowProps {
  game: Game;
  conf: number;
  team: string | null;
  isGow: boolean;
  isTiebreak: boolean;
  editable: boolean;
  selected: boolean;
  first: boolean;
  last: boolean;
  onPick: (team: string) => void;
  onConf: () => void;
  onMove: (by: -1 | 1) => void;
  manage: ReactNode;
}

function GameRow({ game, conf, team, isGow, isTiebreak, editable, selected, first, last, onPick, onConf, onMove, manage }: RowProps) {
  const matchup = `${game.away.abbr} at ${game.home.abbr}`;
  const details = [
    etTime(game.kickoff),
    game.broadcasts?.[0],
    spreadText(game),
    game.lines?.overUnder != null ? `O/U ${game.lines.overUnder}` : null,
  ].filter(Boolean);

  return (
    <li
      className={cn(
        "panel p-2",
        // Primetime: the row sits under a bank of stadium lights.
        isGow &&
          "border-primary/70 bg-[image:radial-gradient(ellipse_90%_70%_at_50%_-10%,oklch(0.92_0.1_95/0.26),transparent_70%)] shadow-[0_0_24px_-6px_oklch(0.9_0.12_95/0.55)]",
      )}
    >
      <div className="flex items-stretch gap-2">
        <button
          type="button"
          disabled={!editable}
          aria-pressed={selected}
          aria-label={`Confidence ${conf} for ${matchup}${selected ? ", selected" : ""}`}
          onClick={onConf}
          className={cn(
            // A yard marker: stencilled numeral on turf, the arrow pointing at the goal line.
            "flex w-13 shrink-0 flex-col items-center justify-center gap-0.5 rounded-md bg-turf font-stencil text-3xl leading-none font-black text-chalk shadow-[inset_0_-3px_0_var(--chalk)] outline-none focus-visible:ring-3 focus-visible:ring-ring/60 enabled:hover:brightness-110 disabled:opacity-100",
            selected && "bg-primary text-primary-foreground shadow-[inset_0_-3px_0_var(--primary-foreground)]",
          )}
        >
          <span aria-hidden="true" className="h-1.5 w-2.5 bg-current [clip-path:polygon(50%_0,100%_100%,0_100%)]" />
          {conf}
        </button>

        <div className="min-w-0 flex-1">
          {(isGow || isTiebreak) && (
            <div className="mb-1 flex flex-wrap gap-1.5">
              {isGow && (
                <span className="inline-flex items-center gap-1 font-display text-sm font-extrabold tracking-[0.2em] text-primary uppercase">
                  <LightBank className="size-4" />
                  Primetime<span className="sr-only">, game of the week</span>
                </span>
              )}
              {isTiebreak && <span className="rounded-sm border px-1.5 py-0.5 font-display text-xs font-bold tracking-wider text-muted-foreground uppercase">Tiebreak</span>}
            </div>
          )}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1" role="group" aria-label={`Pick ${matchup}`}>
            <TeamButton abbr={game.away.abbr} picked={team} editable={editable} onPick={onPick} />
            <span aria-hidden="true" className="px-0.5 text-xs text-muted-foreground">
              @
            </span>
            <TeamButton abbr={game.home.abbr} picked={team} editable={editable} onPick={onPick} />
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{details.join(" · ")}</p>
        </div>

        {editable && (
          <div className="flex shrink-0 flex-col">
            <Button variant="ghost" className="h-auto min-h-11 w-11 flex-1 px-0" disabled={first} aria-label={`Raise confidence for ${matchup}`} onClick={() => onMove(-1)}>
              <ChevronUp aria-hidden="true" />
            </Button>
            <Button variant="ghost" className="h-auto min-h-11 w-11 flex-1 px-0" disabled={last} aria-label={`Lower confidence for ${matchup}`} onClick={() => onMove(1)}>
              <ChevronDown aria-hidden="true" />
            </Button>
          </div>
        )}
      </div>
      {manage}
    </li>
  );
}

interface TeamProps {
  abbr: string;
  picked: string | null;
  editable: boolean;
  onPick: (team: string) => void;
}

function TeamButton({ abbr, picked, editable, onPick }: TeamProps) {
  const on = picked === abbr;
  return (
    <button
      type="button"
      disabled={!editable}
      aria-pressed={on}
      onClick={() => onPick(abbr)}
      className={cn(
        "h-11 rounded-md border font-display text-xl font-extrabold tracking-wide outline-none focus-visible:ring-3 focus-visible:ring-ring/60 disabled:opacity-100",
        on ? "border-primary bg-primary text-primary-foreground" : "bg-input/30 enabled:hover:bg-input/60",
        !editable && !on && "text-muted-foreground",
      )}
    >
      {abbr}
    </button>
  );
}

function SaveBar({ sheet, dirty, save, onSave }: { sheet: Sheet; dirty: boolean; save: SaveState; onSave: () => void }) {
  const complete = isComplete(sheet);
  const missing = [
    pickedCount(sheet) < sheet.order.length && `${pickedCount(sheet)} of ${sheet.order.length} picked`,
    toPayload(sheet).tiebreak === null && "tiebreak missing",
  ].filter(Boolean);

  let status: ReactNode = complete ? "All picks in" : missing.join(", ");
  if (save.kind === "failed") status = <span className="text-wrong">{save.message}</span>;
  else if (dirty) status = `Unsaved changes. ${complete ? "Ready to save." : `Draft: ${missing.join(", ")}.`}`;
  else if (save.kind === "saved") status = complete ? "Saved. All picks in." : `Draft saved. ${missing.join(", ")}.`;

  return (
    // Sticky, not fixed: it keeps its own height at the end of the sheet, so however far the
    // status text wraps, the last row and the tiebreak always scroll clear of it.
    <div className="sticky bottom-0 z-10 -mx-4 mt-6 border-t-2 border-primary bg-board pb-[env(safe-area-inset-bottom)] sm:-mx-6">
      <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
        <p role="status" aria-live="polite" className="flex min-w-0 flex-1 items-center gap-2 text-sm">
          {!dirty && complete && save.kind !== "failed" && <CircleCheck className="size-4 shrink-0 text-primary" aria-hidden="true" />}
          <span className="min-w-0">{status}</span>
        </p>
        <Button size="lg" disabled={!dirty || save.kind === "saving"} onClick={onSave}>
          {save.kind === "saving" && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          {save.kind === "saving" ? "Saving" : complete ? "Save picks" : "Save draft"}
        </Button>
      </div>
    </div>
  );
}
