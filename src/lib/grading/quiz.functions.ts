import { createServerFn } from "@tanstack/react-start";
import { requireFirebaseAuth, adminDb } from "@/lib/firebase/auth-middleware";
import type { QuizAttemptForGrading, QuizGradingAnswer } from "@/lib/grading/types";

type Grade = { questionId: string; points: number; feedback: string };

async function loadAttempt(attemptId: string, userId: string, email?: string) {
  const subDoc = await adminDb.collection("submissions").doc(attemptId).get();
  if (!subDoc.exists) throw new Error("Attempt not found.");
  const sub = subDoc.data()!;

  const quizDoc = await adminDb.collection("quizzes").doc(sub.refId).get();
  if (!quizDoc.exists) throw new Error("Quiz not found.");
  const quiz = quizDoc.data()!;

  const callerDoc = await adminDb.collection("users").doc(userId).get();
  const callerData = callerDoc.data();
  const isAdmin = callerData?.role === "admin" || email === "aminpatwekar@gmail.com";
  const isTeacher = quiz.createdBy === userId || isAdmin;

  if (!isTeacher) {
    throw new Error("You are not allowed to grade this attempt.");
  }

  return { subDoc, sub, quiz };
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
    const { sub, quiz } = await loadAttempt(data.attemptId, context.userId, context.email);

    const keyDoc = await adminDb
      .collection("quizzes")
      .doc(sub.refId)
      .collection("keys")
      .doc("answerKey")
      .get();
    const keyData = keyDoc.data()?.answers || {};

    const questions = quiz.questions || [];
    const studentAnswers = sub.answers || {};

    const answers: QuizGradingAnswer[] = questions.map((q: any, i: number) => {
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
        question_id: q.id,
        answer_id: q.id,
        position: i + 1,
        type: q.type || "mcq",
        prompt: q.text || "",
        points: Number(q.points) || 10,
        response: resp ? [String(resp)] : [],
        correct: correctVal !== undefined ? [String(correctVal)] : [],
        manual: correctVal === undefined,
        is_correct: isCorrect,
        awarded_points: isCorrect ? Number(q.points) || 10 : 0,
        feedback: null,
      };
    });

    return {
      attempt: {
        id: data.attemptId,
        quiz_id: sub.refId,
        attempt_no: 1,
        status: sub.status,
        score: sub.score != null ? Number(sub.score) : null,
        max_score: 100,
        needs_manual_grading: sub.status === "submitted",
        submitted_at: sub.submittedAt || null,
      },
      student_name: sub.studentName || "Student",
      quiz_title: quiz.title || "Quiz",
      answers,
    };
  });

export const saveQuizAttemptGrade = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((input: { attemptId: string; grades: Grade[] }) => {
    if (!input?.attemptId || !Array.isArray(input.grades)) {
      throw new Error("Invalid grade payload");
    }
    return { attemptId: input.attemptId, grades: input.grades };
  })
  .handler(async ({ data, context }) => {
    const { subDoc, sub } = await loadAttempt(data.attemptId, context.userId, context.email);

    const totalScore = data.grades.reduce((sum, g) => sum + (Number(g.points) || 0), 0);
    const feedbackList = data.grades
      .filter((g) => g.feedback?.trim())
      .map((g) => g.feedback.trim())
      .join("\n");

    const now = new Date().toISOString();

    await subDoc.ref.update({
      status: "graded",
      score: totalScore,
      feedback: feedbackList || null,
      gradedBy: context.userId,
      gradedAt: now,
    });

    // Update leaderboard
    const leaderRef = adminDb.collection("leaderboard").doc(sub.studentId);
    const leaderDoc = await leaderRef.get();
    if (leaderDoc.exists) {
      const cur = leaderDoc.data()!;
      await leaderRef.update({
        score: (cur.score || 0) + totalScore,
        totalSubmissions: (cur.totalSubmissions || 0) + 1,
        updatedAt: now,
      });
    } else {
      await leaderRef.set({
        userId: sub.studentId,
        userName: sub.studentName || "Student",
        score: totalScore,
        totalSubmissions: 1,
        updatedAt: now,
      });
    }

    return { ok: true, score: totalScore };
  });
