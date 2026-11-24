"use client";

import { ArrowRight, Star } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { getSlate } from "@/lib/api/client";
import { useLoad } from "@/lib/api/use-load";
import { type Banner, banners } from "@/lib/banners";
import { countdown, picksHref } from "@/lib/picks";
import { etTime } from "@/lib/time";

const SHOWN = 3;

/** Under the header on every signed-in page: what the caller still owes this week. */
export function ActionBanners() {
  const path = usePathname();
  const here = useSearchParams().get("id");
  // Refetched on every page change, so a sheet saved a moment ago stops nagging.
  const fetcher = useCallback(() => getSlate(), [path]); // eslint-disable-line react-hooks/exhaustive-deps
  const { load } = useLoad(fetcher);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  if (load.status !== "ready") return null;
  // The picks page for a group already says all of this about that group.
  const due = banners(load.data, now).filter((b) => !(path.startsWith("/picks") && b.groupId === here));
  if (due.length === 0) return null;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-2 px-4 pt-3 sm:px-6" role="region" aria-label="To do this week">
      {due.slice(0, SHOWN).map((b) => (
        <BannerRow key={`${b.kind}-${b.groupId}`} banner={b} now={now} />
      ))}
      {due.length > SHOWN && (
        <Link href="/home/" className="chalk inline-flex min-h-9 items-center text-xs tracking-[0.14em] hover:text-primary">
          {due.length - SHOWN} more on Home
        </Link>
      )}
    </div>
  );
}

function BannerRow({ banner, now }: { banner: Banner; now: number }) {
  if (banner.kind === "gow") {
    return (
      <Link
        href={picksHref(banner.groupId, banner.week)}
        className="group flex animate-rise items-center gap-3 overflow-hidden rounded-lg border-2 border-white bg-zinc-950 py-2 pr-3 text-white shadow-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
      >
        <span aria-hidden="true" className="w-2 self-stretch bg-[repeating-linear-gradient(0deg,white_0_8px,black_8px_16px)]" />
        <Star className="size-5 shrink-0 fill-primary text-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1 text-sm">
          <strong className="block font-display text-base tracking-wide uppercase">
            Choose the Week {banner.week} Game of the Week
          </strong>
          <span className="text-zinc-300">
            {banner.group}: by {etTime(banner.due)}, or the most-hyped game is set for you.
          </span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-white px-3 py-2 font-display text-sm font-extrabold tracking-wide text-black uppercase group-hover:bg-primary">
          Choose
          <ArrowRight className="size-4" aria-hidden="true" />
        </span>
      </Link>
    );
  }
  const left = countdown(Date.parse(banner.lockAt) - now);
  return (
    <Link
      href={picksHref(banner.groupId, banner.week)}
      className="scoreboard group flex animate-rise items-center gap-3 px-3 py-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
    >
      <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full bg-led motion-safe:animate-pulse" />
      <span className="min-w-0 flex-1 text-sm">
        <strong className="block font-display text-base tracking-wide uppercase">Make your Week {banner.week} picks</strong>
        <span className="text-muted-foreground">
          {banner.group} · {banner.progress}
        </span>
      </span>
      {left && (
        <span className="hidden shrink-0 text-right sm:block">
          <span className="block font-display text-[0.6rem] font-bold tracking-[0.2em] text-muted-foreground uppercase">Locks in</span>
          <span className="led text-xl leading-none">{left}</span>
        </span>
      )}
      <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-3 py-2 font-display text-sm font-extrabold tracking-wide text-primary-foreground uppercase">
        Pick
        <ArrowRight className="size-4" aria-hidden="true" />
      </span>
    </Link>
  );
}
