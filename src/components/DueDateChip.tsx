import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { daysLate } from "@/lib/assignments";

function longDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export type DueTone = "none" | "overdue" | "today" | "upcoming";

export function dueTone(due: string | null, submittedAt?: string | null): DueTone {
  if (!due) return "none";
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return "none";
  if (!submittedAt && daysLate(due) > 0) return "overdue";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return "today";
  return "upcoming";
}

const TONE: Record<DueTone, string> = {
  none: "border-border bg-muted/60 text-muted-foreground",
  overdue: "border-destructive/50 bg-destructive/15 text-destructive",
  today: "border-warning/50 bg-warning/20 text-warning-foreground dark:text-warning",
  upcoming: "border-primary/45 bg-primary/12 text-primary",
};

/**
 * Prominent, colour-coded due date chip. Overdue = danger, due today = warning,
 * anything else = primary. Meant to be one of the first things noticed on a card.
 */
export function DueDateChip({
  due,
  submittedAt,
  className,
  size = "md",
}: {
  due: string | null;
  submittedAt?: string | null;
  className?: string;
  size?: "sm" | "md";
}) {
  const tone = dueTone(due, submittedAt);
  const late = due && !submittedAt ? daysLate(due) : 0;

  const label = !due
    ? "No due date"
    : tone === "overdue"
      ? `Late by ${late} day${late === 1 ? "" : "s"} — ${longDate(due)}`
      : tone === "today"
        ? `Due today — ${longDate(due)}`
        : `Due: ${longDate(due)}`;

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-2 rounded-full border font-semibold",
        size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
        TONE[tone],
        className,
      )}
    >
      <CalendarDays
        aria-hidden
        className={cn("shrink-0", size === "sm" ? "size-4" : "size-[1.15rem]")}
        strokeWidth={2.4}
      />
      <span className="truncate">{label}</span>
    </span>
  );
}
