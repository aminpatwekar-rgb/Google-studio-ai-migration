/** Shared types and small pure helpers for the Grading tab. */

export type AssignmentGroup = {
  id: string;
  title: string;
  class_id: string;
  class_name: string;
  subject: string | null;
  due_date: string | null;
  max_marks: number;
  /** Submitted and waiting for the teacher. */
  waiting: number;
  /** Subset of `waiting` that was handed in late. */
  late_waiting: number;
  /** Graded but still hidden from the student. */
  graded_unreleased: number;
  /** Graded and visible to the student. */
  released: number;
  /** Sent back to the student for changes. */
  returned: number;
  /** Students in the class. */
  roster: number;
  oldest_waiting_at: string | null;
};

export type QuizGroup = {
  id: string;
  title: string;
  class_id: string;
  class_name: string;
  kind: string;
  /** Attempts with written answers that need a teacher's marks. */
  waiting: number;
  graded: number;
  attempts: number;
  oldest_waiting_at: string | null;
};

export type WaitingItem = {
  kind: "assignment" | "quiz";
  group_id: string;
  item_id: string;
  title: string;
  class_name: string;
  student_name: string;
  submitted_at: string | null;
  is_late: boolean;
};

export type GradingOverview = {
  assignments: AssignmentGroup[];
  quizzes: QuizGroup[];
  up_next: WaitingItem[];
  stats: {
    waiting: number;
    late_waiting: number;
    ready_to_release: number;
    graded_this_week: number;
  };
};

export type AssignmentQueueRow = {
  submission_id: string;
  student_id: string;
  student_name: string;
  status: string;
  is_late: boolean;
  submitted_at: string | null;
  marks_awarded: number | null;
  grade_released: boolean;
  reviewed_at: string | null;
  paste_violation_count: number;
  mode: string;
};

export type AssignmentQueue = {
  assignment: {
    id: string;
    title: string;
    max_marks: number;
    class_name: string;
    due_date: string | null;
  };
  rows: AssignmentQueueRow[];
  missing: { student_id: string; student_name: string }[];
};

export type QuizQueueRow = {
  attempt_id: string;
  student_id: string;
  student_name: string;
  attempt_no: number;
  status: string;
  needs_manual_grading: boolean;
  score: number | null;
  max_score: number | null;
  submitted_at: string | null;
  graded_at: string | null;
};

export type QuizQueue = {
  quiz: { id: string; title: string; class_name: string; passing_marks: number };
  rows: QuizQueueRow[];
};

export type QuizGradingAnswer = {
  question_id: string;
  answer_id: string | null;
  position: number;
  type: string;
  prompt: string;
  points: number;
  response: string[];
  correct: string[];
  /** True when a teacher has to mark this answer by hand. */
  manual: boolean;
  is_correct: boolean | null;
  awarded_points: number | null;
  feedback: string | null;
};

export type QuizAttemptForGrading = {
  attempt: {
    id: string;
    quiz_id: string;
    attempt_no: number;
    status: string;
    score: number | null;
    max_score: number | null;
    needs_manual_grading: boolean;
    submitted_at: string | null;
  };
  student_name: string;
  quiz_title: string;
  answers: QuizGradingAnswer[];
};

export const WAITING_STATUSES = ["submitted", "late"] as const;
export const GRADED_STATUSES = ["reviewed", "completed"] as const;

/** "Waiting 3 days", "Waiting 5 h", "Just in". */
export function waitingLabel(since: string | null | undefined, now = Date.now()): string {
  if (!since) return "";
  const ms = now - new Date(since).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "";
  const mins = Math.floor(ms / 60_000);
  if (mins < 5) return "Just in";
  if (mins < 60) return `Waiting ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Waiting ${hours} h`;
  const days = Math.floor(hours / 24);
  return `Waiting ${days} day${days === 1 ? "" : "s"}`;
}

/** True when something has been waiting more than two days. */
export function isOverdueForGrading(since: string | null | undefined, now = Date.now()): boolean {
  if (!since) return false;
  return now - new Date(since).getTime() > 2 * 86_400_000;
}

/** Marks for the quick-fill chips (0, 50%, 75%, full), rounded to the nearest half mark. */
export function quickMarks(max: number): { label: string; value: number }[] {
  const round = (n: number) => Math.round(n * 2) / 2;
  const seen = new Set<number>();
  return [
    { label: "Full", value: max },
    { label: "75%", value: round(max * 0.75) },
    { label: "50%", value: round(max * 0.5) },
    { label: "0", value: 0 },
  ].filter((m) => (seen.has(m.value) ? false : (seen.add(m.value), true)));
}

export function percentOf(value: number | null | undefined, max: number | null | undefined) {
  if (value == null || !max) return null;
  return Math.round((value / max) * 100);
}

export function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** Id of the next row in `ids` after `currentId`, wrapping once. Null when nothing else is left. */
export function nextId(ids: string[], currentId: string | null | undefined): string | null {
  if (ids.length === 0) return null;
  const index = currentId ? ids.indexOf(currentId) : -1;
  if (index === -1) return ids[0] ?? null;
  const next = ids.filter((id) => id !== currentId);
  if (next.length === 0) return null;
  // Prefer the item that follows the current one, otherwise wrap to the start.
  return ids[index + 1] ?? next[0] ?? null;
}
