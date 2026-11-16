"use client";

import Link from "next/link";
import type { ComponentProps } from "react";

import { useFlags } from "@/lib/flags";
import { gameHref } from "@/lib/game";

type Props = Omit<ComponentProps<typeof Link>, "href"> & { groupId: string; gameId: string };

/** A link to the game info page, or the same content as plain text while game info is turned off. */
export function GameInfoLink({ groupId, gameId, className, children, ...rest }: Props) {
  const { gameInfo } = useFlags(groupId);
  if (!gameInfo) return <span className={className}>{children}</span>;
  return (
    <Link href={gameHref(groupId, gameId)} className={className} {...rest}>
      {children}
    </Link>
  );
}
