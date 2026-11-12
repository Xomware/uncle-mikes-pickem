"use client";

import { Check, Copy, Link2, LoaderCircle } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createInvite } from "@/lib/api/client";
import { inviteUrl } from "@/lib/groups";

type State =
  | { status: "idle" | "creating" }
  | { status: "error"; message: string }
  | { status: "ready"; url: string; expires: string };

export function InviteLink({ groupId }: { groupId: string }) {
  const [state, setState] = useState<State>({ status: "idle" });
  const [copied, setCopied] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function create() {
    setState({ status: "creating" });
    try {
      const invite = await createInvite(groupId);
      const expires = new Date(invite.expiresAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
      setState({ status: "ready", url: inviteUrl(window.location.origin, invite.code), expires });
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : "Could not create a link." });
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked (insecure context, permissions); leave the link selected to copy by hand.
      input.current?.select();
    }
  }

  return (
    <section className="mt-6 panel p-5">
      <h2 className="font-display text-2xl font-extrabold uppercase">Invite people</h2>
      {state.status !== "ready" && (
        <>
          <p className="mt-1 text-muted-foreground">Anyone with the link can join after signing in with Google.</p>
          {state.status === "error" && (
            <p role="alert" className="mt-3 text-wrong">
              {state.message}
            </p>
          )}
          <Button className="mt-4 w-full sm:w-auto" onClick={create} disabled={state.status === "creating"}>
            {state.status === "creating" ? (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            ) : (
              <Link2 aria-hidden="true" />
            )}
            Create invite link
          </Button>
        </>
      )}
      {state.status === "ready" && (
        <>
          <p className="mt-1 text-muted-foreground">Works until {state.expires}. Send it in your group chat.</p>
          <div className="mt-4 flex gap-2">
            <label className="sr-only" htmlFor="invite-url">
              Invite link
            </label>
            <Input id="invite-url" ref={input} value={state.url} readOnly onFocus={(e) => e.target.select()} />
            <Button variant="outline" onClick={() => copy(state.url)} aria-live="polite">
              {copied ? <Check className="text-correct" aria-hidden="true" /> : <Copy aria-hidden="true" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
