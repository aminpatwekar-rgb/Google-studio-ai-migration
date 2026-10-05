export type SubmissionStatus =
  "not_started" | "in_progress" | "submitted" | "late" | "reviewed" | "returned" | "completed";

export const STATUS_LABEL: Record<SubmissionStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  submitted: "Submitted",
  late: "Late",
  reviewed: "Reviewed",
  returned: "Returned",
  completed: "Completed",
};

// green = complete, yellow = pending, red = late, blue = under review
export const STATUS_TONE: Record<SubmissionStatus, string> = {
  not_started: "bg-muted text-muted-foreground border-border",
  in_progress: "bg-warning/15 text-warning-foreground border-warning/40 dark:text-warning",
  submitted: "bg-info/15 text-info border-info/40",
  late: "bg-destructive/15 text-destructive border-destructive/40",
  reviewed: "bg-info/15 text-info border-info/40",
  returned: "bg-warning/15 text-warning-foreground border-warning/40 dark:text-warning",
  completed: "bg-success/15 text-success border-success/40",
};

export function daysLate(due: string | null, at?: string | null) {
  if (!due) return 0;
  const end = at ? new Date(at) : new Date();
  const diff = end.getTime() - new Date(due).getTime();
  return diff <= 0 ? 0 : Math.ceil(diff / 86_400_000);
}

export function formatDue(due: string | null) {
  if (!due) return "No due date";
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return "No due date";
  const sameYear = d.getFullYear() === new Date().getFullYear();
  // Rendered in the viewer's local time zone; stored values are UTC ISO strings.
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "Late by 3 days" / "Due in 2 days" style helper for badges. */
export function dueStatusLabel(due: string | null, submittedAt?: string | null) {
  if (!due) return null;
  const late = daysLate(due, submittedAt ?? null);
  if (late > 0) return `Late by ${late} day${late === 1 ? "" : "s"}`;
  if (submittedAt) return "On time";
  const ms = new Date(due).getTime() - Date.now();
  const days = Math.ceil(ms / 86_400_000);
  if (days <= 0) return "Due today";
  return `Due in ${days} day${days === 1 ? "" : "s"}`;
}

/**
 * Statuses that count as "the student is done with it". Shared by the
 * dashboard and the assignments list so both always agree on the numbers.
 */
export const DONE_STATUSES: SubmissionStatus[] = ["submitted", "reviewed", "completed", "late"];

export type AssignmentBucket = "upcoming" | "overdue" | "done";

/** Single source of truth for which tab an assignment belongs to. */
export function bucketOf(due: string | null, status: SubmissionStatus): AssignmentBucket {
  if (DONE_STATUSES.includes(status)) return "done";
  return daysLate(due) > 0 ? "overdue" : "upcoming";
}

export function makeJoinCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}
