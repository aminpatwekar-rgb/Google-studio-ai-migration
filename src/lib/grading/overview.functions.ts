import { createServerFn } from "@tanstack/react-start";
import { requireFirebaseAuth } from "@/lib/firebase/auth-middleware";
import { adminDb } from "@/lib/firebase/admin";
import type {
  AssignmentGroup,
  AssignmentQueue,
  GradingOverview,
  QuizGroup,
  QuizQueue,
  WaitingItem,
  AssignmentQueueRow,
  QuizQueueRow,
} from "@/lib/grading/types";

async function getGraderScope(userId: string, email?: string) {
  const userDoc = await adminDb.collection("users").doc(userId).get();
  const userData = userDoc.data();
  const isAdmin = userData?.role === "admin" || email === "aminpatwekar@gmail.com";
  const isTeacher = userData?.role === "teacher" || isAdmin;

  if (!isTeacher) {
    throw new Error("Only teachers or administrators can access the grading tab.");
  }
  return { userId, isAdmin };
}

/** Firestore `in` queries take at most 30 values. */
function chunk<T>(items: T[], size = 30): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function byClassIds(collection: string, classIds: string[]) {
  const parts = await Promise.all(
    chunk(classIds).map((ids) => adminDb.collection(collection).where("classId", "in", ids).get()),
  );
  return parts.flatMap((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }) as any));
}

const isLate = (submittedAt?: string | null, due?: string | null) =>
  Boolean(submittedAt && due && new Date(submittedAt).getTime() > new Date(due).getTime());

const oldest = (dates: (string | null | undefined)[]) =>
  dates.filter((d): d is string => Boolean(d)).sort()[0] ?? null;

export const getGradingOverview = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const { userId, isAdmin } = await getGraderScope(context.userId, context.email);

    // Only the classes this person teaches (owner or co-teacher); admins see everything.
    const classesSnap = await adminDb.collection("classes").get();
    const allClasses = classesSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as any);
    const teacherClasses = isAdmin
      ? allClasses
      : allClasses.filter(
          (c) => c.teacherId === userId || (Array.isArray(c.teacherIds) && c.teacherIds.includes(userId)),
        );
    const classIds = teacherClasses.map((c) => c.id as string);
    const classMap = new Map<string, string>(allClasses.map((c) => [c.id, c.name]));

    const [assignments, quizzes, submissions] = classIds.length
      ? await Promise.all([
          byClassIds("assignments", classIds),
          byClassIds("quizzes", classIds),
          byClassIds("submissions", classIds),
        ])
      : [[], [], []];

    const dueById = new Map<string, string | null>(assignments.map((a) => [a.id, a.dueDate ?? null]));
    const titleById = new Map<string, string>([
      ...assignments.map((a) => [a.id, a.title] as [string, string]),
      ...quizzes.map((q) => [q.id, q.title] as [string, string]),
    ]);

    const assignmentGroups: AssignmentGroup[] = assignments
      .filter((a) => a.archived !== true)
      .map((a) => {
        const cls = teacherClasses.find((c) => c.id === a.classId);
        const subs = submissions.filter((s) => s.type === "assignment" && s.refId === a.id);
        const waitingSubs = subs.filter((s) => s.status === "submitted");
        return {
          id: a.id,
          title: a.title,
          class_id: a.classId,
          class_name: classMap.get(a.classId) || "Class",
          subject: a.subject ?? null,
          due_date: a.dueDate || null,
          max_marks: Number(a.maxPoints) || 100,
          waiting: waitingSubs.length,
          late_waiting: waitingSubs.filter((s) => isLate(s.submittedAt, a.dueDate)).length,
          graded_unreleased: 0,
          released: subs.filter((s) => s.status === "graded").length,
          returned: 0,
          roster: cls?.studentIds?.length || 0,
          oldest_waiting_at: oldest(waitingSubs.map((s) => s.submittedAt)),
        };
      });

    const quizGroups: QuizGroup[] = quizzes
      .filter((q) => q.archived !== true)
      .map((q) => {
        const subs = submissions.filter((s) => s.type === "quiz" && s.refId === q.id);
        const waitingSubs = subs.filter((s) => s.status === "submitted");
        return {
          id: q.id,
          title: q.title,
          class_id: q.classId,
          class_name: classMap.get(q.classId) || "Class",
          kind: String(q.kind ?? "quiz"),
          waiting: waitingSubs.length,
          graded: subs.filter((s) => s.status === "graded").length,
          attempts: subs.length,
          oldest_waiting_at: oldest(waitingSubs.map((s) => s.submittedAt)),
        };
      });

    const waitingAll = submissions
      .filter((s) => s.status === "submitted")
      .sort((a, b) => String(a.submittedAt ?? "").localeCompare(String(b.submittedAt ?? "")));

    const up_next: WaitingItem[] = waitingAll.slice(0, 10).map((s) => ({
      kind: s.type === "quiz" ? "quiz" : "assignment",
      group_id: s.refId,
      item_id: s.id,
      title: titleById.get(s.refId) ?? (s.type === "quiz" ? "Quiz" : "Assignment"),
      class_name: classMap.get(s.classId) || "Class",
      student_name: s.studentName || "Student",
      submitted_at: s.submittedAt || null,
      is_late: s.type === "quiz" ? Boolean(s.late) : isLate(s.submittedAt, dueById.get(s.refId)),
    }));

    const weekAgo = Date.now() - 7 * 86_400_000;
    const gradedThisWeek = submissions.filter(
      (s) => s.status === "graded" && s.gradedAt && new Date(s.gradedAt).getTime() >= weekAgo,
    ).length;

    return {
      assignments: assignmentGroups,
      quizzes: quizGroups,
      up_next,
      stats: {
        waiting: waitingAll.length,
        late_waiting: waitingAll.filter((s) =>
          s.type === "quiz" ? Boolean(s.late) : isLate(s.submittedAt, dueById.get(s.refId)),
        ).length,
        ready_to_release: 0,
        graded_this_week: gradedThisWeek,
      },
    } satisfies GradingOverview;
  });

export const getAssignmentGradingQueue = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .validator((input: { assignmentId: string }) => {
    if (!input?.assignmentId || typeof input.assignmentId !== "string") {
      throw new Error("A valid assignment id is required");
    }
    return { assignmentId: input.assignmentId };
  })
  .handler(async ({ data, context }) => {
    const { userId, isAdmin } = await getGraderScope(context.userId, context.email);

    const assignDoc = await adminDb.collection("assignments").doc(data.assignmentId).get();
    if (!assignDoc.exists) throw new Error("Assignment not found");
    const assignment = assignDoc.data()!;

    const classDoc = await adminDb.collection("classes").doc(assignment.classId).get();
    const classData = classDoc.data();

    if (!isAdmin && assignment.createdBy !== userId && !(classData?.teacherIds ?? [classData?.teacherId]).includes(userId)) {
      throw new Error("Forbidden: You cannot grade this assignment.");
    }

    const subDocs = await adminDb
      .collection("submissions")
      .where("refId", "==", data.assignmentId)
      .get();

    const rows: AssignmentQueueRow[] = subDocs.docs.map((d) => {
      const s = d.data();
      return {
        submission_id: d.id,
        student_id: s.studentId,
        student_name: s.studentName || "Student",
        status: s.status,
        is_late: isLate(s.submittedAt, assignment.dueDate),
        submitted_at: s.submittedAt || null,
        marks_awarded: s.score != null ? Number(s.score) : null,
        grade_released: s.status === "graded",
        reviewed_at: s.gradedAt || null,
        paste_violation_count: 0,
        mode: "typed",
      };
    });

    const submittedStudentIds = new Set(rows.map((r) => r.student_id));
    const allRosterIds: string[] = classData?.studentIds || [];
    const missingIds = allRosterIds.filter((id) => !submittedStudentIds.has(id));

    const missing = await Promise.all(
      missingIds.map(async (id) => {
        const uDoc = await adminDb.collection("users").doc(id).get();
        return {
          student_id: id,
          student_name: uDoc.data()?.name || "Student",
        };
      }),
    );

    return {
      assignment: {
        id: assignDoc.id,
        title: assignment.title,
        max_marks: Number(assignment.maxPoints) || 100,
        class_name: classData?.name || "Class",
        due_date: assignment.dueDate || null,
      },
      rows,
      missing,
    } satisfies AssignmentQueue;
  });

export const getQuizGradingQueue = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .validator((input: { quizId: string }) => {
    if (!input?.quizId || typeof input.quizId !== "string") {
      throw new Error("A valid quiz id is required");
    }
    return { quizId: input.quizId };
  })
  .handler(async ({ data, context }) => {
    const { userId, isAdmin } = await getGraderScope(context.userId, context.email);

    const quizDoc = await adminDb.collection("quizzes").doc(data.quizId).get();
    if (!quizDoc.exists) throw new Error("Quiz not found");
    const quiz = quizDoc.data()!;

    const classDoc = await adminDb.collection("classes").doc(quiz.classId).get();
    const classData = classDoc.data();

    if (!isAdmin && quiz.createdBy !== userId && !(classData?.teacherIds ?? [classData?.teacherId]).includes(userId)) {
      throw new Error("Forbidden: You cannot grade this quiz.");
    }

    const subDocs = await adminDb.collection("submissions").where("refId", "==", data.quizId).get();

    const rows: QuizQueueRow[] = subDocs.docs.map((d) => {
      const s = d.data();
      return {
        attempt_id: d.id,
        student_id: s.studentId,
        student_name: s.studentName || "Student",
        attempt_no: Number(s.attemptNo) || 1,
        status: s.status,
        needs_manual_grading: s.status === "submitted",
        score: s.score != null ? Number(s.score) : null,
        max_score: s.maxScore != null ? Number(s.maxScore) : null,
        submitted_at: s.submittedAt || null,
        graded_at: s.gradedAt || null,
      };
    });

    return {
      quiz: {
        id: quizDoc.id,
        title: quiz.title,
        class_name: classData?.name || "Class",
        passing_marks: Number(quiz.passingMarks) || 0,
      },
      rows,
    } satisfies QuizQueue;
  });
