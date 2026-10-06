import { createServerFn } from "@tanstack/react-start";
import { requireFirebaseAuth } from "@/lib/firebase/auth-middleware";
import { adminDb } from "@/lib/firebase/admin";
import { correctFor, normalizeType } from "@/lib/quiz/model";
import { gradeAnswer } from "@/lib/quiz/types";

type SubmitInput = {
  attemptId: string;
  /** Latest answers from the browser; merged over what autosave already stored. */
  answers?: Record<string, string[]>;
  lockedReason?: string;
};

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x));
  if (v === undefined || v === null || v === "") return [];
  return [String(v)];
}

/**
 * Grades an attempt on the server. Auto-gradable answers are scored immediately; anything
 * that needs a human (essay, short answer with no key) leaves the submission "submitted"
 * so it shows up in the teacher's review queue.
 */
export const submitQuizAttempt = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((input: SubmitInput) => {
    if (!input || typeof input.attemptId !== "string" || !input.attemptId) {
      throw new Error("Attempt is required.");
    }
    const answers: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(input.answers ?? {})) {
      answers[String(k)] = asStringArray(v).map((s) => s.slice(0, 10_000));
    }
    return {
      attemptId: input.attemptId,
      answers,
      lockedReason: input.lockedReason ? String(input.lockedReason).slice(0, 200) : undefined,
    };
  })
  .handler(async ({ data, context }) => {
    const attemptRef = adminDb.collection("quiz_attempts").doc(data.attemptId);
    const attemptSnap = await attemptRef.get();
    const attempt = attemptSnap.data();
    if (!attemptSnap.exists || attempt?.["studentId"] !== context.userId) {
      throw new Error("Attempt not found.");
    }

    // Already submitted (double click, auto-submit racing a manual one): return the same result.
    if (attempt["status"] !== "in_progress") {
      const prior = await adminDb.collection("submissions").doc(String(attempt["submissionId"])).get();
      const p = prior.data();
      return {
        submissionId: prior.id,
        score: Number(p?.["score"] ?? 0),
        maxScore: Number(p?.["maxScore"] ?? 0),
        percentage: p?.["maxScore"] ? Math.round((Number(p["score"] ?? 0) / Number(p["maxScore"])) * 100) : 0,
        needsManual: p?.["status"] !== "graded",
        showResults: true,
        late: false,
      };
    }

    const quizId = String(attempt["quizId"]);
    const quizRef = adminDb.collection("quizzes").doc(quizId);
    const [quizSnap, keySnap] = await Promise.all([
      quizRef.get(),
      quizRef.collection("keys").doc("answerKey").get(),
    ]);
    if (!quizSnap.exists) throw new Error("Quiz not found.");
    const quiz = quizSnap.data()!;
    const key = (keySnap.data() ?? {}) as Parameters<typeof correctFor>[0];

    const stored = (attempt["answers"] ?? {}) as Record<string, unknown>;
    const responses: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(stored)) responses[k] = asStringArray(v);
    for (const [k, v] of Object.entries(data.answers)) responses[k] = v;

    const questions = (Array.isArray(quiz["questions"]) ? quiz["questions"] : []) as Record<string, unknown>[];
    let score = 0;
    let maxScore = 0;
    let needsManual = false;
    const details: Record<string, { answer: string[]; correct: boolean | null; marks: number }> = {};

    for (const q of questions) {
      const id = String(q["id"]);
      const points = Math.max(0, Number(q["points"]) || 0);
      maxScore += points;
      const given = responses[id] ?? [];
      const result = gradeAnswer(
        { type: normalizeType(String(q["type"])), correct: correctFor(key, id), points },
        given,
      );
      if (result === null) {
        needsManual = true;
        details[id] = { answer: given, correct: null, marks: 0 };
      } else {
        score += result.points;
        details[id] = { answer: given, correct: result.correct, marks: result.points };
      }
    }

    // The clock is anchored to the server, with a small grace period for network latency.
    const limitMs = Number(quiz["timeLimit"]) > 0 ? Number(quiz["timeLimit"]) * 60_000 : null;
    const late = limitMs !== null && Date.now() - new Date(String(attempt["startedAt"])).getTime() > limitMs + 90_000;

    const studentSnap = await adminDb.collection("users").doc(context.userId).get();
    const now = new Date().toISOString();
    const submissionRef = adminDb.collection("submissions").doc();
    await submissionRef.set({
      id: submissionRef.id,
      type: "quiz",
      refId: quizId,
      classId: String(quiz["classId"]),
      studentId: context.userId,
      studentName: String(studentSnap.data()?.["name"] ?? "Student"),
      studentEmail: context.email ?? null,
      // Flat copy of the answers keeps older screens that read `answers[qid]` working.
      answers: Object.fromEntries(Object.entries(responses).map(([k, v]) => [k, v.join(", ")])),
      resultDetails: details,
      attemptNo: Number(attempt["attemptNo"]) || 1,
      attemptId: data.attemptId,
      submittedAt: now,
      status: needsManual ? "submitted" : "graded",
      score: needsManual ? null : score,
      partialScore: score,
      pointsCredited: needsManual ? 0 : score,
      maxScore,
      late,
      violations: attempt["violations"] ?? [],
      lockedReason: data.lockedReason ?? null,
      feedback: null,
      gradedBy: needsManual ? null : "auto_grader",
      gradedAt: needsManual ? null : now,
    });

    await attemptRef.update({
      status: data.lockedReason ? "locked" : "submitted",
      submissionId: submissionRef.id,
      submittedAt: now,
    });

    if (!needsManual && score > 0) {
      const leaderRef = adminDb.collection("leaderboard").doc(context.userId);
      const leaderSnap = await leaderRef.get();
      if (leaderSnap.exists) {
        const cur = leaderSnap.data()!;
        await leaderRef.update({
          score: Number(cur["score"] ?? 0) + score,
          totalSubmissions: Number(cur["totalSubmissions"] ?? 0) + 1,
          updatedAt: now,
        });
      } else {
        await leaderRef.set({
          userId: context.userId,
          userName: String(studentSnap.data()?.["name"] ?? "Student"),
          score,
          totalSubmissions: 1,
          updatedAt: now,
        });
      }
    }

    const showResults = quiz["showResults"] !== false;
    return {
      submissionId: submissionRef.id,
      score: showResults ? score : null,
      maxScore: showResults ? maxScore : null,
      percentage: showResults && maxScore ? Math.round((score / maxScore) * 100) : null,
      needsManual,
      showResults,
      late,
    };
  });
