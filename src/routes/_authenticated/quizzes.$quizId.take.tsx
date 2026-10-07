import { useEffect, useRef, useState, useCallback } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Clock,
  Loader2,
  Send,
  ShieldAlert,
  AlertTriangle,
  Lock,
  Maximize2,
  BookOpen,
  Calendar,
  Check,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { RenderMathText } from "@/components/math/RenderMathText";
import { getQuiz, awardAchievement } from "@/lib/firebase/firestore";
import { submitQuizAttempt } from "@/lib/quiz/submit.functions";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [violations, setViolations] = useState(0);
  const [lockedOut, setLockedOut] = useState(false);
  const [lockReason, setLockReason] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);

  const hasSubmittedRef = useRef(false);
  const answersRef = useRef(answers);
  answersRef.current = answers;

  const quizData = useQuery({
    queryKey: ["quiz-take", quizId],
    queryFn: async () => {
      const res = await getQuiz(quizId, false);
      if (!res) throw new Error("Quiz not found");
      return res.quiz;
    },
  });

  const qz = quizData.data;
  const isExam = qz?.kind === "exam" || qz?.lockdown === true;
  const isTimed = qz?.kind === "timed" || (isExam && Boolean(qz?.timeLimit));

  const submitQuiz = useMutation({
    mutationFn: async (opts?: { locked?: boolean; reason?: string }) => {
      if (hasSubmittedRef.current) return;
      hasSubmittedRef.current = true;

      if (!user || !qz) throw new Error("User or quiz not available");
      const result = await submitQuizAttempt({
        data: {
          quizId,
          answers: answersRef.current,
          submittedAt: new Date().toISOString(),
          tabSwitchViolations: violations + (opts?.locked ? 1 : 0),
          lockedOut: opts?.locked || lockedOut,
          lockReason: opts?.reason || lockReason || undefined,
        },
      });

      if (result.score >= result.maxScore && result.maxScore > 0 && !opts?.locked) {
        await awardAchievement(user.id, {
          id: "quiz_champ",
          title: "Quiz Prodigy",
          description: "Scored 100% on a quiz",
          icon: "Trophy",
          points: 150,
        }).catch(() => {});
      }
      return result;
    },
    onSuccess: (result) => {
      if (result?.lockedOut) {
        toast.error("Exam locked and submitted due to tab switch violation.");
      } else {
        toast.success(`Quiz submitted — ${result?.percentage}%`);
      }
      void qc.invalidateQueries({ queryKey: ["quiz-submissions", quizId] });
      void qc.invalidateQueries({ queryKey: ["all-quizzes"] });
      void qc.invalidateQueries({ queryKey: ["student-quiz-subs"] });
    },
    onError: (e: Error) => {
      hasSubmittedRef.current = false;
      toast.error(e.message);
    },
  });

  const handleSubmit = useCallback(async () => {
    await submitQuiz.mutateAsync();
    void navigate({ to: "/quizzes/$quizId", params: { quizId } });
  }, [submitQuiz, navigate, quizId]);

  const handleLockout = useCallback(
    async (reason: string) => {
      if (hasSubmittedRef.current || lockedOut) return;
      setLockedOut(true);
      setLockReason(reason);
      setViolations((v) => v + 1);
      toast.error(`LOCKDOWN VIOLATION: ${reason}. Submitting exam immediately!`);
      await submitQuiz.mutateAsync({ locked: true, reason });
    },
    [hasSubmittedRef, lockedOut, submitQuiz],
  );

  // Initialize timer
  useEffect(() => {
    if (isTimed && qz?.timeLimit) {
      setTimeLeft(qz.timeLimit * 60);
    }
  }, [isTimed, qz?.timeLimit]);

  // Countdown timer
  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0 || lockedOut || hasSubmittedRef.current) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev !== null && prev <= 1) {
          clearInterval(timer);
          toast.warning("Time is up! Submitting quiz...");
          void handleSubmit();
          return 0;
        }
        return prev !== null ? prev - 1 : null;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft, lockedOut, handleSubmit]);

  // Exam Tab Switch & Window Blur Detection (Anti-Cheat Lockdown)
  useEffect(() => {
    if (!isExam || lockedOut || hasSubmittedRef.current) return;

    const handleVisibilityChange = () => {
      if (document.hidden || document.visibilityState === "hidden") {
        void handleLockout("Student switched browser tab or minimized window during Final Exam");
      }
    };

    const handleWindowBlur = () => {
      if (!hasSubmittedRef.current) {
        void handleLockout("Exam window lost focus / student switched application or tab");
      }
    };

    const handlePageHide = () => {
      if (!hasSubmittedRef.current) {
        void handleLockout("Navigated away or backgrounded exam session");
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      toast.warning("Right-click context menu is disabled during Final Exams.");
    };

    const handleCopyPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      toast.warning("Copying and pasting is prohibited during Final Exams.");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("copy", handleCopyPaste);
    document.addEventListener("cut", handleCopyPaste);
    document.addEventListener("paste", handleCopyPaste);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("copy", handleCopyPaste);
      document.removeEventListener("cut", handleCopyPaste);
      document.removeEventListener("paste", handleCopyPaste);
    };
  }, [isExam, lockedOut, handleLockout]);

  // Request Fullscreen
  const requestFullscreen = () => {
    if (document.documentElement.requestFullscreen) {
      void document.documentElement
        .requestFullscreen()
        .then(() => setIsFullscreen(true))
        .catch(() => {});
    }
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

  const currentQuiz = quizData.data;

  // Check scheduled window
  const now = new Date();
  if (currentQuiz.kind === "scheduled") {
    if (currentQuiz.scheduledStart && new Date(currentQuiz.scheduledStart) > now) {
      return (
        <div className="panel p-8 text-center space-y-3 max-w-lg mx-auto">
          <Calendar className="size-10 text-primary mx-auto" />
          <h2 className="text-lg font-bold text-foreground">Scheduled Quiz Not Open Yet</h2>
          <p className="text-xs text-muted-foreground">
            This quiz is scheduled to open on{" "}
            {new Date(currentQuiz.scheduledStart).toLocaleString()}.
          </p>
          <Button asChild size="sm" variant="outline">
            <Link to="/quizzes">Back to quizzes</Link>
          </Button>
        </div>
      );
    }
    if (currentQuiz.scheduledEnd && new Date(currentQuiz.scheduledEnd) < now) {
      return (
        <div className="panel p-8 text-center space-y-3 max-w-lg mx-auto">
          <AlertTriangle className="size-10 text-destructive mx-auto" />
          <h2 className="text-lg font-bold text-foreground">Quiz Window Has Closed</h2>
          <p className="text-xs text-muted-foreground">
            The deadline for this scheduled quiz was{" "}
            {new Date(currentQuiz.scheduledEnd).toLocaleString()}.
          </p>
          <Button asChild size="sm" variant="outline">
            <Link to="/quizzes">Back to quizzes</Link>
          </Button>
        </div>
      );
    }
  }

  const minutes = timeLeft !== null ? Math.floor(timeLeft / 60) : 0;
  const seconds = timeLeft !== null ? timeLeft % 60 : 0;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-border/70 pb-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link to="/quizzes" className="hover:text-foreground flex items-center gap-1">
            <ArrowLeft className="size-3.5" /> Back
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium">{currentQuiz.title}</span>
        </div>

        <div className="flex items-center gap-2">
          {isExam && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive font-semibold text-xs animate-pulse">
              <ShieldAlert className="size-3.5" />
              <span>Exam Lockdown Active</span>
            </div>
          )}

          {timeLeft !== null && (
            <div className="flex items-center gap-1.5 font-mono text-sm font-bold bg-secondary px-3 py-1 rounded-lg border border-border">
              <Clock className="size-4 text-primary" />
              <span>
                {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Header Info Panel */}
      <header className="panel p-6 bg-card border-border space-y-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {currentQuiz.title}
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              {(currentQuiz.questions || []).length} questions • Answer all questions before
              submitting.
            </p>
          </div>
          {isExam && !isFullscreen && (
            <Button
              size="sm"
              variant="outline"
              onClick={requestFullscreen}
              className="gap-1.5 text-xs"
            >
              <Maximize2 className="size-3.5" /> Fullscreen Mode
            </Button>
          )}
        </div>

        {isExam && (
          <div className="mt-3 p-3 rounded-lg border border-destructive/20 bg-destructive/5 text-xs text-destructive flex items-center gap-2 font-medium">
            <Lock className="size-4 shrink-0" />
            <span>
              <strong>Warning:</strong> Switching tabs, minimizing the browser, or clicking outside
              this window will immediately lock and submit your exam attempt.
            </span>
          </div>
        )}
      </header>

      {/* Questions Form */}
      <div className="space-y-4">
        {(currentQuiz.questions || []).map((q, idx) => {
          const selectedAnswer = answers[q.id] || "";

          return (
            <div key={q.id || idx} className="panel p-6 bg-card border-border space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <span className="font-mono text-xs font-bold text-muted-foreground bg-secondary px-2.5 py-1 rounded shrink-0">
                    Q{idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-foreground break-words leading-relaxed overflow-visible">
                      <RenderMathText text={q.text || ""} />
                    </div>
                    {q.imageUrl && (
                      <div className="mt-3 max-w-lg overflow-hidden rounded-lg border border-border/70 bg-secondary/15 p-1.5">
                        <img
                          src={q.imageUrl}
                          alt={`Question ${idx + 1} diagram`}
                          className="max-h-80 w-auto rounded object-contain"
                        />
                      </div>
                    )}
                  </div>
                </div>
                <span className="text-xs text-muted-foreground font-mono font-medium shrink-0 pt-0.5">
                  {q.points || 1} pt{(q.points || 1) === 1 ? "" : "s"}
                </span>
              </div>

              {/* Options */}
              {q.options && q.options.length > 0 ? (
                <div className="space-y-2 pt-1">
                  {q.options.map((opt, optIdx) => {
                    const isSelected = selectedAnswer === opt;

                    return (
                      <button
                        key={optIdx}
                        type="button"
                        onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: opt }))}
                        className={`w-full text-left p-3 rounded-lg border transition-all flex items-center gap-3 cursor-pointer ${
                          isSelected
                            ? "border-primary bg-primary/10 text-foreground font-medium shadow-xs"
                            : "border-border/80 bg-secondary/20 hover:bg-secondary/40 text-muted-foreground"
                        }`}
                      >
                        <div
                          className={`size-4 rounded-full border flex items-center justify-center transition-all ${
                            isSelected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-muted-foreground/40 bg-transparent"
                          }`}
                        >
                          {isSelected && <Check className="size-2.5 stroke-[3]" />}
                        </div>
                        <span className="text-xs flex-1">
                          <RenderMathText text={opt} className="inline" />
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="pt-1">
                  <Textarea
                    autoResize
                    placeholder="Type your answer here..."
                    value={selectedAnswer}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                    className="bg-card text-sm min-h-[40px]"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom Submit Actions */}
      <div className="pt-2 pb-16 flex justify-between items-center">
        <Button variant="outline" size="sm" asChild>
          <Link to="/quizzes/$quizId" params={{ quizId }}>
            Cancel
          </Link>
        </Button>

        <Button
          onClick={handleSubmit}
          disabled={submitQuiz.isPending || lockedOut}
          className="gap-2 bg-primary text-primary-foreground font-medium px-6 shadow-md"
        >
          {submitQuiz.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
          Submit Quiz Attempt
        </Button>
      </div>

      {/* Strict Lockdown Modal when student switches tabs */}
      <AlertDialog open={lockedOut}>
        <AlertDialogContent className="max-w-md border-destructive bg-card text-center p-6 space-y-4">
          <AlertDialogHeader className="items-center space-y-2">
            <div className="size-12 rounded-full bg-destructive/15 text-destructive flex items-center justify-center border border-destructive/30">
              <Lock className="size-6" />
            </div>
            <AlertDialogTitle className="text-xl font-bold text-destructive">
              EXAM LOCKED
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground">
              A forbidden action was detected:{" "}
              <strong>{lockReason || "Tab switch or window minimized"}</strong>.
              <br />
              <br />
              In strict final exam mode, leaving the examination tab is prohibited. Your exam
              attempt has been locked and automatically submitted for teacher review.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-center">
            <Button
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                void navigate({ to: "/quizzes/$quizId", params: { quizId } });
              }}
            >
              View Submission Status
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
