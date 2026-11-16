"use client";

import { CircleAlert, CircleCheck, Clock, RefreshCw } from "lucide-react";
import { useCallback, useState } from "react";

import { LoadError } from "@/components/load-error";
import { SectionTitle, Skeleton, Stat } from "@/components/super/ui";
import { Button } from "@/components/ui/button";
import { useLoad } from "@/lib/api/use-load";
import { type Health, type Job, JOB_LABEL, type Overview, ago, getOverview, jobHealth } from "@/lib/super";
import { cn } from "@/lib/utils";

const HEALTH: Record<Health, { label: string; className: string; icon: typeof CircleCheck }> = {
  green: { label: "Healthy", className: "text-correct", icon: CircleCheck },
  amber: { label: "Late", className: "text-led", icon: Clock },
  red: { label: "Failing", className: "text-wrong", icon: CircleAlert },
};

export function OverviewTab() {
  const fetcher = useCallback(() => getOverview(), []);
  const { load, retry } = useLoad(fetcher);

  if (load.status === "loading") return <Skeleton label="Loading the overview" />;
  if (load.status === "error") return <LoadError title="Couldn't load the overview" message={load.message} onRetry={retry} />;
  return <OverviewBody data={load.data} onRefresh={retry} />;
}

function OverviewBody({ data, onRefresh }: { data: Overview; onRefresh: () => void }) {
  const [now] = useState(() => new Date());
  return (
    <>
      <div className="flex justify-end">
        <Button variant="outline" onClick={onRefresh}>
          <RefreshCw aria-hidden="true" />
          Refresh
        </Button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Groups" value={data.groups} />
        <Stat label="Users" value={data.users} />
        <Stat label="Emails 24h" value={data.mail.sent24h} />
        <Stat label="Emails 7d" value={data.mail.sent7d} />
        <Stat label="Failed sends" value={data.mail.failed} tone={data.mail.failed ? "wrong" : undefined} />
      </div>

      <SectionTitle>Jobs</SectionTitle>
      <ul className="mt-3 grid gap-3 sm:grid-cols-3">
        {(Object.keys(JOB_LABEL) as Job[]).map((job) => {
          const run = data.jobs[job];
          const health = HEALTH[jobHealth(job, run, now)];
          return (
            <li key={job} className="scoreboard px-4 py-3">
              <p className="flex items-center justify-between gap-2">
                <span className="font-display text-lg font-extrabold uppercase">{JOB_LABEL[job]}</span>
                <span className={cn("flex items-center gap-1 text-sm font-semibold", health.className)}>
                  <health.icon className="size-4" aria-hidden="true" />
                  {health.label}
                </span>
              </p>
              <p className="led mt-2 text-xl">{run ? ago(run.at, now) : "NEVER"}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {run ? `${new Date(run.at).toLocaleString()}${run.mode ? ` · ${run.mode}` : ""}` : "No run recorded yet"}
              </p>
              {run?.error && <p className="mt-2 line-clamp-2 text-sm text-wrong">{run.error}</p>}
            </li>
          );
        })}
      </ul>

      <SectionTitle>This week</SectionTitle>
      {data.perGroup.length === 0 ? (
        <p className="panel mt-3 p-4 text-muted-foreground">No groups yet.</p>
      ) : (
        <div className="panel mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs tracking-wider text-muted-foreground uppercase">
              <tr>
                <th scope="col" className="px-4 py-2">Group</th>
                <th scope="col" className="px-2 py-2 text-right">Week</th>
                <th scope="col" className="px-2 py-2 text-right">Picks in</th>
                <th scope="col" className="px-4 py-2 text-right">Complete</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.perGroup.map((g) => (
                <tr key={g.groupId}>
                  <th scope="row" className="max-w-48 truncate px-4 py-2.5 font-semibold">{g.name}</th>
                  <td className="px-2 py-2.5 text-right tabular-nums">{g.week}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">
                    {g.submitted}/{g.members}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{g.complete}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SectionTitle>Recent errors</SectionTitle>
      {data.errors.length === 0 ? (
        <p className="panel mt-3 flex items-center gap-2 p-4 text-muted-foreground">
          <CircleCheck className="size-4 text-correct" aria-hidden="true" />
          No failed runs in the last 50 of each job.
        </p>
      ) : (
        <ul className="panel mt-3 divide-y">
          {data.errors.map((e) => (
            <li key={`${e.job}${e.at}`} className="px-4 py-3">
              <p className="text-xs text-muted-foreground">
                {JOB_LABEL[e.job]} · {new Date(e.at).toLocaleString()}
              </p>
              <p className="mt-1 text-sm break-words text-wrong">{e.error}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
