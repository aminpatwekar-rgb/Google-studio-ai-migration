import { createServerFn } from "@tanstack/react-start";
import { requireFirebaseAuth } from "@/lib/firebase/auth-middleware";
import { adminDb } from "@/lib/firebase/admin";
import { correctFor, normalizeType } from "@/lib/quiz/model";

export type QuizReviewAttempt = {
  id: string;
  student_id: string;
  attempt_no: number;
  status: string;
  score: number | null;
  max_score: number | null;
  submitted_at: string | null;
  started_at: string;
};

export type QuizReviewResult = {
  attempts: QuizReviewAttempt[];
  names: Record<string, string>;
};

async function assertCanReview(userId: string, email: string | undefined, quizCreator: unknown) {
  const callerDoc = await adminDb.collection("users").doc(userId).get();
  const isAdmin = callerDoc.data()?.["role"] === "admin";
  if (quizCreator !== userId && !isAdmin) {
    throw new Error("You are not allowed to review this quiz.");
  }
}

export const getQuizReviewAttempts = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .validator((input: { quizId: string }) => {
    if (!input?.quizId || typeof input.quizId !== "string") {
      throw new Error("A valid quiz id is required");
    }
    return { quizId: input.quizId };
  })
  .handler(async ({ data, context }) => {
    const quizDoc = await adminDb.collection("quizzes").doc(data.quizId).get();
    if (!quizDoc.exists) throw new Error("Quiz not found.");
    await assertCanReview(context.userId, context.email, quizDoc.data()?.["createdBy"]);

    const [subDocs, liveDocs] = await Promise.all([
      adminDb.collection("submissions").where("refId", "==", data.quizId).get(),
      adminDb
        .collection("quiz_attempts")
        .where("quizId", "==", data.quizId)
        .where("status", "==", "in_progress")
        .get(),
    ]);

    const attempts: QuizReviewAttempt[] = [];
    const names: Record<string, string> = {};
    const studentIds = new Set<string>();

    subDocs.forEach((d) => {
      const s = d.data();
      if (s["type"] && s["type"] !== "quiz") return;
      studentIds.add(String(s["studentId"]));
      attempts.push({
        id: d.id,
        student_id: String(s["studentId"]),
        attempt_no: Number(s["attemptNo"]) || 1,
        status: String(s["status"]),
        score: s["score"] != null ? Number(s["score"]) : null,
        max_score: s["maxScore"] != null ? Number(s["maxScore"]) : null,
        submitted_at: s["submittedAt"] ? String(s["submittedAt"]) : null,
        started_at: String(s["submittedAt"] ?? new Date().toISOString()),
      });
      if (s["studentName"]) names[String(s["studentId"])] = String(s["studentName"]);
    });

    liveDocs.forEach((d) => {
      const s = d.data();
      studentIds.add(String(s["studentId"]));
      attempts.push({
        id: `live:${d.id}`,
        student_id: String(s["studentId"]),
        attempt_no: Number(s["attemptNo"]) || 1,
        status: "in_progress",
        score: null,
        max_score: null,
        submitted_at: null,
        started_at: String(s["startedAt"]),
      });
    });

    // Names for students who only have an in-progress attempt.
    const missing = [...studentIds].filter((id) => !names[id]);
    await Promise.all(
      missing.map(async (id) => {
        const u = await adminDb.collection("users").doc(id).get();
        names[id] = String(u.data()?.["name"] ?? "Student");
      }),
    );

    attempts.sort((a, b) => (b.submitted_at ?? b.started_at).localeCompare(a.submitted_at ?? a.started_at));
    return { attempts, names } satisfies QuizReviewResult;
  });

export type QuizReviewAnswer = {
  id: string | null;
  question_id: string;
  position: number;
  type: string;
  prompt: string;
  points: number;
  response: string[];
  correct: string[];
  is_correct: boolean | null;
  awarded_points: number | null;
};

export type QuizReviewAttemptDetail = {
  attempt: QuizReviewAttempt;
  student_name: string;
  answers: QuizReviewAnswer[];
};

export const getQuizReviewAttempt = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .validator((input: { attemptId: string }) => {
    if (!input?.attemptId || typeof input.attemptId !== "string") {
      throw new Error("A valid attempt id is required");
    }
    return { attemptId: input.attemptId };
  })
  .handler(async ({ data, context }) => {
    const subDoc = await adminDb.collection("submissions").doc(data.attemptId).get();
    if (!subDoc.exists) {
      throw new Error("This attempt is still in progress, so there is nothing to review yet.");
    }
    const sub = subDoc.data()!;

    const quizDoc = await adminDb.collection("quizzes").doc(String(sub["refId"])).get();
    if (!quizDoc.exists) throw new Error("Quiz not found.");
    const quiz = quizDoc.data()!;
    await assertCanReview(context.userId, context.email, quiz["createdBy"]);

    const keyDoc = await adminDb
      .collection("quizzes")
      .doc(String(sub["refId"]))
      .collection("keys")
      .doc("answerKey")
      .get();
    const key = (keyDoc.data() ?? {}) as Parameters<typeof correctFor>[0];

    const questions = (quiz["questions"] ?? []) as Record<string, unknown>[];
    const details = (sub["resultDetails"] ?? {}) as Record<
      string,
      { answer?: string[] | string; correct?: boolean | null; marks?: number }
    >;
    const flat = (sub["answers"] ?? {}) as Record<string, unknown>;

    const answers: QuizReviewAnswer[] = questions.map((q, i) => {
      const id = String(q["id"]);
      const detail = details[id];
      const raw = detail?.answer ?? flat[id];
      const response = Array.isArray(raw) ? raw.map(String) : raw ? [String(raw)] : [];
      const points = Number(q["points"]) || 0;
      const graded = detail ? detail.correct : null;
      return {
        id,
        question_id: id,
        position: i,
        type: normalizeType(String(q["type"])),
        prompt: String(q["prompt"] ?? q["text"] ?? ""),
        points,
        response,
        correct: correctFor(key, id),
        is_correct: graded ?? null,
        awarded_points: detail && detail.correct !== null ? Number(detail.marks) || 0 : null,
      };
    });

    return {
      attempt: {
        id: subDoc.id,
        student_id: String(sub["studentId"]),
        attempt_no: Number(sub["attemptNo"]) || 1,
        status: String(sub["status"]),
        score: sub["score"] != null ? Number(sub["score"]) : null,
        max_score: sub["maxScore"] != null ? Number(sub["maxScore"]) : null,
        submitted_at: sub["submittedAt"] ? String(sub["submittedAt"]) : null,
        started_at: String(sub["submittedAt"] ?? new Date().toISOString()),
      },
      student_name: String(sub["studentName"] ?? "Student"),
      answers,
    } satisfies QuizReviewAttemptDetail;
  });
