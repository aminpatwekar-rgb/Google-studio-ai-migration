import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Pencil,
  PlayCircle,
  Timer,
  Trash2,
  Users,
  ShieldAlert,
  Calendar,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useViewRole } from "@/lib/viewRole";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RenderMathText } from "@/components/math/RenderMathText";
import { getQuiz, getClass, getSubmissionsByRef, deleteQuiz } from "@/lib/firebase/firestore";

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
    queryKey: ["quiz-detail", quizId, isTeacher, user?.id],
    enabled: Boolean(user?.id && quizId),
    queryFn: async () => {
      const res = await getQuiz(quizId, isTeacher);
      if (!res) throw new Error("Quiz not found");
      const c = await getClass(res.quiz.classId);
      return { quiz: res.quiz, answerKey: res.answerKey, className: c?.name || "Class" };
    },
  });

  const submissions = useQuery({
    queryKey: ["quiz-submissions", quizId, user?.id],
    enabled: Boolean(user?.id && quizId),
    queryFn: async () => {
      return await getSubmissionsByRef(quizId);
    },
  });

  const remove = useMutation({
    mutationFn: async () => {
      await deleteQuiz(quizId);
    },
    onSuccess: () => {
      toast.success("Quiz deleted");
      void qc.invalidateQueries({ queryKey: ["all-quizzes"] });
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
  const subs = submissions.data || [];
  const mySub = subs.find((s) => s.studentId === user?.id);
  const totalPoints = (quiz.questions || []).reduce((acc, q) => acc + (q.points || 10), 0);

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
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-primary uppercase tracking-wider">
              {className}
            </span>
            <span className="text-muted-foreground">•</span>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                quiz.kind === "exam"
                  ? "border-destructive/30 bg-destructive/10 text-destructive"
                  : quiz.kind === "scheduled"
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    : quiz.kind === "timed"
                      ? "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400"
                      : "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              }`}
            >
              {quiz.kind === "exam" && <ShieldAlert className="size-3" />}
              {quiz.kind === "scheduled" && <Calendar className="size-3" />}
              {quiz.kind === "timed" && <Timer className="size-3" />}
              {(!quiz.kind || quiz.kind === "practice") && <CheckCircle2 className="size-3" />}
              {quiz.kind === "exam"
                ? "Final Exam (Strict Lockdown)"
                : quiz.kind === "scheduled"
                  ? "Scheduled Quiz"
                  : quiz.kind === "timed"
                    ? "Timed Quiz"
                    : "Practice Quiz"}
            </span>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {quiz.title}
          </h1>

          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground pt-0.5">
            {quiz.kind !== "practice" && (
              <span className="flex items-center gap-1 font-mono">
                <Timer className="size-3.5" /> {quiz.timeLimit || 20} minutes
              </span>
            )}
            {quiz.kind === "practice" && (
              <span className="flex items-center gap-1">
                <CheckCircle2 className="size-3.5 text-emerald-500" /> Untimed Practice
              </span>
            )}
            <span>•</span>
            <span>{(quiz.questions || []).length} questions</span>
            <span>•</span>
            <span>{totalPoints} total points</span>

            {quiz.scheduledStart && (
              <>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Calendar className="size-3.5 text-amber-500" /> Starts:{" "}
                  {new Date(quiz.scheduledStart).toLocaleString()}
                </span>
              </>
            )}
          </div>

          {quiz.kind === "exam" && (
            <div className="mt-2 text-xs text-destructive flex items-center gap-1.5 font-medium">
              <ShieldAlert className="size-3.5" />
              <span>
                Tab switching is strictly locked down. Leaving this tab during the exam triggers
                immediate auto-submit.
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isTeacher ? (
            <>
              <Button asChild size="sm" variant="outline" className="gap-1.5">
                <Link to="/quizzes/$quizId/edit" params={{ quizId }}>
                  <Pencil className="size-3.5" /> Edit Questions
                </Link>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:bg-destructive/10"
                onClick={() => remove.mutate()}
                disabled={remove.isPending}
              >
                <Trash2 className="size-4" />
              </Button>
            </>
          ) : (
            <>
              {mySub ? (
                <div className="text-right">
                  <span className="text-sm font-semibold text-success bg-success/10 px-3 py-1.5 rounded-lg border border-success/20">
                    Completed: {mySub.score} / {totalPoints} pts
                  </span>
                </div>
              ) : (
                <Button asChild size="sm" className="gap-1.5 press">
                  <Link to="/quizzes/$quizId/take" params={{ quizId }}>
                    <PlayCircle className="size-4" /> Start Quiz
                  </Link>
                </Button>
              )}
            </>
          )}
        </div>
      </header>

      {/* QUESTIONS PREVIEW */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Questions</h2>

        <div className="space-y-3">
          {(quiz.questions || []).map((q, idx) => (
            <div key={q.id || idx} className="panel p-5 bg-card border-border space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <span className="font-mono text-xs font-bold text-muted-foreground bg-secondary px-2.5 py-1 rounded shrink-0">
                    Q{idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground break-words leading-relaxed">
                      <RenderMathText text={q.text} />
                    </div>
                    {q.imageUrl && (
                      <div className="mt-2.5 max-w-md overflow-hidden rounded-lg border border-border/60 bg-secondary/10 p-1">
                        <img
                          src={q.imageUrl}
                          alt={`Question ${idx + 1} diagram`}
                          className="max-h-64 w-auto rounded object-contain"
                        />
                      </div>
                    )}
                  </div>
                </div>
                <span className="text-xs font-semibold text-muted-foreground shrink-0 pt-0.5">
                  {q.points || 10} pts
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

              {/* Show correct answer ONLY to teacher */}
              {isTeacher && answerKey?.answers?.[q.id] && (
                <div className="mt-2 pt-2 border-t text-xs text-primary font-medium flex items-center gap-1.5">
                  <CheckCircle2 className="size-3.5" />
                  <span>Correct Answer: {String(answerKey.answers[q.id])}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* TEACHER SUBMISSIONS OVERVIEW */}
      {isTeacher && (
        <section className="space-y-4 pt-4 border-t">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">
              Student Attempts ({subs.length})
            </h2>
          </div>

          {subs.length === 0 ? (
            <div className="panel p-8 text-center border-dashed">
              <Users className="mx-auto size-8 text-muted-foreground/60" />
              <p className="mt-2 text-sm font-semibold">No student has taken this quiz yet</p>
            </div>
          ) : (
            <div className="panel divide-y divide-border bg-card">
              {subs.map((s) => (
                <div key={s.id} className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {s.studentName || "Student"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Submitted on {new Date(s.submittedAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-primary">
                      {s.score ?? 0} / {totalPoints}
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
