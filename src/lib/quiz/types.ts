/**
 * Shared quiz domain types plus the deterministic auto-grader.
 * Client-safe: no server-only imports.
 */

export type QuestionType =
  "mcq" | "multi_select" | "true_false" | "fill_blank" | "short_answer" | "essay";

export type Difficulty = "easy" | "medium" | "hard";

export type QuizKind = "practice" | "timed" | "scheduled" | "exam";

export type AttemptStatus = "in_progress" | "submitted" | "graded" | "locked" | "expired";

export const QUESTION_TYPES: { value: QuestionType; label: string; auto: boolean }[] = [
  { value: "mcq", label: "Multiple choice", auto: true },
  { value: "multi_select", label: "Multiple correct", auto: true },
  { value: "true_false", label: "True / False", auto: true },
  { value: "fill_blank", label: "Fill in the blank", auto: true },
  { value: "short_answer", label: "Short answer", auto: false },
  { value: "essay", label: "Essay", auto: false },
];

export const TYPE_LABEL: Record<QuestionType, string> = Object.fromEntries(
  QUESTION_TYPES.map((t) => [t.value, t.label]),
) as Record<QuestionType, string>;

export const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

export const KIND_LABEL: Record<QuizKind, string> = {
  practice: "Practice",
  timed: "Timed quiz",
  scheduled: "Scheduled quiz",
  exam: "Final exam",
};

export type QuestionDraft = {
  id: string;
  type: QuestionType;
  difficulty: Difficulty;
  prompt: string;
  options: string[];
  correct: string[];
  explanation: string;
  points: number;
};

export function isAutoGraded(type: QuestionType) {
  return type !== "short_answer" && type !== "essay";
}

let seq = 0;
export function tempId() {
  seq += 1;
  return `draft-${Date.now().toString(36)}-${seq}`;
}

export function blankQuestion(type: QuestionType = "mcq"): QuestionDraft {
  return {
    id: tempId(),
    type,
    difficulty: "medium",
    prompt: "",
    options: type === "mcq" || type === "multi_select" ? ["", "", "", ""] : [],
    correct: type === "true_false" ? ["True"] : [],
    explanation: "",
    points: 1,
  };
}

function normalise(v: string) {
  return v
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Grades one answer. Returns `null` for question types that always require a
 * human (short answer with no key, essay).
 */
export function gradeAnswer(
  question: Pick<QuestionDraft, "type" | "correct" | "points">,
  response: string[],
): { correct: boolean; points: number } | null {
  const key = (question.correct ?? []).map(normalise).filter(Boolean);
  const given = (response ?? []).map(normalise).filter(Boolean);

  if (question.type === "essay") return null;
  if (question.type === "short_answer" && key.length === 0) return null;
  if (!given.length) return { correct: false, points: 0 };

  if (question.type === "multi_select") {
    const same = key.length === given.length && key.every((k) => given.includes(k));
    return { correct: same, points: same ? question.points : 0 };
  }

  const hit = key.some((k) => given.includes(k));
  return { correct: hit, points: hit ? question.points : 0 };
}

export function percent(score: number, max: number) {
  if (!max) return 0;
  return Math.round((score / max) * 100);
}

/** Deterministic shuffle so a student always sees the same order on resume. */
export function shuffle<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    h = (Math.imul(h, 48271) + 11) % 2147483647;
    const j = Math.abs(h) % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function formatClock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m % 60)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}
