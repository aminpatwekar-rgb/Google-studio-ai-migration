import { getQuiz, getClass, getSubmissionsByRef, getUserProfile } from "@/lib/firebase/firestore";
import { percent, type QuestionType } from "@/lib/quiz/types";
import type { Submission } from "@/lib/firebase/models";

type SubmissionWithResults = Submission & {
  resultDetails?: Record<string, { answer?: string; correct?: boolean; marks?: number }>;
};

export type StudentStat = {
  studentId: string;
  name: string;
  status: "completed" | "in_progress" | "not_attempted";
  attemptId: string | null;
  score: number | null;
  maxScore: number | null;
  pct: number | null;
  correct: number;
  incorrect: number;
  unanswered: number;
  timeTakenMs: number | null;
  submittedAt: string | null;
};

export type OptionStat = { label: string; count: number; pct: number };

export type QuestionStat = {
  id: string;
  index: number;
  prompt: string;
  type: QuestionType;
  points: number;
  responses: number;
  correct: number;
  incorrect: number;
  unanswered: number;
  correctPct: number;
  incorrectPct: number;
  avgMarks: number;
  difficulty: "Easy" | "Moderate" | "Difficult";
  options: OptionStat[];
};

export type QuizAnalytics = {
  quiz: {
    id: string;
    title: string;
    passing_marks: number;
    published: boolean;
    class_id: string;
    className: string | null;
  };
  totals: {
    assigned: number;
    attempted: number;
    completed: number;
    notAttempted: number;
    totalAttempts: number;
    avgScore: number | null;
    avgPct: number | null;
    highest: number | null;
    lowest: number | null;
    passRate: number | null;
    maxScore: number;
  };
  students: StudentStat[];
  questions: QuestionStat[];
};

export function difficultyOf(correctPct: number): QuestionStat["difficulty"] {
  if (correctPct >= 70) return "Easy";
  if (correctPct >= 40) return "Moderate";
  return "Difficult";
}

export function formatDuration(ms: number | null) {
  if (ms == null || ms < 0) return "—";
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

export async function fetchQuizAnalytics(quizId: string): Promise<QuizAnalytics> {
  const quizRes = await getQuiz(quizId, true);
  if (!quizRes) throw new Error("Quiz not found.");
  const { quiz } = quizRes;

  const classRoom = quiz.classId ? await getClass(quiz.classId) : null;
  const submissions = (await getSubmissionsByRef(quizId)) as SubmissionWithResults[];

  const rawQuestions = quiz.questions || [];
  const maxScore = rawQuestions.reduce((sum, q) => sum + (q.points || 0), 0);

  const studentIds = Array.from(
    new Set([...(classRoom?.studentIds || []), ...submissions.map((s) => s.studentId)]),
  );

  const studentProfiles = await Promise.all(
    studentIds.map(async (id) => {
      const p = await getUserProfile(id);
      return { id, name: p?.name || "Student" };
    }),
  );
  const names = new Map<string, string>(studentProfiles.map((p) => [p.id, p.name]));

  const students: StudentStat[] = studentIds.map((id) => {
    const studentSubs = submissions.filter((s) => s.studentId === id);
    const latestSub =
      studentSubs
        .slice()
        .sort((a, b) =>
          String(b.submittedAt || "").localeCompare(String(a.submittedAt || "")),
        )[0] || null;

    if (!latestSub) {
      return {
        studentId: id,
        name: names.get(id) || "Student",
        status: "not_attempted",
        attemptId: null,
        score: null,
        maxScore,
        pct: null,
        correct: 0,
        incorrect: 0,
        unanswered: rawQuestions.length,
        timeTakenMs: null,
        submittedAt: null,
      };
    }

    const isGraded = latestSub.status === "graded";
    const subScore = latestSub.score != null ? Number(latestSub.score) : null;
    const pct = subScore != null && maxScore > 0 ? percent(subScore, maxScore) : null;

    return {
      studentId: id,
      name: latestSub.studentName || names.get(id) || "Student",
      status: "completed",
      attemptId: latestSub.id,
      score: subScore,
      maxScore,
      pct,
      correct: 0,
      incorrect: 0,
      unanswered: 0,
      timeTakenMs: null,
      submittedAt: latestSub.submittedAt || null,
    };
  });

  const questionStats: QuestionStat[] = rawQuestions.map((q, i) => {
    const id = q.id || `q-${i}`;
    const optionCounts = new Map<string, number>((q.options || []).map((label) => [label, 0]));
    let responses = 0;
    let correct = 0;
    let incorrect = 0;
    let unanswered = 0;
    let marks = 0;

    for (const submission of submissions) {
      const details = (submission as SubmissionWithResults).resultDetails?.[id];
      const answer = String(
        (submission.answers as Record<string, unknown> | undefined)?.[id] ?? "",
      );
      if (!answer.trim()) {
        unanswered += 1;
        continue;
      }
      responses += 1;
      if (optionCounts.has(answer)) optionCounts.set(answer, (optionCounts.get(answer) || 0) + 1);
      if (details?.correct) correct += 1;
      else incorrect += 1;
      marks += Number(details?.marks || 0);
    }

    const total = submissions.length || 1;
    const correctPct = Math.round((correct / total) * 100);
    return {
      id,
      index: i + 1,
      prompt: q.text || "",
      type: (q.type as QuestionType) || "mcq",
      points: q.points || 0,
      responses,
      correct,
      incorrect,
      unanswered,
      correctPct,
      incorrectPct: Math.round((incorrect / total) * 100),
      avgMarks: submissions.length ? Math.round((marks / submissions.length) * 100) / 100 : 0,
      difficulty: difficultyOf(correctPct),
      options: (q.options || []).map((label) => ({
        label,
        count: optionCounts.get(label) || 0,
        pct: responses ? Math.round(((optionCounts.get(label) || 0) / responses) * 100) : 0,
      })),
    };
  });

  const completed = students.filter((s) => s.status === "completed");
  const scored = completed.filter((s) => s.score != null);
  const scores = scored.map((s) => s.score!);
  const pcts = scored.filter((s) => s.pct != null).map((s) => s.pct!);
  const passingMarks = Math.round(maxScore * 0.4);

  return {
    quiz: {
      id: quiz.id,
      title: quiz.title,
      passing_marks: passingMarks,
      published: true,
      class_id: quiz.classId,
      className: classRoom?.name || null,
    },
    totals: {
      assigned: studentIds.length,
      attempted: completed.length,
      completed: completed.length,
      notAttempted: Math.max(0, studentIds.length - completed.length),
      totalAttempts: submissions.length,
      avgScore: scores.length
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
        : null,
      avgPct: pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null,
      highest: scores.length ? Math.max(...scores) : null,
      lowest: scores.length ? Math.min(...scores) : null,
      passRate: scored.length
        ? Math.round(
            (scored.filter((s) => (s.score ?? 0) >= passingMarks).length / scored.length) * 100,
          )
        : null,
      maxScore,
    },
    students,
    questions: questionStats,
  };
}
