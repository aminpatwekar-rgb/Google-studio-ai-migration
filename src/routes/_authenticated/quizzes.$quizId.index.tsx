import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Lock,
  Pencil,
  PlayCircle,
  Timer,
  Trash2,
  Users,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useViewRole } from "@/lib/viewRole";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RenderMathText } from "@/components/math/RenderMathText";
import {
  getQuiz,
  getClass,
  getStudentSubmissions,
  getSubmissionsByRef,
  deleteQuiz,
} from "@/lib/firebase/firestore";
import { correctFor, questionPrompt } from "@/lib/quiz/model";
import { percent } from "@/lib/quiz/types";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/quizzes/$quizId/")({
  head: () => ({
    meta: [
      { title: "Quiz Overview — ONYX" },
      { name: "description", content: "Quiz details and attempts in ONYX." },
      { property: "og:title", content: "Quiz Overview — ONYX" },
    ],
  }),
  component: QuizDetailPage,
});

function QuizDetailPage() {
  const { quizId } = Route.useParams();
  const { user } = useAuth();
  const { effectiveRole } = useViewRole();
  const isTeacher = effectiveRole === "teacher" || effectiveRole === "admin";
  const navigate = useNavigate();
  const qc = useQueryClient();

  const quizData = useQuery({
    queryKey: ["quiz-detail", quizId, isTeacher],
    queryFn: async () => {
      const res = await getQuiz(quizId, isTeacher);
      if (!res) throw new Error("Quiz not found");
      const c = await getClass(res.quiz.classId);
      return { quiz: res.quiz, answerKey: res.answerKey, className: c?.name || "Class" };
    },
  });

  // Students may only list their own submissions (Firestore rules), teachers see everyone's.
  const submissions = useQuery({
    queryKey: ["quiz-submissions", quizId, isTeacher, user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      if (isTeacher) return getSubmissionsByRef(quizId);
      return (await getStudentSubmissions(user!.id)).filter(
        (s) => s.refId === quizId && s.type === "quiz",
      );
    },
  });

  const remove = useMutation({
    mutationFn: async () => {
      await deleteQuiz(quizId);
    },
    onSuccess: () => {
      toast.success("Quiz deleted");
      void qc.invalidateQueries({ queryKey: ["all-quizzes"] });
      void qc.invalidateQueries({ queryKey: ["teacher-quizzes"] });
      void navigate({ to: "/quizzes" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (quizData.isLoading) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (quizData.isError || !quizData.data) {
    return (
      <div className="panel p-8 text-center text-sm">
        <p className="text-destructive font-semibold">Couldn't load quiz</p>
        <Button asChild size="sm" variant="outline" className="mt-4">
          <Link to="/quizzes">Back to quizzes</Link>
        </Button>
      </div>
    );
  }

  const { quiz, answerKey, className } = quizData.data;
  const subs = [...(submissions.data || [])].sort(
    (a, b) => (a.attemptNo ?? 1) - (b.attemptNo ?? 1),
  );
  const totalPoints =
    quiz.totalMarks || (quiz.questions || []).reduce((acc, q) => acc + (Number(q.points) || 0), 0);
  const published = quiz.published !== false;

  // Student-side availability.
  const maxAttempts = quiz.maxAttempts ?? 1;
  const used = subs.length;
  const latest = subs[subs.length - 1];
  const now = Date.now();
  const notOpen = quiz.startAt ? new Date(quiz.startAt).getTime() > now : false;
  const closed = quiz.endAt ? new Date(quiz.endAt).getTime() < now : false;
  const exhausted = used >= maxAttempts;
  const canStart = published && !notOpen && !closed && !exhausted && (quiz.questions || []).length > 0;
  const showResults = quiz.showResults !== false;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link to="/quizzes" className="hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="size-3.5" /> Quizzes
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">{quiz.title}</span>
      </div>

      <header className="panel p-6 bg-card border-border flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="text-xs font-semibold text-primary uppercase tracking-wider">{className}</span>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl mt-1">
            {quiz.title}
          </h1>
          {quiz.description && (
            <p className="mt-2 max-w-xl whitespace-pre-wrap text-sm text-muted-foreground">
              {quiz.description}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground mt-2">
            <span className="flex items-center gap-1">
              <Timer className="size-3.5" />{" "}
              {quiz.timeLimit ? `${quiz.timeLimit} minutes` : "No time limit"}
            </span>
            <span>•</span>
            <span>{(quiz.questions || []).length} questions</span>
            <span>•</span>
            <span>{totalPoints} total marks</span>
            {maxAttempts > 1 && (
              <>
                <span>•</span>
                <span>
                  {maxAttempts} attempts
                </span>
              </>
            )}
            {quiz.lockdownEnabled && (
              <Badge variant="outline" className="gap-1">
                <Lock className="size-3" /> Lockdown
              </Badge>
            )}
            {isTeacher && <Badge variant={published ? "default" : "secondary"}>{published ? "Published" : "Draft"}</Badge>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isTeacher ? (
            <>
              <Button asChild size="sm" variant="outline" className="gap-1.5">
                <Link to="/quizzes/$quizId/edit" params={{ quizId }}>
                  <Pencil className="size-3.5" /> Edit quiz
                </Link>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:bg-destructive/10"
                onClick={() => {
                  if (window.confirm(`Delete "${quiz.title}"? This cannot be undone.`)) remove.mutate();
                }}
                disabled={remove.isPending}
              >
                <Trash2 className="size-4" />
              </Button>
            </>
          ) : canStart ? (
            <Button asChild size="sm" className="gap-1.5 press">
              <Link to="/quizzes/$quizId/take" params={{ quizId }}>
                <PlayCircle className="size-4" /> {used > 0 ? "Retake quiz" : "Start quiz"}
              </Link>
            </Button>
          ) : (
            <Badge variant="secondary">
              {!published
                ? "Not available"
                : notOpen
                  ? `Opens ${new Date(quiz.startAt!).toLocaleString()}`
                  : closed
                    ? "Closed"
                    : exhausted
                      ? "No attempts left"
                      : "No questions yet"}
            </Badge>
          )}
        </div>
      </header>

      {/* STUDENT: own attempts */}
      {!isTeacher && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            Your attempts ({used}/{maxAttempts})
          </h2>
          {subs.length === 0 ? (
            <div className="panel p-6 text-sm text-muted-foreground">
              You haven't attempted this quiz yet.
            </div>
          ) : (
            <div className="panel divide-y divide-border">
              {subs.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="text-sm font-medium">Attempt {s.attemptNo ?? 1}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(s.submittedAt).toLocaleString()}
                    </p>
                  </div>
                  {s.status === "graded" && showResults ? (
                    <span className="text-sm font-semibold tabular-nums">
                      {s.score ?? 0} / {s.maxScore ?? totalPoints} ·{" "}
                      {percent(s.score ?? 0, s.maxScore ?? totalPoints)}%
                      {quiz.passingMarks && quiz.passingMarks > 0 ? (
                        <Badge
                          className="ml-2"
                          variant={(s.score ?? 0) >= quiz.passingMarks ? "default" : "destructive"}
                        >
                          {(s.score ?? 0) >= quiz.passingMarks ? "Passed" : "Not passed"}
                        </Badge>
                      ) : null}
                    </span>
                  ) : s.status === "graded" ? (
                    <Badge variant="secondary">Submitted</Badge>
                  ) : (
                    <Badge variant="secondary">Awaiting grading</Badge>
                  )}
                </div>
              ))}
            </div>
          )}
          {latest && exhausted && (
            <p className="text-xs text-muted-foreground">You've used all your attempts.</p>
          )}
        </section>
      )}

      {/* TEACHER: question preview with the answer key. Students never see questions before starting. */}
      {isTeacher && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Questions</h2>

          <div className="space-y-3">
            {(quiz.questions || []).map((q, idx) => {
              const correct = correctFor(answerKey, q.id);
              return (
                <div key={q.id || idx} className="panel p-5 bg-card border-border space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-2">
                      <span className="font-mono text-xs font-bold text-muted-foreground bg-secondary px-2 py-0.5 rounded">
                        Q{idx + 1}
                      </span>
                      <div className="text-sm font-medium text-foreground">
                        <RenderMathText text={questionPrompt(q)} />
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-muted-foreground shrink-0">
                      {q.points || 1} pts
                    </span>
                  </div>

                  {q.options && q.options.length > 0 && (
                    <div className="grid gap-2 sm:grid-cols-2 pt-2">
                      {q.options.map((opt, optIdx) => (
                        <div
                          key={optIdx}
                          className="p-2.5 rounded-md border text-xs bg-secondary/30 flex items-center gap-2"
                        >
                          <span className="size-4 rounded-full border flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                            {String.fromCharCode(65 + optIdx)}
                          </span>
                          <RenderMathText text={opt} />
                        </div>
                      ))}
                    </div>
                  )}

                  {correct.length > 0 && (
                    <div className="mt-2 pt-2 border-t text-xs text-primary font-medium flex items-center gap-1.5">
                      <CheckCircle2 className="size-3.5" />
                      <span>Correct answer: {correct.join(", ")}</span>
                    </div>
                  )}
                  {answerKey?.explanations?.[q.id] && (
                    <p className="text-xs text-muted-foreground">{answerKey.explanations[q.id]}</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* TEACHER: attempts */}
      {isTeacher && (
        <section className="space-y-4 pt-4 border-t">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">
              Student attempts ({subs.length})
            </h2>
            <Button asChild size="sm" variant="outline">
              <Link to="/quizzes/$quizId/edit" params={{ quizId }}>
                Review answers
              </Link>
            </Button>
          </div>

          {subs.length === 0 ? (
            <div className="panel p-8 text-center border-dashed">
              <Users className="mx-auto size-8 text-muted-foreground/60" />
              <p className="mt-2 text-sm font-semibold">No student has taken this quiz yet</p>
            </div>
          ) : (
            <div className="panel divide-y divide-border bg-card">
              {subs.map((s) => (
                <div key={s.id} className="p-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{s.studentName || "Student"}</p>
                    <p className="text-xs text-muted-foreground">
                      Attempt {s.attemptNo ?? 1} · {new Date(s.submittedAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-right">
                    <Badge variant={s.status === "graded" ? "default" : "outline"}>
                      {s.status === "graded" ? "Graded" : "Needs marking"}
                    </Badge>
                    <span className="text-sm font-bold text-primary tabular-nums">
                      {s.score ?? "—"} / {s.maxScore ?? totalPoints}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
