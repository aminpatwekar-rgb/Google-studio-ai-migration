import { createServerFn } from "@tanstack/react-start";
import { requireFirebaseAuth } from "@/lib/firebase/auth-middleware";
import { adminDb } from "@/lib/firebase/admin";
import { normalizeType } from "@/lib/quiz/model";
import { shuffle, type QuestionType } from "@/lib/quiz/types";

/**
 * Server-side quiz sessions. Questions are served from here (never the answer key), the
 * deadline is anchored to the server clock, and answers autosave so a refresh resumes.
 * Sessions live in the admin-only `quiz_attempts` collection (Firestore rules deny clients).
 */

export type TakeQuestion = {
  id: string;
  type: QuestionType;
  prompt: string;
  options: string[];
  points: number;
};

export type TakeSession = {
  attemptId: string;
  attemptNo: number;
  startedAt: string;
  serverNow: string;
  quiz: {
    id: string;
    title: string;
    description: string | null;
    timeLimitMinutes: number | null;
    maxAttempts: number;
    lockdownEnabled: boolean;
  };
  questions: TakeQuestion[];
  responses: Record<string, string[]>;
};

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x));
  if (v === undefined || v === null || v === "") return [];
  return [String(v)];
}

export const startQuizAttempt = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((input: { quizId: string }) => {
    if (!input?.quizId || typeof input.quizId !== "string") throw new Error("Quiz is required.");
    return { quizId: input.quizId };
  })
  .handler(async ({ data, context }): Promise<TakeSession> => {
    const quizSnap = await adminDb.collection("quizzes").doc(data.quizId).get();
    if (!quizSnap.exists) throw new Error("Quiz not found.");
    const quiz = quizSnap.data()!;

    if (quiz["published"] === false) throw new Error("This quiz is not open yet.");
    const now = Date.now();
    if (quiz["startAt"] && new Date(String(quiz["startAt"])).getTime() > now) {
      throw new Error("This quiz has not opened yet.");
    }
    if (quiz["endAt"] && new Date(String(quiz["endAt"])).getTime() < now) {
      throw new Error("This quiz has closed.");
    }

    const classSnap = await adminDb.collection("classes").doc(String(quiz["classId"])).get();
    const studentIds: string[] = (classSnap.data()?.["studentIds"] as string[] | undefined) ?? [];
    if (!studentIds.includes(context.userId)) throw new Error("You are not enrolled in this class.");

    const rawQuestions = (Array.isArray(quiz["questions"]) ? quiz["questions"] : []) as Record<
      string,
      unknown
    >[];
    if (!rawQuestions.length) throw new Error("This quiz has no questions yet.");

    const maxAttempts = Math.max(1, Number(quiz["maxAttempts"]) || 1);
    const timeLimit = Number(quiz["timeLimit"]) > 0 ? Number(quiz["timeLimit"]) : null;

    // Resume the open attempt if there is one.
    const openSnap = await adminDb
      .collection("quiz_attempts")
      .where("quizId", "==", data.quizId)
      .where("studentId", "==", context.userId)
      .where("status", "==", "in_progress")
      .limit(1)
      .get();

    let attemptId: string;
    let attemptNo: number;
    let startedAt: string;
    let order: string[];
    let responses: Record<string, string[]> = {};

    const openDoc = openSnap.docs[0];
    if (openDoc) {
      const s = openDoc.data();
      attemptId = openDoc.id;
      attemptNo = Number(s["attemptNo"]) || 1;
      startedAt = String(s["startedAt"]);
      order = asStringArray(s["questionOrder"]);
      const saved = (s["answers"] ?? {}) as Record<string, unknown>;
      responses = Object.fromEntries(Object.entries(saved).map(([k, v]) => [k, asStringArray(v)]));
    } else {
      const done = await adminDb
        .collection("submissions")
        .where("refId", "==", data.quizId)
        .where("studentId", "==", context.userId)
        .get();
      const used = done.size;
      if (used >= maxAttempts) throw new Error("You have used all your attempts for this quiz.");

      attemptNo = used + 1;
      startedAt = new Date().toISOString();
      const ids = rawQuestions.map((q) => String(q["id"]));
      order = quiz["randomizeQuestions"]
        ? shuffle(ids, `${context.userId}:${data.quizId}:${attemptNo}`)
        : ids;
      const ref = adminDb.collection("quiz_attempts").doc();
      attemptId = ref.id;
      await ref.set({
        id: ref.id,
        quizId: data.quizId,
        classId: String(quiz["classId"]),
        studentId: context.userId,
        attemptNo,
        startedAt,
        questionOrder: order,
        answers: {},
        violations: [],
        status: "in_progress",
      });
    }

    const byId = new Map(rawQuestions.map((q) => [String(q["id"]), q]));
    const questions: TakeQuestion[] = order
      .map((id) => byId.get(id))
      .filter((q): q is Record<string, unknown> => Boolean(q))
      .map((q) => {
        const type = normalizeType(String(q["type"]));
        const options = Array.isArray(q["options"]) ? (q["options"] as unknown[]).map(String) : [];
        return {
          id: String(q["id"]),
          type,
          prompt: String(q["prompt"] ?? q["text"] ?? ""),
          points: Number(q["points"]) || 1,
          options:
            quiz["randomizeChoices"] && type !== "true_false"
              ? shuffle(options, `${attemptId}:${q["id"]}`)
              : options,
        };
      });

    return {
      attemptId,
      attemptNo,
      startedAt,
      serverNow: new Date().toISOString(),
      quiz: {
        id: data.quizId,
        title: String(quiz["title"] ?? "Quiz"),
        description: quiz["description"] ? String(quiz["description"]) : null,
        timeLimitMinutes: timeLimit,
        maxAttempts,
        lockdownEnabled: Boolean(quiz["lockdownEnabled"]),
      },
      questions,
      responses,
    };
  });

export const saveQuizAnswers = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((input: { attemptId: string; answers: Record<string, string[]> }) => {
    if (!input?.attemptId || typeof input.attemptId !== "string") throw new Error("Attempt is required.");
    const answers: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(input.answers ?? {})) {
      answers[String(k)] = asStringArray(v).map((s) => s.slice(0, 10_000));
    }
    return { attemptId: input.attemptId, answers };
  })
  .handler(async ({ data, context }) => {
    const ref = adminDb.collection("quiz_attempts").doc(data.attemptId);
    const snap = await ref.get();
    const s = snap.data();
    if (!snap.exists || s?.["studentId"] !== context.userId) throw new Error("Attempt not found.");
    if (s["status"] !== "in_progress") return { saved: false };
    // Field-path merge so concurrent saves of different questions don't clobber each other.
    const patch: Record<string, unknown> = { savedAt: new Date().toISOString() };
    for (const [k, v] of Object.entries(data.answers)) patch[`answers.${k}`] = v;
    await ref.update(patch);
    return { saved: true };
  });

export const recordQuizViolation = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((input: { attemptId: string; kind: string; awayMs: number }) => {
    if (!input?.attemptId) throw new Error("Attempt is required.");
    return {
      attemptId: input.attemptId,
      kind: String(input.kind || "tab_switch").slice(0, 40),
      awayMs: Math.max(0, Math.round(Number(input.awayMs) || 0)),
    };
  })
  .handler(async ({ data, context }) => {
    const { FieldValue } = await import("firebase-admin/firestore");
    const ref = adminDb.collection("quiz_attempts").doc(data.attemptId);
    const snap = await ref.get();
    const s = snap.data();
    if (!snap.exists || s?.["studentId"] !== context.userId) throw new Error("Attempt not found.");
    await ref.update({
      violations: FieldValue.arrayUnion({
        kind: data.kind,
        awayMs: data.awayMs,
        at: new Date().toISOString(),
      }),
    });
    return { ok: true };
  });
