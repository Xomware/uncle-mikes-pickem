import { UsersRound } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "My groups" };

export default function GroupsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-4xl font-bold uppercase">My groups</h1>
      <div className="mt-6 rounded-xl border border-dashed p-8 text-center">
        <UsersRound className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
        <h2 className="mt-3 text-xl font-semibold uppercase">No groups yet</h2>
        <p className="mx-auto mt-2 max-w-sm leading-relaxed text-muted-foreground">
          When your organizer sends an invite link, open it while signed in and the group shows up here.
        </p>
      </div>
    </div>
  );
}
