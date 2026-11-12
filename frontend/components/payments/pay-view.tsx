"use client";

import { ArrowLeft, Check, CircleCheck, Copy, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";

import { LoadError } from "@/components/load-error";
import { Button, buttonVariants } from "@/components/ui/button";
import { type Ledger, getLedger } from "@/lib/api/client";
import { useLoad } from "@/lib/api/use-load";
import { groupHref } from "@/lib/groups";
import { dollars, lineLabel, payLink, paymentNote } from "@/lib/payments";
import { METHOD_LABEL } from "@/lib/settings";

export function PayView() {
  const id = useSearchParams().get("id") ?? "";
  const fetcher = useCallback(() => getLedger(id), [id]);
  const { load, retry } = useLoad(fetcher);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6" aria-busy={load.status === "loading"}>
      <Link href={groupHref(id)} className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to group
      </Link>
      <h1 className="mt-2 text-4xl font-bold uppercase">Pay</h1>
      {load.status === "loading" && <span className="mt-6 block h-64 animate-pulse rounded-xl bg-muted" />}
      {load.status === "error" && (
        <div className="mt-6">
          <LoadError title="Couldn't load what you owe" message={load.message} onRetry={retry} />
        </div>
      )}
      {load.status === "ready" && <Balance ledger={load.data} />}
    </div>
  );
}

function Balance({ ledger }: { ledger: Ledger }) {
  const { group, methods } = ledger;
  const [me] = ledger.members;
  const note = paymentNote(group.name, group.season);

  return (
    <>
      <section className="mt-6 rounded-xl border bg-card p-5">
        <p className="text-muted-foreground">{group.name} · {group.season} season</p>
        <p className="mt-1 font-display text-5xl font-bold">{dollars(me.balance)}</p>
        <p className="text-sm text-muted-foreground">{me.balance > 0 ? "left to pay" : "owed"}</p>
        <ul className="mt-4 divide-y border-t">
          {me.lines.map((line) => (
            <li key={`${line.kind}${line.entryId ?? ""}`} className="flex min-h-11 items-center gap-2 py-2">
              <span className="min-w-0 flex-1 truncate">{lineLabel(line)}</span>
              {line.paid && <CircleCheck className="size-4 text-correct" aria-label="Paid" />}
              <span className="tabular-nums">{dollars(line.owed)}</span>
            </li>
          ))}
        </ul>
      </section>

      {me.balance <= 0 && (
        <p role="status" className="mt-6 flex items-center gap-2 rounded-lg border border-correct/40 bg-correct-muted p-3">
          <CircleCheck className="size-5 shrink-0 text-correct" aria-hidden="true" />
          {me.lines.length ? "You're paid up." : "Nothing to pay yet."}
        </p>
      )}
      {me.balance > 0 && !methods.length && (
        <p className="mt-6 text-muted-foreground">The organizer hasn&apos;t added a way to pay yet.</p>
      )}
      {me.balance > 0 && methods.length > 0 && (
        <section className="mt-6 space-y-3">
          {methods.map(({ method, handle }, i) => {
            const href = payLink(method, handle, me.balance, note);
            return href ? (
              <a
                key={i}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ size: "lg", className: "w-full" })}
              >
                Pay {dollars(me.balance)} with {METHOD_LABEL[method]}
                <ExternalLink aria-hidden="true" />
              </a>
            ) : (
              <CopyHandle key={i} label={METHOD_LABEL[method]} handle={handle} />
            );
          })}
        </section>
      )}

      <p className="mt-6 text-sm text-muted-foreground">
        Payment goes directly to the organizer. This app never touches your money; the organizer marks you paid once it
        arrives.
      </p>
    </>
  );
}

function CopyHandle({ label, handle }: { label: string; handle: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(handle);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked (insecure context, permissions); the handle is select-all to copy by hand.
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-muted-foreground">{label}</span>
        <span className="block font-mono break-all select-all">{handle}</span>
      </span>
      <Button variant="outline" onClick={copy} aria-live="polite">
        {copied ? <Check className="text-correct" aria-hidden="true" /> : <Copy aria-hidden="true" />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
