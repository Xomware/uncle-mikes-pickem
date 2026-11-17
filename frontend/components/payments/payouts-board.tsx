"use client";

import { CircleCheck, LoaderCircle } from "lucide-react";
import { type ReactNode, useCallback, useState } from "react";

import { LoadError } from "@/components/load-error";
import { Button } from "@/components/ui/button";
import { type Payout, type PaymentMethod, type Payouts, getPayouts, markPayout } from "@/lib/api/client";
import { useLoad } from "@/lib/api/use-load";
import { isOrganizer } from "@/lib/groups";
import { STATUS_LABEL, cents, deathStatus, linesFor, seasonStatus, weeklyPaid } from "@/lib/payouts";

export function PayoutsBoard({ groupId, method }: { groupId: string; method: PaymentMethod }) {
  const fetcher = useCallback(() => getPayouts(groupId), [groupId]);
  const { load, retry, setData } = useLoad(fetcher);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (load.status === "loading") return <span className="mt-6 block h-48 animate-pulse rounded-xl bg-board" />;
  if (load.status === "error") {
    return (
      <div className="mt-6">
        <LoadError title="Couldn't load payouts" message={load.message} onRetry={retry} />
      </div>
    );
  }
  const book = load.data;
  const organizer = isOrganizer(book.role);
  const names = new Map([...book.members, ...book.payouts].map((p) => [p.sub, p.name]));

  async function toggle(p: Payout) {
    const key = lineKey(p);
    setBusy(key);
    setError(null);
    try {
      const sent = p.sent ? {} : { method, sentOn: new Date().toLocaleDateString("en-CA") };
      await markPayout({ groupId, sub: p.sub, pot: p.pot, week: p.week ?? undefined, sent: !p.sent, ...sent });
      setData(await getPayouts(groupId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that.");
    } finally {
      setBusy(null);
    }
  }

  const lines = (list: Payout[]) => (
    <ul className="divide-y divide-white/10">
      {list.map((p) => (
        <PayoutLine key={lineKey(p)} payout={p} organizer={organizer} busy={busy === lineKey(p)} onToggle={() => toggle(p)} />
      ))}
    </ul>
  );

  return (
    <section aria-labelledby="payouts-title" className="mt-6">
      <div className="scoreboard p-5">
        <h2 id="payouts-title" className="font-display text-2xl font-bold tracking-wider uppercase">
          Payouts
        </h2>
        <dl className="mt-3 grid grid-cols-3 gap-2">
          <Tile label="Weekly paid" value={cents(weeklyPaid(book))} note={`${book.weeks.length} wk graded`} />
          <Tile label="Season pot" value={cents(book.season.pot)} note={seasonStatus(book)} />
          <Tile label="Death pool" value={cents(book.death.pot)} note={deathStatus(book, names)} />
        </dl>
        <Totals book={book} />
      </div>

      {error && (
        <p role="alert" className="mt-4 text-wrong">
          {error}
        </p>
      )}

      <Panel title="Weekly winners">
        {book.weeks.length === 0 && <Empty>Weekly pots pay out once Week 1 is graded.</Empty>}
        {[...book.weeks].reverse().map((w) => (
          <div key={w.week} className="py-2">
            <p className="flex items-baseline gap-2">
              <span className="led text-lg">W{w.week}</span>
              <span className="text-sm text-muted-foreground">{cents(w.pot)} pot</span>
              <span className="ml-auto text-xs tracking-wider text-muted-foreground uppercase">{STATUS_LABEL[w.status]}</span>
            </p>
            {w.winners.length ? lines(linesFor(book, "weekly", w.week)) : <Empty>No winner yet.</Empty>}
          </div>
        ))}
      </Panel>

      <Panel title={book.season.final ? "Season" : "Season, if it ended today"}>
        {linesFor(book, "yearly").length ? lines(linesFor(book, "yearly")) : <Empty>Pays by final place after Week 18.</Empty>}
      </Panel>

      <Panel title="Death pool">
        {linesFor(book, "death").length ? lines(linesFor(book, "death")) : <Empty>{deathStatus(book, names)}.</Empty>}
      </Panel>
    </section>
  );
}

const lineKey = (p: Payout) => `${p.pot}${p.week ?? ""}${p.sub}`;

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="min-w-0 rounded-md border border-white/10 bg-white/[0.03] p-2">
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd className="led truncate text-xl sm:text-2xl">{value}</dd>
      <dd className="text-xs text-muted-foreground">{note}</dd>
    </div>
  );
}

function Totals({ book }: { book: Payouts }) {
  if (!book.members.length) return <p className="mt-4 text-sm text-muted-foreground">Nobody has won anything yet.</p>;
  return (
    <table className="mt-4 w-full text-sm">
      <caption className="sr-only">Won and sent per player</caption>
      <thead className="text-xs text-muted-foreground uppercase">
        <tr>
          <th scope="col" className="py-1 text-left font-normal">Player</th>
          <th scope="col" className="py-1 text-right font-normal">Won</th>
          <th scope="col" className="py-1 text-right font-normal">Sent</th>
          <th scope="col" className="py-1 text-right font-normal">Due</th>
        </tr>
      </thead>
      <tbody>
        {book.members.map((t) => (
          <tr key={t.sub} className="border-t border-white/10">
            <th scope="row" className="max-w-0 py-1.5 text-left font-normal">
              <span className="block truncate font-display text-base font-bold">{t.name}</span>
              {t.pending > 0 && <span className="block text-xs text-muted-foreground">+{cents(t.pending)} pending</span>}
            </th>
            <td className="led py-1.5 text-right">{cents(t.won)}</td>
            <td className="py-1.5 text-right tabular-nums">{cents(t.sent)}</td>
            <td className={`py-1.5 text-right tabular-nums ${t.won > t.sent ? "text-led" : "text-muted-foreground"}`}>
              {cents(Math.max(0, t.won - t.sent))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PayoutLine({ payout: p, organizer, busy, onToggle }: { payout: Payout; organizer: boolean; busy: boolean; onToggle: () => void }) {
  return (
    <li className="flex min-h-11 items-center gap-2 py-1.5">
      <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
      <span className="tabular-nums">{cents(p.amount)}</span>
      {organizer && p.final ? (
        <Button variant={p.sent ? "secondary" : "outline"} aria-pressed={p.sent} disabled={busy} onClick={onToggle} className="w-28">
          {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : p.sent && <CircleCheck className="text-correct" aria-hidden="true" />}
          {p.sent ? "Sent" : "Mark sent"}
        </Button>
      ) : (
        <span className="w-20 text-right text-xs text-muted-foreground">{p.sent ? "Sent" : p.final ? "Not sent" : "Pending"}</span>
      )}
    </li>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="panel mt-4 p-4">
      <h3 className="font-display text-lg font-bold tracking-wider uppercase">{title}</h3>
      <div className="mt-1 divide-y divide-white/10">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-2 text-sm text-muted-foreground">{children}</p>;
}
