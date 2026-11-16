"use client";

import { LoaderCircle, Pencil, RefreshCw } from "lucide-react";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Game, type WeekResult, type WeekView, overrideScore, regrade } from "@/lib/api/client";

const message = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong.");

/** Regrade and per-game score overrides for a locked week. Organizers only; `onChange` refetches the result. */
export function OrganizerTools({
  view,
  result,
  onChange,
}: {
  view: WeekView;
  result: WeekResult | null;
  onChange: () => Promise<void>;
}) {
  const { groupId } = view.group;
  const week = view.week.week;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ error: boolean; text: string } | null>(null);
  const [editing, setEditing] = useState<Game | null>(null);

  async function run(action: () => Promise<{ weeks: number[] }>) {
    setBusy(true);
    setNote(null);
    try {
      const { weeks } = await action();
      await onChange();
      setNote({ error: false, text: weeks.length ? `Week ${week} regraded.` : "Nothing changed." });
      return true;
    } catch (err) {
      setNote({ error: true, text: message(err) });
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="organizer-title" className="panel mt-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="organizer-title" className="font-display text-lg font-extrabold tracking-wide uppercase">
          Organizer
        </h3>
        <Button variant="outline" disabled={busy} onClick={() => run(() => regrade(groupId, week))}>
          {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
          Regrade
        </Button>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Wrong final? Set the score and the week regrades.</p>
      <ul className="mt-3 divide-y divide-border">
        {view.games
          .filter((g) => !g.canceled)
          .map((g) => {
            const final = result?.games[g.gameId];
            return (
              <li key={g.gameId} className="flex min-h-12 items-center gap-3 py-1">
                <span className="min-w-0 flex-1 font-display font-bold">
                  {g.away.abbr} <span className="text-muted-foreground">@</span> {g.home.abbr}
                </span>
                <span className="text-sm tabular-nums">
                  {final ? `${final.awayScore} - ${final.homeScore}` : <span className="text-muted-foreground">Not final</span>}
                  {final && !final.confirmed && <span className="ml-1.5 text-xs text-flag uppercase">Unconfirmed</span>}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11"
                  aria-label={`Set the ${g.away.abbr} at ${g.home.abbr} score`}
                  disabled={busy}
                  onClick={() => setEditing(g)}
                >
                  <Pencil aria-hidden="true" />
                </Button>
              </li>
            );
          })}
      </ul>
      {note && (
        <p role={note.error ? "alert" : "status"} className={note.error ? "mt-2 text-sm text-wrong" : "mt-2 text-sm text-correct"}>
          {note.text}
        </p>
      )}
      {editing && (
        <ScoreDialog
          key={editing.gameId}
          game={editing}
          current={result?.games[editing.gameId] ?? null}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={async (away, home) => {
            if (await run(() => overrideScore(groupId, week, editing.gameId, away, home))) setEditing(null);
          }}
        />
      )}
    </section>
  );
}

interface ScoreDialogProps {
  game: Game;
  current: { awayScore: number; homeScore: number } | null;
  busy: boolean;
  onClose: () => void;
  onSave: (away: number | null, home: number | null) => Promise<void>;
}

function ScoreDialog({ game, current, busy, onClose, onSave }: ScoreDialogProps) {
  const [away, setAway] = useState(current ? String(current.awayScore) : "");
  const [home, setHome] = useState(current ? String(current.homeScore) : "");

  function submit(e: FormEvent) {
    e.preventDefault();
    void onSave(Number(away), Number(home));
  }

  return (
    <dialog
      // showModal, not the open attribute: it brings focus trapping, Escape and the backdrop.
      ref={(el) => {
        if (el && !el.open) el.showModal();
      }}
      onClose={onClose}
      aria-labelledby="score-title"
      className="panel m-auto w-[min(22rem,calc(100vw-2rem))] p-5 text-foreground backdrop:bg-black/70"
    >
      <form onSubmit={submit}>
        <h2 id="score-title" className="font-display text-xl font-extrabold uppercase">
          {game.away.abbr} @ {game.home.abbr} final
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">Overrides the feed for this group and counts as confirmed.</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <ScoreField label={game.away.abbr} value={away} onChange={setAway} />
          <ScoreField label={game.home.abbr} value={home} onChange={setHome} />
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" disabled={busy} onClick={() => void onSave(null, null)} className="mr-auto">
            Clear override
          </Button>
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            Save
          </Button>
        </div>
      </form>
    </dialog>
  );
}

function ScoreField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 font-display text-sm font-bold uppercase">
      {label}
      <Input
        type="number"
        inputMode="numeric"
        min={0}
        max={200}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
