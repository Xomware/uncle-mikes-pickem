"use client";

import { Clock, LoaderCircle } from "lucide-react";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { advanceReplay, regrade } from "@/lib/api/client";
import { fromLocalInput, openWeek, toLocalInput, weekJump } from "@/lib/replay";

interface Props {
  groupId: string;
  organizer: boolean;
  replay: { clock: string; lockAts: Record<string, string> };
  onMoved: (clock: string) => void;
}

export function ReplayBar({ groupId, organizer, replay, onMoved }: Props) {
  const [exact, setExact] = useState(() => toLocalInput(replay.clock));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = openWeek(replay.clock, replay.lockAts);
  const weeks = Object.keys(replay.lockAts)
    .map(Number)
    .sort((a, b) => a - b);

  async function move(to: string) {
    setSaving(true);
    setError(null);
    try {
      const { clock } = await advanceReplay(groupId, to);
      setExact(toLocalInput(clock));
      // /replay/advance doesn't grade. Regrade before onMoved, so what refetches on the new clock sees it.
      await regrade(groupId).catch((err: unknown) =>
        setError(`Clock moved, but regrading failed: ${err instanceof Error ? err.message : "unknown error"}`),
      );
      onMoved(clock);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not move the clock.");
    } finally {
      setSaving(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (exact) void move(fromLocalInput(exact));
  }

  return (
    <section aria-label="Replay clock" className="mt-6 rounded-xl border border-primary/40 bg-card p-4">
      <p className="flex flex-wrap items-center gap-x-2 text-sm">
        <Clock aria-hidden="true" className="size-4 text-primary" />
        <span className="font-semibold uppercase">Replay clock</span>
        <time dateTime={replay.clock} className="font-medium">
          {new Date(replay.clock).toLocaleString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </time>
        <span className="text-muted-foreground">· {open ? `Week ${open} picks open` : "Season over"}</span>
      </p>

      {organizer && (
        <>
          <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Jump to an hour before a week locks">
            {weeks.map((w) => (
              <Button
                key={w}
                type="button"
                size="sm"
                variant={w === open ? "default" : "outline"}
                aria-pressed={w === open}
                disabled={saving}
                onClick={() => move(weekJump(replay.lockAts[String(w)]))}
                className="min-w-11"
              >
                W{w}
              </Button>
            ))}
          </div>
          <form onSubmit={submit} className="mt-3 flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="replay-exact">
              Set the clock to
            </label>
            <Input
              id="replay-exact"
              type="datetime-local"
              value={exact}
              onChange={(e) => setExact(e.target.value)}
              className="w-auto"
              required
            />
            <Button type="submit" variant="outline" disabled={saving || !exact}>
              {saving && <LoaderCircle className="animate-spin" aria-hidden="true" />}
              Set clock
            </Button>
          </form>
          {error && (
            <p role="alert" className="mt-2 text-sm text-wrong">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}
