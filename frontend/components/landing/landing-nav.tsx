"use client";

import { Menu, X } from "lucide-react";
import { useRef, useState, useSyncExternalStore, type MouseEvent } from "react";

import { Brand } from "@/components/brand";
import { LandingCta } from "@/components/landing/landing-cta";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { href: "#how", label: "How it works" },
  { href: "#standings", label: "Standings" },
  { href: "#sudden-death", label: "Sudden Death" },
  { href: "#features", label: "Features" },
  { href: "#faq", label: "FAQ" },
];

const FOCUS = "outline-none focus-visible:ring-3 focus-visible:ring-ring/60";

const subscribe = (onChange: () => void) => {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
};
const scrolled = () => window.scrollY > 24;

/** Clear over the end zone at the top, a solid press-box strip once the page scrolls. A sheet holds the links on phones. */
export function LandingNav() {
  const solid = useSyncExternalStore(subscribe, scrolled, () => false);
  const [open, setOpen] = useState(false);
  const sheet = useRef<HTMLDialogElement>(null);

  const show = (e: MouseEvent<HTMLButtonElement>) => {
    // Safari doesn't focus a clicked button, and the dialog hands focus back to whatever had it.
    e.currentTarget.focus();
    sheet.current?.showModal();
    setOpen(true);
  };
  const close = () => sheet.current?.close();

  return (
    <header
      className={cn(
        "sticky top-0 z-30 -mb-16 h-16 border-b border-transparent transition-[background-color,border-color,box-shadow] duration-300",
        solid && "border-border bg-card/92 shadow-[0_10px_24px_-14px_oklch(0.1_0.03_160/0.9)] backdrop-blur-md",
      )}
    >
      <div className="mx-auto flex h-full max-w-6xl items-center gap-2 px-3 sm:px-6">
        <Brand href="/" className="mr-auto" />
        <nav aria-label="Sections" className="hidden items-center lg:flex">
          {SECTIONS.map((s) => (
            <a
              key={s.href}
              href={s.href}
              className={cn(
                "relative flex h-11 items-center px-3 font-display text-base font-bold tracking-wider whitespace-nowrap text-chalk/85 uppercase hover:text-chalk",
                // The yellow first-down line slides out under the hovered link.
                "after:absolute after:inset-x-3 after:bottom-1.5 after:h-[3px] after:origin-left after:scale-x-0 after:bg-primary after:transition-transform after:duration-200 hover:after:scale-x-100",
                FOCUS,
              )}
            >
              {s.label}
            </a>
          ))}
        </nav>
        <LandingCta compact />
        <button
          type="button"
          onClick={show}
          aria-label="Open menu"
          aria-expanded={open}
          aria-haspopup="dialog"
          className={cn("flex size-11 items-center justify-center rounded-md text-chalk hover:bg-chalk/10 active:bg-chalk/15 lg:hidden", FOCUS)}
        >
          <Menu aria-hidden="true" />
        </button>
      </div>

      <dialog
        ref={sheet}
        aria-label="Menu"
        onClose={() => setOpen(false)}
        // A click on the dialog itself, not its panel, is a click on the backdrop.
        onClick={(e) => e.target === e.currentTarget && close()}
        className="endzone m-0 ml-auto h-dvh max-h-none w-[min(20rem,86vw)] border-l-4 border-l-primary p-0 text-foreground backdrop:bg-board/75 backdrop:backdrop-blur-sm"
      >
        <div className="flex h-full flex-col gap-6 p-4">
          <div className="flex items-center justify-between">
            <span className="chalk text-sm tracking-[0.3em]">Menu</span>
            <button
              type="button"
              onClick={close}
              aria-label="Close menu"
              className={cn("flex size-11 items-center justify-center rounded-md text-chalk hover:bg-chalk/10", FOCUS)}
            >
              <X aria-hidden="true" />
            </button>
          </div>
          <nav aria-label="Sections">
            <ul className="flex flex-col">
              {SECTIONS.map((s, i) => (
                <li key={s.href} className="border-b-2 border-chalk/40">
                  <a
                    href={s.href}
                    onClick={close}
                    className={cn("flex min-h-14 items-center gap-4 rounded-sm px-1 hover:bg-chalk/10", FOCUS)}
                  >
                    <span aria-hidden="true" className="w-8 font-stencil text-2xl font-black text-primary">
                      {(i + 1) * 10}
                    </span>
                    <span className="font-display text-2xl font-extrabold tracking-wide uppercase">{s.label}</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="mt-auto [&_button]:w-full [&_a]:w-full">
            <LandingCta />
          </div>
        </div>
      </dialog>
    </header>
  );
}
