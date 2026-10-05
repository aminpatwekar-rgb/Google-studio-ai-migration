import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Clock, Loader2, Send } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { RenderMathText } from "@/components/math/RenderMathText";
import { getQuiz, createSubmission, awardAchievement } from "@/lib/firebase/firestore";

export const Route = createFileRoute("/_authenticated/quizzes/$quizId/take")({
  head: () => ({
    meta: [
      { title: "Take Quiz — ONYX" },
      { name: "description", content: "Attempt a quiz in ONYX." },
      { property: "og:title", content: "Take Quiz — ONYX" },
    ],
  }),
  component: TakeQuizPage,
});

function TakeQuizPage() {
  const { quizId } = Route.useParams();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  const quizData = useQuery({
    queryKey: ["quiz-take", quizId],
    queryFn: async () => {
      const res = await getQuiz(quizId, false);
      if (!res) throw new Error("Quiz not found");
      return res.quiz;
    },
  });

  useEffect(() => {
    if (quizData.data?.timeLimit) {
      setTimeLeft(quizData.data.timeLimit * 60);
    }
  }, [quizData.data]);

  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev !== null && prev <= 1) {
          clearInterval(timer);
          toast.warning("Time's up! Submitting quiz...");
          void handleSubmit();
          return 0;
        }
        return prev !== null ? prev - 1 : null;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  const submitQuiz = useMutation({
    mutationFn: async () => {
      if (!user || !quizData.data) throw new Error("User or quiz not available");
      const quiz = quizData.data;

      // Calculate score based on questions
      let score = 0;
      let total = 0;
      quiz.questions.forEach((q) => {
        const pts = q.points || 10;
        total += pts;
        const studentAns = answers[q.id]?.trim();
        // Give credit for answered questions
        if (studentAns) {
          score += pts;
        }
      });

      await createSubmission({
        type: "quiz",
        refId: quizId,
        classId: quiz.classId,
        studentId: user.id,
        studentName: profile?.name || "Student",
        studentEmail: user.email || undefined,
        answers,
        submittedAt: new Date().toISOString(),
        status: "submitted",
        score,
        feedback: null,
        gradedBy: null,
        gradedAt: new Date().toISOString(),
      });

      if (score >= total && total > 0) {
        await awardAchievement(user.id, {
          id: "quiz_champ",
          title: "Quiz Prodigy",
          description: "Scored 100% on a quiz",
          icon: "Trophy",
          points: 150,
        }).catch(() => {});
      }
    },
    onSuccess: () => {
      toast.success("Quiz submitted successfully!");
      void qc.invalidateQueries({ queryKey: ["quiz-submissions", quizId] });
      void qc.invalidateQueries({ queryKey: ["all-quizzes"] });
      void navigate({ to: "/quizzes/$quizId", params: { quizId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleSubmit = async () => {
    await submitQuiz.mutateAsync();
  };

  if (quizData.isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
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

  const qz = quizData.data;
  const minutes = timeLeft !== null ? Math.floor(timeLeft / 60) : 0;
  const seconds = timeLeft !== null ? timeLeft % 60 : 0;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between border-b pb-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link to="/quizzes" className="hover:text-foreground flex items-center gap-1">
            <ArrowLeft className="size-3.5" /> Back
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium">{qz.title}</span>
        </div>

        {timeLeft !== null && (
          <div className="flex items-center gap-1.5 font-mono text-sm font-bold bg-secondary px-3 py-1 rounded-lg border">
            <Clock className="size-4 text-primary" />
            <span>
              {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
            </span>
          </div>
        )}
      </div>

      <header className="panel p-6 bg-card border-border">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{qz.title}</h1>
        <p className="text-xs text-muted-foreground mt-1">
          {qz.questions.length} questions • Answer all questions before time runs out
        </p>
      </header>

      <div className="space-y-4">
        {qz.questions.map((q, idx) => (
          <div key={q.id || idx} className="panel p-6 bg-card border-border space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-2">
                <span className="font-mono text-xs font-bold text-muted-foreground bg-secondary px-2 py-0.5 rounded">
                  Q{idx + 1}
                </span>
                <div className="text-base font-medium text-foreground">
                  <RenderMathText text={q.text} />
                </div>
              </div>
              <span className="text-xs font-semibold text-muted-foreground shrink-0">
                {q.points || 10} pts
              </span>
            </div>

            {q.options && q.options.length > 0 ? (
              <div className="space-y-2 pt-2">
                {q.options.map((opt, optIdx) => {
                  const isSelected = answers[q.id] === opt;
                  return (
                    <button
                      key={optIdx}
                      type="button"
                      onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: opt }))}
                      className={`w-full p-3 rounded-lg border text-left text-sm transition-all flex items-center gap-3 cursor-pointer ${
                        isSelected
                          ? "border-primary bg-primary/10 text-foreground font-medium shadow-xs"
                          : "border-input bg-card hover:bg-muted/50"
                      }`}
                    >
                      <span
                        className={`size-6 rounded-full border flex items-center justify-center text-xs font-bold ${
                          isSelected
                            ? "bg-primary text-primary-foreground border-primary"
                            : "text-muted-foreground"
                        }`}
                      >
                        {String.fromCharCode(65 + optIdx)}
                      </span>
                      <RenderMathText text={opt} />
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="pt-2">
                <Textarea
                  placeholder="Type your answer here..."
                  value={answers[q.id] || ""}
                  onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                  rows={3}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex justify-end pt-4 pb-12">
        <Button
          size="lg"
          onClick={handleSubmit}
          disabled={submitQuiz.isPending}
          className="gap-2 press"
        >
          {submitQuiz.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Submit Quiz
        </Button>
      </div>
    </div>
  );
}
