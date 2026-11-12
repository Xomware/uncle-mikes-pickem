"use client";

import { CircleAlert, LoaderCircle, UserPlus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { acceptInvite } from "@/lib/api/client";

export function JoinInvite() {
  const code = useSearchParams().get("code")?.trim() ?? "";
  const router = useRouter();
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(code ? null : "This link has no invite code in it.");

  async function join() {
    setJoining(true);
    setError(null);
    try {
      await acceptInvite(code);
      router.replace("/groups/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join the group.");
      setJoining(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-12">
      <div className="rounded-xl border bg-card p-6">
        <UserPlus className="size-6 text-primary" aria-hidden="true" />
        <h1 className="mt-3 text-2xl font-bold uppercase">You&apos;re invited</h1>
        <p className="mt-2 leading-relaxed text-muted-foreground">
          Join the group to make weekly picks and see the standings.
        </p>
        {error && (
          <p role="alert" className="mt-4 flex items-start gap-2 text-wrong">
            <CircleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}
        <Button className="mt-6 w-full" onClick={join} disabled={!code || joining}>
          {joining && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          {joining ? "Joining" : "Join group"}
        </Button>
      </div>
    </div>
  );
}
