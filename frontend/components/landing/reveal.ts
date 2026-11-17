import type { CSSProperties } from "react";

// A plain module, not "use client": the server-rendered sections spread this,
// and a server component importing from a client module gets a reference, not the function.

/** Spread on an element to rise it in as it scrolls into view; `i` steps it into a stagger. */
export const reveal = (i = 0) => ({ "data-reveal": "", style: { "--reveal-delay": `${i * 90}ms` } as CSSProperties });

/** An animation delay for the art inside a revealed block. */
export const delay = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;
