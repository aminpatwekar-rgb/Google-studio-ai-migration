import { createServerFn } from "@tanstack/react-start";
import { requireFirebaseAuth } from "@/lib/firebase/auth-middleware";
import { adminDb } from "@/lib/firebase/admin";

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
    const quiz = quizDoc.data()!;

    const callerDoc = await adminDb.collection("users").doc(context.userId).get();
    const callerData = callerDoc.data();
    const isOwner = quiz.createdBy === context.userId;
    const isAdmin = callerData?.role === "admin" || context.email === "aminpatwekar@gmail.com";

    if (!isOwner && !isAdmin) {
      throw new Error("You are not allowed to review this quiz.");
    }

    const subDocs = await adminDb.collection("submissions").where("refId", "==", data.quizId).get();

    const attempts: QuizReviewAttempt[] = [];
    const names: Record<string, string> = {};

    subDocs.forEach((d: any) => {
      const s = d.data();
      attempts.push({
        id: d.id,
        student_id: s.studentId,
        attempt_no: 1,
        status: s.status,
        score: s.score != null ? Number(s.score) : null,
        max_score: 100,
        submitted_at: s.submittedAt || null,
        started_at: s.submittedAt || new Date().toISOString(),
      });
      if (s.studentName) {
        names[s.studentId] = s.studentName;
      }
    });

    return {
      attempts,
      names,
    } satisfies QuizReviewResult;
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
    if (!subDoc.exists) throw new Error("Attempt not found.");
    const sub = subDoc.data()!;

    const quizDoc = await adminDb.collection("quizzes").doc(sub.refId).get();
    if (!quizDoc.exists) throw new Error("Quiz not found.");
    const quiz = quizDoc.data()!;

    const callerDoc = await adminDb.collection("users").doc(context.userId).get();
    const callerData = callerDoc.data();
    const isOwner = quiz.createdBy === context.userId;
    const isAdmin = callerData?.role === "admin" || context.email === "aminpatwekar@gmail.com";

    if (!isOwner && !isAdmin) {
      throw new Error("You are not allowed to review this attempt.");
    }

    const keyDoc = await adminDb
      .collection("quizzes")
      .doc(sub.refId)
      .collection("keys")
      .doc("answerKey")
      .get();
    const keyData = keyDoc.data()?.answers || {};

    const questions = quiz.questions || [];
    const studentAnswers = sub.answers || {};

    const answers: QuizReviewAnswer[] = questions.map((q: any, i: number) => {
      const resp = studentAnswers[q.id];
      const correctVal = keyData[q.id];
      const isCorrect =
        correctVal !== undefined
          ? String(correctVal).trim().toLowerCase() ===
            String(resp || "")
              .trim()
              .toLowerCase()
          : null;

      return {
        id: q.id,
        question_id: q.id,
        position: i + 1,
        type: q.type || "mcq",
        prompt: q.text || "",
        points: Number(q.points) || 10,
        response: resp ? [String(resp)] : [],
        correct: correctVal !== undefined ? [String(correctVal)] : [],
        is_correct: isCorrect,
        awarded_points: isCorrect ? Number(q.points) || 10 : 0,
      };
    });

    return {
      attempt: {
        id: subDoc.id,
        student_id: sub.studentId,
        attempt_no: 1,
        status: sub.status,
        score: sub.score != null ? Number(sub.score) : null,
        max_score: 100,
        submitted_at: sub.submittedAt || null,
        started_at: sub.submittedAt || new Date().toISOString(),
      },
      student_name: sub.studentName || "Student",
      answers,
    } satisfies QuizReviewAttemptDetail;
  });
