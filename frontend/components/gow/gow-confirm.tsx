"use client";

import { CircleCheck, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";

import { LoadError } from "@/components/load-error";
import { Button, buttonVariants } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import { useLoad } from "@/lib/api/use-load";
import { type GowPeek, blocked, confirmGow, peekGow } from "@/lib/gow-link";
import { picksHref } from "@/lib/picks";

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const message = (e: unknown) => (e instanceof ApiError ? e.message : "Couldn't reach Pick Em. Check your connection.");

/** Shows the game a GOW email button names, and sets it only on Confirm: a mail scanner's GET changes nothing. */
export function GowConfirm() {
  const token = useSearchParams().get("t") ?? "";
  const fetcher = useCallback(() => peekGow(token), [token]);
  const { load, retry } = useLoad(fetcher);

  if (!token) {
    return (
      <Shell>
        <p className="text-muted-foreground">This page needs the link from a Game of the Week email.</p>
      </Shell>
    );
  }
  return (
    <Shell>
      {load.status === "loading" && (
        <p role="status" className="flex items-center gap-2 text-muted-foreground">
          <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
          Loading the game...
        </p>
      )}
      {load.status === "error" && <LoadError title="Couldn't open this link" message={load.message} onRetry={retry} />}
      {load.status === "ready" && <Choice token={token} peek={load.data} />}
    </Shell>
  );
}

function Choice({ token, peek }: { token: string; peek: GowPeek }) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function confirm() {
    setSaving(true);
    setError(null);
    try {
      await confirmGow(token);
      setDone(true);
    } catch (e) {
      setError(message(e));
    } finally {
      setSaving(false);
    }
  }

  const { game } = peek;
  const reason = blocked(peek);
  return (
    <>
      <p className="text-sm font-semibold tracking-widest text-muted-foreground uppercase">
        {peek.groupName} &middot; Week {peek.week}
      </p>
      <div className="panel mt-3 p-5">
        <p className="font-heading text-4xl leading-none font-extrabold uppercase">
          {game.away} <span className="text-muted-foreground">@</span> {game.home}
        </p>
        <p className="mt-2 text-muted-foreground">
          {when(game.kickoff)}
          {game.hype !== null && <> &middot; Hype {game.hype}</>}
        </p>
        {peek.gow && peek.gow.gameId !== game.gameId && !done && (
          <p className="mt-3 text-sm text-muted-foreground">
            Another game is the GOW right now{peek.gow.chosenBy === "auto" ? " (set automatically)" : ""}. Confirming replaces it.
          </p>
        )}
      </div>

      {done ? (
        <p role="status" className="mt-5 flex items-center gap-2 font-semibold text-primary">
          <CircleCheck className="size-5" aria-hidden="true" />
          {game.away} @ {game.home} is the Week {peek.week} Game of the Week.
        </p>
      ) : reason ? (
        <p className="mt-5 text-muted-foreground">{reason}</p>
      ) : (
        <Button size="lg" className="mt-5 w-full" disabled={saving} onClick={confirm}>
          {saving && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          Confirm {game.away} @ {game.home}
        </Button>
      )}
      {error && (
        <p role="alert" className="mt-3 text-wrong">
          {error}
        </p>
      )}
      <Link href={picksHref(peek.groupId, peek.week)} className={buttonVariants({ variant: "outline", className: "mt-3 w-full" })}>
        See all games
      </Link>
      <p className="mt-2 text-center text-sm text-muted-foreground">Picks lock {when(peek.lockAt)}.</p>
    </>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-10">
      <h1 className="font-stencil mb-6 text-4xl leading-none font-black uppercase">Game of the Week</h1>
      {children}
    </main>
  );
}
