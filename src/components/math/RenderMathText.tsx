import { Fragment, useMemo } from "react";
import { MathPreview } from "@/components/math/MathPreview";
import { cn } from "@/lib/utils";
import { MATH_PATTERN } from "@/lib/math/delimiters";

type MathTextPart = { kind: "text"; value: string } | { kind: "inline" | "block"; value: string };

function splitMathText(value: string): MathTextPart[] {
  const parts: MathTextPart[] = [];
  const pattern = new RegExp(MATH_PATTERN.source, "g");
  let cursor = 0;

  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push({ kind: "text", value: value.slice(cursor, index) });

    if (match[1] !== undefined) {
      parts.push({ kind: "block", value: match[1] });
    } else if (match[2] !== undefined) {
      parts.push({ kind: "inline", value: match[2] });
    }

    cursor = index + match[0].length;
  }

  if (cursor < value.length) parts.push({ kind: "text", value: value.slice(cursor) });
  if (parts.length === 0) return [{ kind: "text", value }];

  // A block equation already sits on its own line, so drop one newline on each side.
  return parts
    .map((part, i) => {
      if (part.kind !== "text") return part;
      let text = part.value;
      if (parts[i - 1]?.kind === "block") text = text.replace(/^\r?\n/, "");
      if (parts[i + 1]?.kind === "block") text = text.replace(/\r?\n$/, "");
      return { ...part, value: text };
    })
    .filter((part) => part.kind !== "text" || part.value !== "");
}

export function RenderMathText({ text, className }: { text: string; className?: string }) {
  const parts = useMemo(() => splitMathText(text), [text]);

  return (
    <div className={cn("whitespace-pre-wrap leading-7", className)}>
      {parts.map((part, index) => (
        <Fragment key={`${part.kind}-${index}`}>
          {part.kind === "text" ? (
            part.value
          ) : part.kind === "block" ? (
            <MathPreview latex={part.value} className="my-3" />
          ) : (
            <MathPreview latex={part.value} display={false} className="mx-0.5" />
          )}
        </Fragment>
      ))}
    </div>
  );
}
