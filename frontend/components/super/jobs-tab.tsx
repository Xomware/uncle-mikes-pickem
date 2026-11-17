"use client";

import { CircleAlert, CircleCheck, LoaderCircle, Play, RotateCcw } from "lucide-react";
import { useCallback, useState } from "react";

import { LoadError } from "@/components/load-error";
import { SectionTitle, Skeleton } from "@/components/super/ui";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { useLoad } from "@/lib/api/use-load";
import { type JobName, getSuperGroups, runJob, superRegrade } from "@/lib/super";

// tick and capture no-op outside their windows unless forced.
const JOBS: { job: JobName; label: string; hint: string; payload: Record<string, unknown> }[] = [
  { job: "tick", label: "Scores tick", hint: "Refresh ESPN scores, auto-pick GOWs, regrade changed weeks", payload: { force: true } },
  { job: "capture", label: "ESPN capture", hint: "Snapshot the scoreboard and feeds to S3", payload: { force: true } },
  { job: "sweep", label: "Mail sweep", hint: "Send every email that is due now", payload: {} },
  { job: "replay-load", label: "Replay load", hint: "Rebuild the 2026 replay rows from nflverse and captures", payload: {} },
];

type Outcome = { ok: boolean; text: string } | null;

/** A button that asks once more before it acts. */
function Confirmed({ label, confirm, busy, disabled, onRun }: { label: string; confirm: string; busy: boolean; disabled?: boolean; onRun: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button variant="outline" disabled={busy || disabled} onClick={() => setAsking(true)}>
        {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Play aria-hidden="true" />}
        {label}
      </Button>
    );
  }
  return (
    <span className="flex flex-wrap gap-2">
      <Button
        onClick={() => {
          setAsking(false);
          onRun();
        }}
      >
        {confirm}
      </Button>
      <Button variant="ghost" onClick={() => setAsking(false)}>
        Cancel
      </Button>
    </span>
  );
}

function Result({ outcome }: { outcome: Outcome }) {
  if (!outcome) return null;
  const Icon = outcome.ok ? CircleCheck : CircleAlert;
  return (
    <p role="status" className={outcome.ok ? "mt-2 flex items-center gap-1.5 text-sm text-correct" : "mt-2 flex items-center gap-1.5 text-sm text-wrong"}>
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {outcome.text}
    </p>
  );
}

export function JobsTab() {
  const fetcher = useCallback(() => getSuperGroups(), []);
  const { load, retry } = useLoad(fetcher);
  const [busy, setBusy] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const [groupId, setGroupId] = useState("");
  const [week, setWeek] = useState("");

  async function act(key: string, run: () => Promise<string>) {
    setBusy(key);
    setOutcomes((o) => ({ ...o, [key]: null }));
    try {
      const text = await run();
      setOutcomes((o) => ({ ...o, [key]: { ok: true, text } }));
    } catch (err) {
      setOutcomes((o) => ({ ...o, [key]: { ok: false, text: err instanceof Error ? err.message : "Failed." } }));
    } finally {
      setBusy(null);
    }
  }

  const weekNumber = week ? Number(week) : undefined;
  const target = groupId || (load.status === "ready" ? (load.data[0]?.groupId ?? "") : "");

  return (
    <>
      <SectionTitle>Scheduled jobs</SectionTitle>
      <p className="mt-1 text-sm text-muted-foreground">Starts the job now in the background. Its result shows on Overview within a minute or two.</p>
      <ul className="panel mt-3 divide-y">
        {JOBS.map((j) => (
          <li key={j.job} className="px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <span className="min-w-0 flex-1 basis-48">
                <span className="block font-semibold">{j.label}</span>
                <span className="text-sm text-muted-foreground">{j.hint}</span>
              </span>
              <Confirmed
                label="Run"
                confirm={`Run ${j.label.toLowerCase()}`}
                busy={busy === j.job}
                disabled={busy !== null}
                onRun={() => act(j.job, async () => `Started ${(await runJob(j.job, j.payload)).function}`)}
              />
            </div>
            <Result outcome={outcomes[j.job] ?? null} />
          </li>
        ))}
      </ul>

      <SectionTitle>Regrade a group</SectionTitle>
      {load.status === "loading" && <Skeleton label="Loading groups" />}
      {load.status === "error" && <LoadError title="Couldn't load groups" message={load.message} onRetry={retry} />}
      {load.status === "ready" &&
        (load.data.length === 0 ? (
          <p className="panel mt-3 p-4 text-muted-foreground">No groups yet.</p>
        ) : (
          <div className="panel mt-3 p-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
              <label className="grid gap-1.5 text-sm font-medium">
                Group
                <Select value={target} onChange={(e) => setGroupId(e.target.value)}>
                  {load.data.map((g) => (
                    <option key={g.groupId} value={g.groupId}>
                      {g.name} ({g.season})
                    </option>
                  ))}
                </Select>
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Week
                <Input type="number" inputMode="numeric" min={1} max={18} value={week} onChange={(e) => setWeek(e.target.value)} placeholder="All" />
              </label>
            </div>
            <div className="mt-4">
              <Confirmed
                label="Regrade"
                confirm={weekNumber ? `Regrade Week ${weekNumber}` : "Regrade every locked week"}
                busy={busy === "regrade"}
                disabled={busy !== null || (weekNumber !== undefined && !(weekNumber >= 1 && weekNumber <= 18))}
                onRun={() =>
                  act("regrade", async () => {
                    const done = await superRegrade(target, weekNumber);
                    return done.weeks.length ? `Rewrote week ${done.weeks.join(", ")}` : "Nothing changed";
                  })
                }
              />
            </div>
            <Result outcome={outcomes.regrade ?? null} />
          </div>
        ))}
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <RotateCcw className="size-3.5" aria-hidden="true" />
        Every run and regrade is written to the audit log.
      </p>
    </>
  );
}
