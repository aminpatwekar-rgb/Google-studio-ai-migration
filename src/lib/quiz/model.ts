/**
 * Bridges the editor's rich question drafts (R1 model) and what is stored in Firestore.
 * Public question data lives on the quiz doc; correct answers + explanations live in the
 * private answer-key doc so students can never read them.
 */
import type { Quiz, QuizAnswerKey, QuizQuestion, StoredQuestionType } from "@/lib/firebase/models";
import type { Difficulty, QuestionDraft, QuestionType } from "@/lib/quiz/types";

const LEGACY: Record<string, QuestionType> = {
  multiple_choice: "mcq",
  single_choice: "mcq",
  math_equation: "short_answer",
  text: "short_answer",
};

export function normalizeType(t: StoredQuestionType | string): QuestionType {
  return (LEGACY[t] ?? t) as QuestionType;
}

export function questionPrompt(q: QuizQuestion) {
  return q.prompt ?? q.text ?? "";
}

/** Accepted answers for one question, from either the new or the legacy key shape. */
export function correctFor(key: Partial<QuizAnswerKey> | undefined, id: string): string[] {
  const rich = key?.correct?.[id];
  if (Array.isArray(rich)) return rich.map(String);
  const legacy = key?.answers?.[id];
  return legacy === undefined || legacy === null || legacy === "" ? [] : [String(legacy)];
}

export function toDrafts(quiz: Quiz, key?: Partial<QuizAnswerKey>): QuestionDraft[] {
  return (quiz.questions ?? []).map((q) => ({
    id: q.id,
    type: normalizeType(q.type),
    difficulty: (q.difficulty ?? "medium") as Difficulty,
    prompt: questionPrompt(q),
    options: Array.isArray(q.options) ? q.options.map(String) : [],
    correct: correctFor(key, q.id),
    explanation: key?.explanations?.[q.id] ?? "",
    points: Number(q.points) || 1,
  }));
}

export function fromDrafts(drafts: QuestionDraft[]) {
  const questions: QuizQuestion[] = [];
  const answers: Record<string, string> = {};
  const correct: Record<string, string[]> = {};
  const explanations: Record<string, string> = {};

  drafts.forEach((d, index) => {
    // Draft ids look like "draft-…"; give new questions a stable permanent id on save.
    const id = d.id.startsWith("draft-") ? `q${Date.now().toString(36)}${index}` : d.id;
    const prompt = d.prompt.trim();
    questions.push({
      id,
      type: d.type,
      text: prompt,
      prompt,
      options: d.options.map((o) => o.trim()).filter((o, i) => o || d.type === "mcq" || i < 2),
      points: Number(d.points) > 0 ? Number(d.points) : 1,
      difficulty: d.difficulty,
    });
    const keys = d.correct.map((c) => c.trim()).filter(Boolean);
    correct[id] = keys;
    answers[id] = keys[0] ?? "";
    if (d.explanation.trim()) explanations[id] = d.explanation.trim();
  });

  return { questions, answers, correct, explanations };
}
