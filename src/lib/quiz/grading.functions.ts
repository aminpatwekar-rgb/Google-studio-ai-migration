import { createServerFn } from "@tanstack/react-start";
import { requireFirebaseAuth, adminDb } from "@/lib/firebase/auth-middleware";

export const finalizeQuizAttempt = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((input: { attemptId: string }) => {
    if (!input?.attemptId || typeof input.attemptId !== "string") {
      throw new Error("A valid submission id is required");
    }
    return { attemptId: input.attemptId };
  })
  .handler(async ({ data, context }) => {
    const subRef = adminDb.collection("submissions").doc(data.attemptId);
    const subDoc = await subRef.get();
    if (!subDoc.exists) throw new Error("Submission not found");

    const sub = subDoc.data()!;
    if (sub.studentId !== context.userId) throw new Error("Forbidden: Not your submission");

    if (sub.status === "graded") {
      return {
        score: Number(sub.score || 0),
        max: 100,
        needsManual: false,
        badges: [] as string[],
      };
    }

    const quizDoc = await adminDb.collection("quizzes").doc(sub.refId).get();
    if (!quizDoc.exists) throw new Error("Quiz not found");
    const quiz = quizDoc.data()!;

    // Load answer key from teacher-only subcollection
    const keyDoc = await adminDb
      .collection("quizzes")
      .doc(sub.refId)
      .collection("keys")
      .doc("answerKey")
      .get();
    const keyData = keyDoc.data()?.answers || {};

    let totalScore = 0;
    let maxScore = 0;
    let needsManual = false;

    const questions = quiz.questions || [];
    const studentAnswers = sub.answers || {};

    for (const q of questions) {
      const pts = Number(q.points) || 10;
      maxScore += pts;
      const expected = keyData[q.id];
      const given = studentAnswers[q.id];

      if (expected !== undefined) {
        if (
          String(expected).trim().toLowerCase() ===
          String(given || "")
            .trim()
            .toLowerCase()
        ) {
          totalScore += pts;
        }
      } else {
        // Open-ended or subjective question
        needsManual = true;
      }
    }

    const now = new Date().toISOString();
    const newStatus = needsManual ? "submitted" : "graded";

    await subRef.update({
      status: newStatus,
      score: needsManual ? null : totalScore,
      gradedAt: needsManual ? null : now,
      gradedBy: needsManual ? null : "auto_grader",
    });

    // Update leaderboard if graded
    if (!needsManual) {
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
    }

    return {
      score: totalScore,
      max: maxScore,
      needsManual,
      badges: totalScore > 0 && totalScore === maxScore ? ["perfect_quiz"] : [],
    };
  });
