import { createServerFn } from "@tanstack/react-start";
import { requireFirebaseAuth, adminDb } from "@/lib/firebase/auth-middleware";
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

export const getGradingOverview = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const { userId, isAdmin } = await getGraderScope(context.userId, context.email);

    // Get classes
    const classesSnap = await adminDb.collection("classes").get();
    const allClasses = classesSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as any);
    const teacherClasses = isAdmin ? allClasses : allClasses.filter((c) => c.teacherId === userId);
    const teacherClassIds = new Set(teacherClasses.map((c) => c.id));
    const classMap = new Map(allClasses.map((c) => [c.id, c.name]));

    // Get assignments
    const assignSnap = await adminDb.collection("assignments").get();
    const allAssignments = assignSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as any);
    const assignments = allAssignments.filter(
      (a) => isAdmin || teacherClassIds.has(a.classId) || a.createdBy === userId,
    );

    // Get quizzes
    const quizSnap = await adminDb.collection("quizzes").get();
    const allQuizzes = quizSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as any);
    const quizzes = allQuizzes.filter(
      (q) => isAdmin || teacherClassIds.has(q.classId) || q.createdBy === userId,
    );

    // Get submissions
    const subSnap = await adminDb.collection("submissions").get();
    const allSubs = subSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as any);
    const submissions = allSubs.filter((s) => isAdmin || teacherClassIds.has(s.classId));

    // Build assignment groups
    const assignmentGroups: AssignmentGroup[] = assignments.map((a) => {
      const cls = teacherClasses.find((c) => c.id === a.classId);
      const subs = submissions.filter((s) => s.type === "assignment" && s.refId === a.id);
      const waiting = subs.filter((s) => s.status === "submitted").length;
      const graded = subs.filter((s) => s.status === "graded").length;

      return {
        id: a.id,
        title: a.title,
        class_id: a.classId,
        class_name: classMap.get(a.classId) || "Class",
        subject: null,
        due_date: a.dueDate || null,
        max_marks: Number(a.maxPoints) || 100,
        waiting,
        late_waiting: 0,
        graded_unreleased: 0,
        released: graded,
        returned: 0,
        roster: cls?.studentIds?.length || 0,
        oldest_waiting_at: null,
      };
    });

    // Build quiz groups
    const quizGroups: QuizGroup[] = quizzes.map((q) => {
      const subs = submissions.filter((s) => s.type === "quiz" && s.refId === q.id);
      const waiting = subs.filter((s) => s.status === "submitted").length;
      const graded = subs.filter((s) => s.status === "graded").length;

      return {
        id: q.id,
        title: q.title,
        class_id: q.classId,
        class_name: classMap.get(q.classId) || "Class",
        kind: "quiz",
        waiting,
        graded,
        attempts: subs.length,
        oldest_waiting_at: null,
      };
    });

    // Up next items
    const up_next: WaitingItem[] = submissions
      .filter((s) => s.status === "submitted")
      .slice(0, 10)
      .map((s) => ({
        kind: s.type || "assignment",
        group_id: s.refId,
        item_id: s.id,
        title: s.type === "quiz" ? "Quiz Submission" : "Assignment Submission",
        class_name: classMap.get(s.classId) || "Class",
        student_name: s.studentName || "Student",
        submitted_at: s.submittedAt || null,
        is_late: false,
      }));

    const totalWaiting = submissions.filter((s) => s.status === "submitted").length;
    const totalGraded = submissions.filter((s) => s.status === "graded").length;

    return {
      assignments: assignmentGroups,
      quizzes: quizGroups,
      up_next,
      stats: {
        waiting: totalWaiting,
        late_waiting: 0,
        ready_to_release: 0,
        graded_this_week: totalGraded,
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

    if (!isAdmin && assignment.createdBy !== userId && classData?.teacherId !== userId) {
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
        is_late: false,
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

    if (!isAdmin && quiz.createdBy !== userId && classData?.teacherId !== userId) {
      throw new Error("Forbidden: You cannot grade this quiz.");
    }

    const subDocs = await adminDb.collection("submissions").where("refId", "==", data.quizId).get();

    const rows: QuizQueueRow[] = subDocs.docs.map((d) => {
      const s = d.data();
      return {
        attempt_id: d.id,
        student_id: s.studentId,
        student_name: s.studentName || "Student",
        attempt_no: 1,
        status: s.status,
        needs_manual_grading: s.status === "submitted",
        score: s.score != null ? Number(s.score) : null,
        max_score: 100,
        submitted_at: s.submittedAt || null,
        graded_at: s.gradedAt || null,
      };
    });

    return {
      quiz: {
        id: quizDoc.id,
        title: quiz.title,
        class_name: classData?.name || "Class",
        passing_marks: 40,
      },
      rows,
    } satisfies QuizQueue;
  });
