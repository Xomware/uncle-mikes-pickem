"use client";

import { Check, Lock, Plus } from "lucide-react";
import { type FormEvent, useCallback, useState } from "react";

import { DeathGrid } from "@/components/death/death-grid";
import { Lives } from "@/components/death/lives";
import { LoadError } from "@/components/load-error";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import {
  type DeathBoard,
  type DeathEntry,
  type DeathGame,
  type Member,
  addDeathEntry,
  getDeathBoard,
  setDeathPick,
} from "@/lib/api/client";
import { useLoad } from "@/lib/api/use-load";
import { formatLine, takenTeams, teamLine, withPick } from "@/lib/death";
import { cn } from "@/lib/utils";

interface Props {
  groupId: string;
  organizer: boolean;
  members: Member[];
  fee: number;
}

export function DeathPool(props: Props) {
  const { groupId } = props;
  const fetcher = useCallback(() => getDeathBoard(groupId), [groupId]);
  const { load, retry, setData } = useLoad(fetcher);

  if (load.status === "loading") {
    return (
      <div className="mt-6 animate-pulse space-y-3" aria-busy="true">
        <span className="block h-32 rounded-xl bg-muted" />
        <span className="sr-only">Loading the death pool</span>
      </div>
    );
  }
  if (load.status === "error") {
    return <LoadError title="Couldn't load the death pool" message={load.message} onRetry={retry} />;
  }
  return <DeathPoolView {...props} board={load.data} onChange={setData} />;
}

interface ViewProps extends Props {
  board: DeathBoard;
  onChange: (board: DeathBoard) => void;
}

export function DeathPoolView({ board, onChange, ...props }: ViewProps) {
  const { groupId } = props;
  const mine = board.entries.filter((e) => e.mine);
  const replace = (next: DeathEntry) =>
    onChange({ ...board, entries: board.entries.map((e) => (e.entryId === next.entryId ? next : e)) });

  return (
    <section className="mt-6">
      <h2 className="text-xl font-semibold uppercase">Your entries</h2>
      <WeekStatus week={board.week} />
      {mine.length === 0 && <p className="mt-3 text-muted-foreground">You don&apos;t have a death pool entry yet.</p>}
      <ul className="mt-3 space-y-3">
        {mine.map((e) => (
          <EntryCard
            key={e.entryId}
            entry={e}
            week={board.week}
            startLives={board.startLives}
            groupId={groupId}
            onPicked={replace}
          />
        ))}
      </ul>
      <AddEntry {...props} onAdded={async () => onChange(await getDeathBoard(groupId))} />
      <DeathGrid board={board} />
    </section>
  );
}

function WeekStatus({ week }: { week: DeathBoard["week"] }) {
  if (!week) return <p className="mt-1 text-muted-foreground">The schedule isn&apos;t out yet.</p>;
  const lock = new Date(week.lockAt).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
  return (
    <p className="mt-1 flex items-center gap-1.5 text-muted-foreground">
      {week.locked && <Lock className="size-4" aria-hidden="true" />}
      Week {week.number} {week.locked ? "is locked" : `locks ${lock}`}
    </p>
  );
}

interface EntryCardProps {
  entry: DeathEntry;
  week: DeathBoard["week"];
  startLives: number;
  groupId: string;
  onPicked: (entry: DeathEntry) => void;
}

function EntryCard({ entry, week, startLives, groupId, onPicked }: EntryCardProps) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const out = entry.status === "eliminated";
  const current = week ? entry.picks[String(week.number)] : null;

  async function choose(team: string) {
    if (!week) return;
    setPending(team);
    setError(null);
    try {
      await setDeathPick(groupId, entry.entryId, week.number, team);
      onPicked(withPick(entry, week.number, team));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that pick.");
    } finally {
      setPending(null);
    }
  }

  return (
    <li className={cn("rounded-xl border bg-card p-4", out && "opacity-70")}>
      <div className="flex items-center gap-3">
        <span className={cn("min-w-0 flex-1 truncate font-semibold", out && "text-muted-foreground line-through")}>
          {entry.label}
        </span>
        <Lives left={entry.livesLeft} total={startLives} />
      </div>
      {out && <p className="mt-2 text-sm text-wrong">Eliminated in Week {entry.eliminatedWeek}</p>}
      {!out && week && week.locked && (
        <p className="mt-2 text-sm text-muted-foreground">
          {current ? `Week ${week.number} pick: ${current}` : `No pick for Week ${week.number}`}
        </p>
      )}
      {!out && week && !week.locked && (
        <TeamPicker
          games={week.games}
          taken={takenTeams(entry, week.number)}
          current={current}
          pending={pending}
          onChoose={choose}
        />
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-wrong">
          {error}
        </p>
      )}
    </li>
  );
}

interface PickerProps {
  games: DeathGame[];
  taken: Set<string>;
  current: string | null;
  pending: string | null;
  onChoose: (team: string) => void;
}

function TeamPicker({ games, taken, current, pending, onChoose }: PickerProps) {
  return (
    <ul className="mt-3 space-y-3">
      {games.map((g) => (
        <li key={g.gameId}>
          <p className="mb-1 text-xs text-muted-foreground">
            {new Date(g.kickoff).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}
          </p>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            {[g.away, g.home].map((team, i) => (
              <TeamButton
                key={team}
                team={team}
                line={formatLine(teamLine(g, team))}
                used={taken.has(team)}
                selected={team === current}
                pending={pending}
                onChoose={onChoose}
                className={i === 1 ? "col-start-3" : undefined}
              />
            ))}
            <span className="col-start-2 row-start-1 text-xs text-muted-foreground uppercase">at</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

interface TeamButtonProps {
  team: string;
  line: string;
  used: boolean;
  selected: boolean;
  pending: string | null;
  onChoose: (team: string) => void;
  className?: string;
}

function TeamButton({ team, line, used, selected, pending, onChoose, className }: TeamButtonProps) {
  return (
    <button
      type="button"
      disabled={used || pending !== null}
      aria-pressed={selected}
      onClick={() => onChoose(team)}
      className={cn(
        "row-start-1 flex h-12 items-center gap-2 rounded-lg border px-3 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/60 disabled:cursor-not-allowed",
        selected ? "border-primary bg-primary/15" : "border-border bg-background hover:bg-muted",
        used && "opacity-40",
        pending === team && "animate-pulse",
        className,
      )}
    >
      <span className={cn("font-display text-lg font-bold", used && "line-through")}>{team}</span>
      <span className="flex-1 text-sm text-muted-foreground">{used ? "Used" : line}</span>
      {selected && <Check className="size-4 text-primary" aria-label="Your pick" />}
    </button>
  );
}

function AddEntry({ groupId, organizer, members, fee, onAdded }: Props & { onAdded: () => Promise<void> }) {
  const [label, setLabel] = useState("");
  const [sub, setSub] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "saving" } | { kind: "failed"; message: string }>({
    kind: "idle",
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState({ kind: "saving" });
    try {
      await addDeathEntry(groupId, label.trim() || undefined, sub || undefined);
      await onAdded();
      setLabel("");
      setState({ kind: "idle" });
    } catch (err) {
      setState({ kind: "failed", message: err instanceof Error ? err.message : "Couldn't add the entry." });
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 rounded-xl border border-dashed p-4">
      <p className="font-semibold">Add an entry</p>
      <p className="text-sm text-muted-foreground">
        Each entry is paid separately{fee > 0 ? `: $${fee} per entry` : ""}.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Input
          aria-label="Entry name"
          placeholder="Entry name (optional)"
          maxLength={40}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        {organizer && (
          <Select aria-label="Entry for" value={sub} onChange={(e) => setSub(e.target.value)}>
            <option value="">For me</option>
            {members.map((m) => (
              <option key={m.sub} value={m.sub}>
                For {m.name}
              </option>
            ))}
          </Select>
        )}
        <Button type="submit" disabled={state.kind === "saving"}>
          <Plus aria-hidden="true" />
          Add entry
        </Button>
      </div>
      {state.kind === "failed" && (
        <p role="alert" className="mt-2 text-sm text-wrong">
          {state.message}
        </p>
      )}
    </form>
  );
}
