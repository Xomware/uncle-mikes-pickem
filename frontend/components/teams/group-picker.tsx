"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Select } from "@/components/ui/input";
import type { GroupSummary } from "@/lib/api/client";

interface GroupPickerProps {
  groups: GroupSummary[];
  current: string;
}

/** Which group's picks and clock the team pages use. Only shown when there's a choice. */
export function GroupPicker({ groups, current }: GroupPickerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  if (groups.length < 2) return null;

  function choose(groupId: string) {
    const next = new URLSearchParams(params.toString());
    next.set("groupId", groupId);
    router.replace(`${pathname}?${next}`);
  }

  return (
    <label className="flex items-center gap-2">
      <span className="chalk shrink-0 text-xs tracking-[0.14em]">Group</span>
      <Select value={current} onChange={(e) => choose(e.target.value)} className="h-11 w-auto max-w-56 bg-card text-sm">
        {groups.map((g) => (
          <option key={g.groupId} value={g.groupId}>
            {g.name} ({g.season})
          </option>
        ))}
      </Select>
    </label>
  );
}
