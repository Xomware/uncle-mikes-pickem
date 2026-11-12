"use client";

import { Check, Lock, Plus } from "lucide-react";
import { type FormEvent, useCallback, useState } from "react";

import { DeathGrid } from "@/components/death/death-grid";
import { Lives } from "@/components/death/lives";
import { ReplayTheDown } from "@/components/death/replay-the-down";
import { SuddenDeathLockup } from "@/components/death/sudden-death-lockup";
import { Helmet } from "@/components/field/helmet";
import { Coin } from "@/components/field/icons";
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
import { etTime } from "@/lib/time";
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
      <div className="sudden-death mt-6 animate-pulse space-y-3" aria-busy="true">
        <span className="block h-40 rounded-xl bg-card" />
        <span className="block h-32 rounded-xl bg-card" />
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

  const alive = board.entries.filter((e) => e.status === "alive").length;

  return (
    <section className="sudden-death mt-6">
      <SuddenDeathLockup alive={alive} total={board.entries.length} />
      <div className="panel mt-6 px-4 py-3">
        <h2 className="font-display text-2xl font-extrabold uppercase">Your entries</h2>
        <WeekStatus week={board.week} />
        {mine.length === 0 && <p className="mt-2 text-muted-foreground">You don&apos;t have a death pool entry yet.</p>}
      </div>
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
      <ReplayTheDown />
      <DeathGrid board={board} />
    </section>
  );
}

function WeekStatus({ week }: { week: DeathBoard["week"] }) {
  if (!week) return <p className="mt-1 text-muted-foreground">The schedule isn&apos;t out yet.</p>;
  const lock = etTime(week.lockAt);
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
    <li className={cn("panel p-4", !out && "border-flood/25")}>
      <div className="flex items-center gap-3">
        <Helmet out={out} className="h-10 w-12 shrink-0" />
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block truncate font-display text-xl font-extrabold uppercase",
              out && "text-muted-foreground line-through decoration-blood decoration-2",
            )}
          >
            {entry.label}
          </span>
          <span className={cn("text-sm", out ? "text-wrong" : "text-muted-foreground")}>
            {out ? `Eliminated in Week ${entry.eliminatedWeek}` : entry.livesLeft > 1 ? "Alive, timeout in hand" : "Alive"}
          </span>
        </span>
        <Lives left={entry.livesLeft} total={startLives} />
      </div>
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
    <div className="mt-4 border-t pt-3">
      {/* The weekly pick is the coin toss. */}
      <p className="flex items-center gap-3">
        <Coin className="size-10 shrink-0" />
        <span>
          <span className="block font-stencil text-3xl leading-none font-black uppercase">Call it</span>
          <span className="text-sm text-muted-foreground">One team to win. Each team once a season.</span>
        </span>
      </p>
    <ul className="mt-3 space-y-3">
      {games.map((g) => (
        <li key={g.gameId}>
          <p className="mb-1 text-xs text-muted-foreground">
            {etTime(g.kickoff)}
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
    </div>
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
        selected ? "border-flood bg-flood/15 shadow-[0_0_14px_-2px_oklch(0.96_0.015_240/0.5)]" : "border-border bg-secondary enabled:hover:bg-muted",
        used && "opacity-40",
        pending === team && "animate-pulse",
        className,
      )}
    >
      <span className={cn("font-display text-xl font-extrabold", used && "line-through")}>{team}</span>
      <span className="flex-1 text-sm text-muted-foreground">{used ? "Used" : line}</span>
      {selected && <Check className="size-5 text-flood" aria-label="Your pick" />}
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
    <form onSubmit={submit} className="mt-4 rounded-xl border border-dashed bg-card/85 p-4">
      <p className="font-display text-lg font-bold uppercase">Add an entry</p>
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
