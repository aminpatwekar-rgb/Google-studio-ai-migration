import { createServerFn } from "@tanstack/react-start";
import { requireFirebaseAuth } from "@/lib/firebase/auth-middleware";
import { adminDb } from "@/lib/firebase/admin";
import { correctFor, normalizeType } from "@/lib/quiz/model";
import type { QuizAttemptForGrading, QuizGradingAnswer } from "@/lib/grading/types";

type Grade = { questionId: string; points: number; feedback: string };

type Detail = {
  answer?: string[] | string;
  correct?: boolean | null;
  marks?: number;
  feedback?: string | null;
};

async function loadAttempt(attemptId: string, userId: string) {
  const subDoc = await adminDb.collection("submissions").doc(attemptId).get();
  if (!subDoc.exists) throw new Error("Attempt not found.");
  const sub = subDoc.data()!;
  if (sub["type"] && sub["type"] !== "quiz") throw new Error("This is not a quiz attempt.");

  const quizDoc = await adminDb.collection("quizzes").doc(String(sub["refId"])).get();
  if (!quizDoc.exists) throw new Error("Quiz not found.");
  const quiz = quizDoc.data()!;

  const callerDoc = await adminDb.collection("users").doc(userId).get();
  const isAdmin = callerDoc.data()?.["role"] === "admin";
  if (quiz["createdBy"] !== userId && !isAdmin) {
    throw new Error("You are not allowed to grade this attempt.");
  }

  const keyDoc = await quizDoc.ref.collection("keys").doc("answerKey").get();
  const key = (keyDoc.data() ?? {}) as Parameters<typeof correctFor>[0];
  return { subDoc, sub, quiz, key };
}

/** Essays and short answers with no answer key can only be marked by a person. */
function needsHandMarking(type: string, correct: string[]) {
  const t = normalizeType(type);
  return t === "essay" || (t === "short_answer" && correct.length === 0);
}

export const getQuizAttemptForGrading = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .validator((input: { attemptId: string }) => {
    if (!input?.attemptId || typeof input.attemptId !== "string") {
      throw new Error("A valid attempt id is required");
    }
    return { attemptId: input.attemptId };
  })
  .handler(async ({ data, context }): Promise<QuizAttemptForGrading> => {
    const { sub, quiz, key } = await loadAttempt(data.attemptId, context.userId);
    const questions = (quiz["questions"] ?? []) as Record<string, unknown>[];
    const details = (sub["resultDetails"] ?? {}) as Record<string, Detail>;
    const flat = (sub["answers"] ?? {}) as Record<string, unknown>;

    let maxScore = 0;
    const answers: QuizGradingAnswer[] = questions.map((q, i) => {
      const id = String(q["id"]);
      const points = Number(q["points"]) || 0;
      maxScore += points;
      const correct = correctFor(key, id);
      const detail = details[id];
      const raw = detail?.answer ?? flat[id];
      const response = Array.isArray(raw) ? raw.map(String) : raw ? [String(raw)] : [];
      const manual = needsHandMarking(String(q["type"]), correct);
      const marked = detail && detail.correct !== null && detail.correct !== undefined;
      const hasHandMarks = manual && detail?.marks !== undefined && detail.correct !== null;
      return {
        question_id: id,
        // Non-null when there is something to mark (an answer was given, or marks already saved).
        answer_id: response.length || hasHandMarks ? id : null,
        position: i + 1,
        type: normalizeType(String(q["type"])),
        prompt: String(q["prompt"] ?? q["text"] ?? ""),
        points,
        response,
        correct,
        manual,
        is_correct: marked ? Boolean(detail.correct) : null,
        awarded_points: marked ? Number(detail.marks) || 0 : null,
        feedback: detail?.feedback ?? null,
      };
    });

    return {
      attempt: {
        id: data.attemptId,
        quiz_id: String(sub["refId"]),
        attempt_no: Number(sub["attemptNo"]) || 1,
        status: String(sub["status"]),
        score: sub["score"] != null ? Number(sub["score"]) : null,
        max_score: sub["maxScore"] != null ? Number(sub["maxScore"]) : maxScore,
        needs_manual_grading: sub["status"] === "submitted",
        submitted_at: sub["submittedAt"] ? String(sub["submittedAt"]) : null,
      },
      student_name: String(sub["studentName"] ?? "Student"),
      quiz_title: String(quiz["title"] ?? "Quiz"),
      answers,
    };
  });

export const saveQuizAttemptGrade = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((input: { attemptId: string; grades: Grade[] }) => {
    if (!input?.attemptId || typeof input.attemptId !== "string") {
      throw new Error("A valid attempt id is required");
    }
    if (!Array.isArray(input.grades) || input.grades.length === 0 || input.grades.length > 200) {
      throw new Error("Grades are required");
    }
    const grades = input.grades.map((g) => {
      const points = Number(g?.points);
      if (!g || typeof g.questionId !== "string" || !Number.isFinite(points) || points < 0) {
        throw new Error("Each grade needs a question and a non-negative number of marks");
      }
      return {
        questionId: g.questionId,
        points,
        feedback: typeof g.feedback === "string" ? g.feedback.trim().slice(0, 2000) : "",
      };
    });
    return { attemptId: input.attemptId, grades };
  })
  .handler(async ({ data, context }) => {
    const { subDoc, sub, quiz, key } = await loadAttempt(data.attemptId, context.userId);
    if (sub["status"] !== "submitted" && sub["status"] !== "graded") {
      throw new Error("This attempt has not been submitted yet.");
    }

    const questions = (quiz["questions"] ?? []) as Record<string, unknown>[];
    const byId = new Map(questions.map((q) => [String(q["id"]), q]));
    const details = { ...((sub["resultDetails"] ?? {}) as Record<string, Detail>) };
    const flat = (sub["answers"] ?? {}) as Record<string, unknown>;

    // Only hand-marked questions can change here; automatic marks stay as the platform set them.
    for (const g of data.grades) {
      const q = byId.get(g.questionId);
      if (!q) throw new Error("A question in this grade does not belong to the quiz.");
      if (!needsHandMarking(String(q["type"]), correctFor(key, g.questionId))) {
        throw new Error("Only written answers can be marked by hand.");
      }
      const max = Number(q["points"]) || 0;
      if (g.points > max) throw new Error(`Marks cannot be more than ${max} for a question.`);
      const prev = details[g.questionId];
      const raw = prev?.answer ?? flat[g.questionId];
      details[g.questionId] = {
        answer: Array.isArray(raw) ? raw.map(String) : raw ? [String(raw)] : [],
        correct: g.points >= max && max > 0,
        marks: g.points,
        feedback: g.feedback || null,
      };
    }

    // Re-total from stored marks so the score never depends on what the browser sends.
    let score = 0;
    let max = 0;
    let stillManual = false;
    for (const q of questions) {
      const id = String(q["id"]);
      max += Number(q["points"]) || 0;
      const d = details[id];
      const marked = d && d.correct !== null && d.correct !== undefined;
      if (marked) score += Number(d.marks) || 0;
      const answered =
        (Array.isArray(d?.answer) ? d.answer.length > 0 : Boolean(d?.answer)) ||
        data.grades.some((g) => g.questionId === id);
      if (needsHandMarking(String(q["type"]), correctFor(key, id)) && answered && !marked) {
        stillManual = true;
      }
    }

    const now = new Date().toISOString();
    const finished = !stillManual;
    const feedback =
      data.grades
        .filter((g) => g.feedback)
        .map((g) => g.feedback)
        .join("\n") ||
      (sub["feedback"] as string | null) ||
      null;

    await subDoc.ref.update({
      resultDetails: details,
      status: finished ? "graded" : "submitted",
      score: finished ? score : null,
      partialScore: score,
      maxScore: max,
      feedback,
      gradedBy: finished ? context.userId : null,
      gradedAt: finished ? now : null,
    });

    // Leaderboard: credit only what hasn't been credited yet, so re-marking never double counts.
    if (finished) {
      const credited = Number(sub["pointsCredited"] ?? (sub["gradedBy"] === "auto_grader" ? sub["score"] : 0)) || 0;
      const delta = score - credited;
      const firstTime = sub["pointsCredited"] === undefined && sub["status"] !== "graded";
      const leaderRef = adminDb.collection("leaderboard").doc(String(sub["studentId"]));
      const leaderDoc = await leaderRef.get();
      if (leaderDoc.exists) {
        const cur = leaderDoc.data()!;
        await leaderRef.update({
          score: Number(cur["score"] ?? 0) + delta,
          totalSubmissions: Number(cur["totalSubmissions"] ?? 0) + (firstTime ? 1 : 0),
          updatedAt: now,
        });
      } else {
        await leaderRef.set({
          userId: sub["studentId"],
          userName: String(sub["studentName"] ?? "Student"),
          score: Math.max(0, score),
          totalSubmissions: 1,
          updatedAt: now,
        });
      }
      await subDoc.ref.update({ pointsCredited: score });
    }

    return { ok: true as const, score, max, finished };
  });
