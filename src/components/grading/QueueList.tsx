import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { initialsOf } from "@/lib/grading/types";

export type QueueEntry = {
  id: string;
  name: string;
  /** Second line, e.g. "Submitted 2 h ago". */
  detail?: string;
  /** Right-hand badge text, e.g. "18/20" or "To grade". */
  badge?: ReactNode;
  tone?: "waiting" | "done" | "warn" | "muted";
  flag?: ReactNode;
};

const TONE: Record<NonNullable<QueueEntry["tone"]>, string> = {
  waiting: "bg-info/15 text-info border-info/30",
  done: "bg-success/15 text-success border-success/30",
  warn: "bg-warning/15 text-warning-foreground border-warning/40 dark:text-warning",
  muted: "bg-muted text-muted-foreground border-border",
};

/** A selectable list of students, used by both grading workspaces. */
export function QueueList({
  entries,
  selectedId,
  onSelect,
  empty,
}: {
  entries: QueueEntry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  empty: string;
}) {
  if (entries.length === 0) {
    return <p className="px-3 py-8 text-center text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <ul className="space-y-1" role="listbox" aria-label="Students">
      {entries.map((e) => {
        const active = e.id === selectedId;
        return (
          <li key={e.id} role="option" aria-selected={active}>
            <button
              type="button"
              onClick={() => onSelect(e.id)}
              className={cn(
                "flex w-full cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                active ? "border-primary/40 bg-primary/10" : "border-transparent hover:bg-muted/70",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {initialsOf(e.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium text-foreground">{e.name}</span>
                  {e.flag}
                </span>
                {e.detail && (
                  <span className="block truncate text-xs text-muted-foreground">{e.detail}</span>
                )}
              </span>
              {e.badge != null && (
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums",
                    TONE[e.tone ?? "muted"],
                  )}
                >
                  {e.badge}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
