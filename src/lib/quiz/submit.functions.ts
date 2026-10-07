import { createServerFn } from "@tanstack/react-start";
import { requireFirebaseAuth } from "@/lib/firebase/auth-middleware";
import { adminDb } from "@/lib/firebase/admin";

type SubmitQuizInput = {
  quizId: string;
  answers: Record<string, string>;
  submittedAt?: string;
  tabSwitchViolations?: number;
  lockedOut?: boolean;
  lockReason?: string;
};

function normalize(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export const submitQuizAttempt = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((input: SubmitQuizInput) => {
    if (!input || typeof input.quizId !== "string" || !input.quizId.trim()) {
      throw new Error("Quiz is required.");
    }
    if (!input.answers || typeof input.answers !== "object" || Array.isArray(input.answers)) {
      throw new Error("Quiz answers are required.");
    }
    return {
      quizId: input.quizId.trim(),
      answers: Object.fromEntries(
        Object.entries(input.answers).map(([key, value]) => [String(key), String(value ?? "")]),
      ),
      submittedAt: input.submittedAt ? String(input.submittedAt) : new Date().toISOString(),
      tabSwitchViolations: Number(input.tabSwitchViolations || 0),
      lockedOut: Boolean(input.lockedOut),
      lockReason: input.lockReason ? String(input.lockReason) : undefined,
    };
  })
  .handler(async ({ data, context }) => {
    const quizRef = adminDb.collection("quizzes").doc(data.quizId);
    const quizSnap = await quizRef.get();
    if (!quizSnap.exists) throw new Error("Quiz not found.");

    const quiz = quizSnap.data()!;
    const classId = String(quiz.classId ?? "");
    const classSnap = await adminDb.collection("classes").doc(classId).get();
    if (!classSnap.exists) throw new Error("Class not found.");

    const classData = classSnap.data()!;
    const studentIds = Array.isArray(classData.studentIds) ? classData.studentIds : [];
    if (!studentIds.includes(context.userId)) {
      throw new Error("You are not enrolled in this class.");
    }

    const existing = await adminDb
      .collection("submissions")
      .where("refId", "==", data.quizId)
      .where("studentId", "==", context.userId)
      .limit(1)
      .get();
    if (!existing.empty) throw new Error("You have already submitted this quiz.");

    const keySnap = await quizRef.collection("keys").doc("answerKey").get();
    if (!keySnap.exists) throw new Error("This quiz is not ready for submission.");
    const keyData = keySnap.data()!;
    const answerKey = (keyData.answers ?? {}) as Record<string, unknown>;

    const questions = Array.isArray(quiz.questions) ? quiz.questions : [];
    let score = 0;
    let maxScore = 0;
    const results: Record<string, { answer: string; correct: boolean; marks: number }> = {};

    for (const question of questions) {
      const id = String(question.id ?? "");
      const points = Number(question.points ?? 0);
      maxScore += Number.isFinite(points) ? Math.max(0, points) : 0;
      const answer = String(data.answers[id] ?? "");
      const expected = answerKey[id];
      const correct = normalize(answer) !== "" && normalize(answer) === normalize(expected);
      const marks = correct ? Math.max(0, points) : 0;
      score += marks;
      results[id] = { answer, correct, marks };
    }

    const submissionRef = adminDb.collection("submissions").doc();
    await submissionRef.set({
      id: submissionRef.id,
      type: "quiz",
      refId: data.quizId,
      classId,
      studentId: context.userId,
      studentName: String(
        (await adminDb.collection("users").doc(context.userId).get()).data()?.name ?? "Student",
      ),
      studentEmail: context.email ?? null,
      answers: data.answers,
      resultDetails: results,
      tabSwitchViolations: data.tabSwitchViolations || 0,
      lockedOut: data.lockedOut || false,
      lockReason: data.lockReason || null,
      submittedAt: data.submittedAt,
      status: "graded",
      score,
      maxScore,
      feedback: data.lockedOut
        ? `Automatic submission triggered: ${data.lockReason || "Student switched tabs or left exam window during locked final exam."}`
        : null,
      gradedBy: "system",
      gradedAt: new Date().toISOString(),
    });

    return {
      submissionId: submissionRef.id,
      score,
      maxScore,
      percentage: maxScore ? Math.round((score / maxScore) * 100) : 0,
      lockedOut: data.lockedOut,
      violations: data.tabSwitchViolations,
    };
  });
