"use client";

import { ArrowLeft, CircleCheck, LoaderCircle, Pencil } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type FormEvent, useCallback, useState } from "react";

import { LoadError } from "@/components/load-error";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { type Ledger, type LedgerLine, type PaymentMethod, getLedger, markPayment } from "@/lib/api/client";
import { useLoad } from "@/lib/api/use-load";
import { groupHref, isOrganizer } from "@/lib/groups";
import { KIND_LABEL, dollars, lineLabel } from "@/lib/payments";
import { METHOD_LABEL, POTS } from "@/lib/settings";

const PLACE = ["1st", "2nd", "3rd"];

type Paid = Required<Pick<LedgerLine, "amount" | "method" | "paidOn">>;

export function LedgerView() {
  const id = useSearchParams().get("id") ?? "";
  const fetcher = useCallback(() => getLedger(id), [id]);
  const { load, retry, setData } = useLoad(fetcher);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6" aria-busy={load.status === "loading"}>
      <Link href={groupHref(id)} className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to group
      </Link>
      <h1 className="mt-2 text-4xl font-bold uppercase">Payments</h1>
      {load.status === "loading" && <span className="mt-6 block h-64 animate-pulse rounded-xl bg-muted" />}
      {load.status === "error" && (
        <div className="mt-6">
          <LoadError title="Couldn't load payments" message={load.message} onRetry={retry} />
        </div>
      )}
      {load.status === "ready" && !isOrganizer(load.data.role) && (
        <p className="mt-6 text-muted-foreground">Only the group&apos;s owner or an admin can see everyone&apos;s payments.</p>
      )}
      {load.status === "ready" && isOrganizer(load.data.role) && (
        <Book ledger={load.data} onChange={() => getLedger(id).then(setData)} />
      )}
    </div>
  );
}

function Book({ ledger, onChange }: { ledger: Ledger; onChange: () => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const owed = ledger.members.reduce((n, m) => n + m.owed, 0);
  const paid = ledger.members.reduce((n, m) => n + m.paid, 0);
  const defaults = (line: LedgerLine): Paid => ({
    amount: line.owed,
    method: ledger.methods[0]?.method ?? "other",
    paidOn: new Date().toLocaleDateString("en-CA"),
  });

  async function mark(sub: string, line: LedgerLine, payment: Paid | null) {
    const key = `${sub}${line.kind}${line.entryId ?? ""}`;
    setBusy(key);
    setError(null);
    try {
      await markPayment({ groupId: ledger.group.groupId, sub, kind: line.kind, entryId: line.entryId, paid: !!payment, ...payment });
      await onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <section className="mt-6 rounded-xl border bg-card p-5">
        <p className="text-muted-foreground">Collected</p>
        <p className="font-display text-4xl font-bold">
          {dollars(paid)} <span className="text-xl text-muted-foreground">of {dollars(owed)}</span>
        </p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" role="presentation">
          <div className="h-full bg-correct" style={{ width: `${owed ? Math.min(100, (paid / owed) * 100) : 0}%` }} />
        </div>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          {POTS.filter((pot) => ledger.pots[pot].total > 0).map((pot) => (
            <div key={pot} className="rounded-lg border p-3">
              <dt className="text-sm text-muted-foreground">{KIND_LABEL[pot]}</dt>
              <dd className="text-xl font-semibold tabular-nums">{dollars(ledger.pots[pot].total)}</dd>
              <dd className="text-sm text-muted-foreground">
                {ledger.pots[pot].payouts.map((p, i) => `${PLACE[i] ?? `${i + 1}th`} ${dollars(p)}`).join(" · ")}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {error && (
        <p role="alert" className="mt-4 text-wrong">
          {error}
        </p>
      )}

      <ul className="mt-6 space-y-3">
        {ledger.members.map((m) => (
          <li key={m.sub} className="rounded-xl border bg-card p-4">
            <p className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-medium">{m.name}</span>
              {m.balance > 0 ? (
                <span className="text-sm text-wrong tabular-nums">Owes {dollars(m.balance)}</span>
              ) : (
                <span className="flex items-center gap-1 text-sm text-correct">
                  <CircleCheck className="size-4" aria-hidden="true" />
                  {m.lines.length ? "Paid up" : "Owes nothing"}
                </span>
              )}
            </p>
            <ul className="mt-2 divide-y border-t">
              {m.lines.map((line) => {
                const key = `${m.sub}${line.kind}${line.entryId ?? ""}`;
                return (
                  <Line
                    key={key}
                    line={line}
                    busy={busy === key}
                    defaults={defaults(line)}
                    methods={ledger.methods.map((x) => x.method)}
                    onMark={(payment) => mark(m.sub, line, payment)}
                  />
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </>
  );
}

interface LineProps {
  line: LedgerLine;
  busy: boolean;
  defaults: Paid;
  methods: PaymentMethod[];
  onMark: (payment: Paid | null) => Promise<void>;
}

function Line({ line, busy, defaults, methods, onMark }: LineProps) {
  const [editing, setEditing] = useState<Paid | null>(null);
  const current = line.paid ? { amount: line.amount!, method: line.method!, paidOn: line.paidOn! } : defaults;
  const options = [...new Set([...methods, current.method, "other" as const])];

  async function save(e: FormEvent) {
    e.preventDefault();
    await onMark(editing);
    setEditing(null);
  }

  return (
    <li className="py-2">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1">
          <span className="block truncate">{lineLabel(line)}</span>
          <span className="text-sm text-muted-foreground">
            {line.paid
              ? `${dollars(line.amount!)} · ${METHOD_LABEL[line.method!]} · ${new Date(`${line.paidOn}T12:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
              : `${dollars(line.owed)} due`}
          </span>
        </span>
        <Button variant="ghost" aria-label={`Edit ${lineLabel(line)} payment`} onClick={() => setEditing(editing ? null : current)}>
          <Pencil aria-hidden="true" />
        </Button>
        <Button
          variant={line.paid ? "secondary" : "outline"}
          aria-pressed={line.paid}
          disabled={busy}
          onClick={() => onMark(line.paid ? null : defaults)}
          className="w-24"
        >
          {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : line.paid && <CircleCheck className="text-correct" aria-hidden="true" />}
          {line.paid ? "Paid" : "Unpaid"}
        </Button>
      </div>
      {editing && (
        <form onSubmit={save} className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <label className="text-sm">
            Amount
            <Input type="number" min={0} max={10000} step={1} required value={editing.amount}
              onChange={(e) => setEditing({ ...editing, amount: Number(e.target.value) })} />
          </label>
          <label className="text-sm">
            Method
            <Select value={editing.method} onChange={(e) => setEditing({ ...editing, method: e.target.value as PaymentMethod })}>
              {options.map((m) => (
                <option key={m} value={m}>
                  {METHOD_LABEL[m]}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-sm">
            Date
            <Input type="date" required value={editing.paidOn} onChange={(e) => setEditing({ ...editing, paidOn: e.target.value })} />
          </label>
          <Button type="submit" disabled={busy} className="self-end">
            Save as paid
          </Button>
        </form>
      )}
    </li>
  );
}
