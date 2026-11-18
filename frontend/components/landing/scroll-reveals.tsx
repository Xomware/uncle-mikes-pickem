"use client";

import { useEffect } from "react";

/**
 * Rises each [data-reveal] block in as it scrolls into view. Blocks are only
 * hidden once this has run, so without JS or under reduced motion they just show.
 */
export function ScrollReveals() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const html = document.documentElement;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.setAttribute("data-shown", "");
          io.unobserve(e.target);
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
    html.classList.add("reveals");
    document.querySelectorAll("[data-reveal]").forEach((el) => io.observe(el));
    return () => {
      io.disconnect();
      html.classList.remove("reveals");
    };
  }, []);

  return null;
}
