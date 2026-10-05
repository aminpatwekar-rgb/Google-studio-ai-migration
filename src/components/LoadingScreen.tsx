import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

const PHRASES = ["Setting things up…", "Loading your workspace…", "Preparing academic hub…"];
const LETTERS = ["O", "N", "Y", "X"];

/**
 * Full-screen loader. Pure CSS animation (no animation library) so it paints immediately,
 * and the brand mark is drawn with CSS instead of downloading the logo image.
 */
export function LoadingScreen({ className }: { className?: string }) {
  const [phraseIndex, setPhraseIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setPhraseIndex((prev) => (prev + 1) % PHRASES.length);
    }, 1800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex min-h-screen w-full flex-col items-center justify-center bg-background px-4 select-none",
        className,
      )}
      aria-label="Loading ONYX"
      role="status"
    >
      {/* Subtle living ambient background veil */}
      <div className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center overflow-hidden">
        <div
          className="onyx-veil size-[380px] rounded-full opacity-15 blur-3xl sm:size-[480px]"
          style={{ background: "radial-gradient(circle, var(--primary) 0%, transparent 70%)" }}
        />
      </div>

      <div className="relative flex flex-col items-center gap-6">
        {/* Brand mark with orbiting conic-gradient ring */}
        <div className="relative flex items-center justify-center">
          <div
            className="onyx-spin absolute -inset-2.5 rounded-2xl opacity-75 blur-[0.5px]"
            style={{
              background:
                "conic-gradient(from 0deg, var(--primary) 0deg, transparent 180deg, var(--primary) 360deg)",
            }}
          />
          <div className="onyx-spin pointer-events-none absolute -inset-2.5 flex items-start justify-center rounded-2xl">
            <span className="size-2 -translate-y-1 rounded-full bg-primary shadow-[0_0_10px_var(--primary)]" />
          </div>
          <div className="brand-gradient relative z-10 flex size-12 items-center justify-center rounded-full text-lg font-bold text-primary-foreground shadow-md ring-2 ring-background">
            O
          </div>
        </div>

        {/* Wordmark letter-by-letter reveal */}
        <div
          className="flex items-center gap-1 text-2xl font-bold tracking-tight text-foreground"
          aria-hidden="true"
        >
          {LETTERS.map((char, index) => (
            <span
              key={char}
              className="onyx-letter"
              style={{ animationDelay: `${150 + index * 80}ms` }}
            >
              {char}
            </span>
          ))}
        </div>

        {/* Indeterminate moving progress bar */}
        <div className="relative h-1 w-36 overflow-hidden rounded-full bg-muted">
          <div className="onyx-bar brand-gradient absolute inset-y-0 w-2/5 rounded-full" />
        </div>

        {/* Rotating status line */}
        <div className="flex h-5 items-center justify-center">
          <p
            key={phraseIndex}
            className="onyx-phrase text-xs font-medium tracking-wide text-muted-foreground"
          >
            {PHRASES[phraseIndex]}
          </p>
        </div>
      </div>
    </div>
  );
}

export default LoadingScreen;
