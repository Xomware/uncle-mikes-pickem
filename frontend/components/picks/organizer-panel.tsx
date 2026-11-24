"use client";

import { ChevronDown, CircleAlert, CircleCheck, LoaderCircle, Star, Undo2, X } from "lucide-react";
import { useState } from "react";

import { TeamLogo } from "@/components/field/team-logo";
import { Button } from "@/components/ui/button";
import { type WeekView, cancelGame, setGow } from "@/lib/api/client";
import { etTime } from "@/lib/time";
import { cn } from "@/lib/utils";

type Status = { kind: "idle" } | { kind: "busy"; gameId: string } | { kind: "done"; message: string } | { kind: "failed"; message: string };

/** The organizer's booth: game of the week and cancellations, kept apart from the caller's own picks. */
export function OrganizerPanel({ view, refresh }: { view: WeekView; refresh: () => Promise<void> }) {
  const { group, week, games, gow } = view;
  const [open, setOpen] = useState(!gow);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function act(gameId: string, action: () => Promise<unknown>, message: string) {
    setStatus({ kind: "busy", gameId });
    try {
      await action();
      await refresh();
      setStatus({ kind: "done", message });
    } catch (err) {
      setStatus({ kind: "failed", message: err instanceof Error ? err.message : "That didn't work." });
    }
  }

  const gowGame = games.find((g) => g.gameId === gow?.gameId);
  const busy = status.kind === "busy";

  return (
    <section aria-labelledby="organizer-title" className="mt-5 overflow-hidden rounded-xl border-2 border-white/80 bg-zinc-950 shadow-lg">
      {/* Referee stripes: this panel changes the week for everyone. */}
      <div aria-hidden="true" className="h-2 bg-[repeating-linear-gradient(90deg,white_0_14px,black_14px_28px)]" />
      <button
        type="button"
        aria-expanded={open}
        aria-controls="organizer-body"
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left outline-none hover:bg-white/5 focus-visible:ring-3 focus-visible:ring-ring/60"
      >
        <span className="min-w-0 flex-1">
          <span id="organizer-title" className="block font-display text-lg font-extrabold tracking-wide text-white uppercase">
            Organizer booth
          </span>
          <span className="block truncate text-xs text-zinc-400">
            {gowGame ? `Game of the week: ${gowGame.away.abbr} @ ${gowGame.home.abbr}` : "Choose the game of the week to open picks"}
          </span>
        </span>
        <ChevronDown className={cn("size-5 shrink-0 text-zinc-400 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>

      {open && (
        <div id="organizer-body" className="border-t border-white/10 px-4 pt-3 pb-4">
          <p className="text-sm text-zinc-400">Changes here apply to everyone in {group.name}. Your own picks are below, under My picks.</p>
          <ul className="mt-3 divide-y divide-white/10">
            {games.map((g) => {
              const isGow = g.gameId === gow?.gameId;
              const matchup = `${g.away.abbr} @ ${g.home.abbr}`;
              const working = status.kind === "busy" && status.gameId === g.gameId;
              return (
                <li key={g.gameId} className={cn("flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 py-2", g.canceled && "text-zinc-500")}>
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <TeamLogo {...g.away} className="size-6" />
                    <span className={cn("font-display text-base font-bold whitespace-nowrap", g.canceled && "line-through")}>{matchup}</span>
                    <TeamLogo {...g.home} className="size-6" />
                    <span className="hidden truncate text-xs text-zinc-500 sm:inline">{etTime(g.kickoff)}</span>
                  </span>
                  {working && <LoaderCircle className="size-4 animate-spin text-zinc-400" aria-label="Saving" />}
                  {g.canceled ? (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => act(g.gameId, () => cancelGame(group.groupId, week.week, g.gameId, false), `${matchup} is back on the sheet.`)}>
                      <Undo2 aria-hidden="true" />
                      Restore
                    </Button>
                  ) : (
                    <>
                      {isGow ? (
                        <span className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-2.5 font-display text-xs font-extrabold tracking-wider text-primary-foreground uppercase">
                          <Star className="size-3.5 fill-current" aria-hidden="true" />
                          Game of the week
                        </span>
                      ) : (
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => act(g.gameId, () => setGow(group.groupId, week.week, g.gameId), `${matchup} is the game of the week.`)}>
                          <Star aria-hidden="true" />
                          Make GOW
                        </Button>
                      )}
                      {!isGow && (
                        <Button size="sm" variant="ghost" disabled={busy} aria-label={`Cancel ${matchup}`} onClick={() => act(g.gameId, () => cancelGame(group.groupId, week.week, g.gameId, true), `${matchup} is canceled.`)}>
                          <X aria-hidden="true" />
                          Cancel
                        </Button>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          {status.kind === "done" && (
            <p role="status" className="mt-3 flex items-center gap-2 text-sm font-semibold text-primary">
              <CircleCheck className="size-4 shrink-0" aria-hidden="true" />
              {status.message}
            </p>
          )}
          {status.kind === "failed" && (
            <p role="alert" className="mt-3 flex items-center gap-2 text-sm text-wrong">
              <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
              {status.message}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
