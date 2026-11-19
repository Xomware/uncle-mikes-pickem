interface WordmarkProps {
  /** The hero's is the page heading; the intro's copy is decoration. */
  as?: "h1" | "div";
}

/** The primary logo at hero size. */
export function Wordmark({ as: Tag = "h1" }: WordmarkProps) {
  return (
    <Tag className="flex justify-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- static export, no image optimizer */}
      <img
        src="/brand/logo.webp"
        alt="Uncle Mike's Pick Em"
        width={1280}
        height={924}
        fetchPriority="high"
        className="hero-paint h-auto w-[min(88vw,36rem)] drop-shadow-[0_0_28px_oklch(0.85_0.17_95/0.35)]"
      />
    </Tag>
  );
}
