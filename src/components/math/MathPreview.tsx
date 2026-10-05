import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import "katex/contrib/mhchem";
import { cn } from "@/lib/utils";

export function MathPreview({
  latex,
  display = true,
  className,
}: {
  latex: string;
  display?: boolean;
  className?: string;
}) {
  const result = useMemo(() => {
    try {
      return {
        ok: true,
        value: katex.renderToString(latex || "\\;", {
          displayMode: display,
          throwOnError: false,
          strict: false,
          trust: false,
        }),
      };
    } catch (e) {
      return { ok: false, value: e instanceof Error ? e.message : "Invalid expression" };
    }
  }, [latex, display]);

  if (!result.ok) {
    return <span className={cn("text-sm text-destructive", className)}>{result.value}</span>;
  }
  // KaTeX output is generated locally from the user's own LaTeX with trust disabled.
  if (!display) {
    return <span className={className} dangerouslySetInnerHTML={{ __html: result.value }} />;
  }
  return (
    <div
      className={cn("overflow-x-auto overflow-y-hidden", className)}
      dangerouslySetInnerHTML={{ __html: result.value }}
    />
  );
}
