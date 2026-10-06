import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, Clock, Loader2, ShieldAlert } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  recordQuizViolation,
  saveQuizAnswers,
  startQuizAttempt,
  type TakeQuestion,
  type TakeSession,
} from "@/lib/quiz/attempt.functions";
import { submitQuizAttempt } from "@/lib/quiz/submit.functions";
import { awardAchievement } from "@/lib/firebase/firestore";
import { formatClock, TYPE_LABEL } from "@/lib/quiz/types";
import { getPressProps } from "@/lib/motionPresets";
import { RenderMathText } from "@/components/math/RenderMathText";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/quizzes/$quizId/take")({
  head: () => ({
    meta: [
      { title: "Take quiz — ONYX" },
      { name: "description", content: "Attempt a quiz in ONYX." },
      { property: "og:title", content: "Take quiz — ONYX" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

function Page() {
  const shouldReduceMotion = useReducedMotion();
  const { quizId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const start = useServerFn(startQuizAttempt);
  const saveAnswers = useServerFn(saveQuizAnswers);
  const recordViolation = useServerFn(recordQuizViolation);
  const submitAttempt = useServerFn(submitQuizAttempt);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<TakeSession | null>(null);
  const [responses, setResponses] = useState<Record<string, string[]>>({});
  const [index, setIndex] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [warnings, setWarnings] = useState(0);
  const [locked, setLocked] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittedRef = useRef(false);
  const responsesRef = useRef<Record<string, string[]>>({});
  responsesRef.current = responses;

  const quiz = session?.quiz ?? null;
  const questions: TakeQuestion[] = session?.questions ?? [];
  const attempt = session
    ? { id: session.attemptId, attemptNo: session.attemptNo, startedAt: session.startedAt }
    : null;

  // ---- start (or resume) the attempt on the server -----------------------
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const s = await start({ data: { quizId } });
        if (cancelled) return;
        setSession(s);
        setResponses(s.responses);
        // Anchor the countdown to the server clock so a wrong device clock can't extend it.
        skewRef.current = new Date(s.serverNow).getTime() - Date.now();
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not start this quiz.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [quizId, user, start]);

  const skewRef = useRef(0);
  const total = questions.length;
  const answeredCount = useMemo(
    () => questions.filter((q) => (responses[q.id] ?? []).some((v) => v.trim())).length,
    [questions, responses],
  );

  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pendingValues = useRef<Record<string, string[]>>({});
  const inflightSaves = useRef(new Set<Promise<unknown>>());

  const persist = useCallback(
    (questionId: string, value: string[]) => {
      if (!session) return Promise.resolve();
      return saveAnswers({ data: { attemptId: session.attemptId, answers: { [questionId]: value } } }).catch(
        () => undefined,
      );
    },
    [session, saveAnswers],
  );

  function track(save: Promise<unknown>) {
    inflightSaves.current.add(save);
    void save.finally(() => inflightSaves.current.delete(save));
  }

  function answer(questionId: string, value: string[], debounce = false) {
    setResponses((prev) => ({ ...prev, [questionId]: value }));
    const timers = saveTimers.current;
    if (timers[questionId]) clearTimeout(timers[questionId]);
    if (debounce) {
      pendingValues.current[questionId] = value;
      timers[questionId] = setTimeout(() => {
        delete pendingValues.current[questionId];
        track(persist(questionId, value));
      }, 600);
    } else {
      delete pendingValues.current[questionId];
      track(persist(questionId, value));
    }
  }

  const submit = useCallback(
    async (reason?: string, lockedReason?: string) => {
      if (!session || submittedRef.current) return;
      submittedRef.current = true;
      setSubmitting(true);
      try {
        Object.values(saveTimers.current).forEach((t) => clearTimeout(t));
        await Promise.allSettled([...inflightSaves.current]);
        // Send the final answers with the submit itself so nothing depends on autosave timing.
        const res = await submitAttempt({
          data: { attemptId: session.attemptId, answers: responsesRef.current, lockedReason },
        });
        if (res.needsManual) {
          toast.success("Submitted — your teacher will grade the written answers.");
        } else if (res.showResults && res.score !== null) {
          toast.success(`Submitted — you scored ${res.score}/${res.maxScore}.`);
        } else {
          toast.success("Submitted — your teacher will share the results.");
        }
        if (res.late) toast.warning("This attempt was submitted after the time limit.");
        if (reason) toast.warning(reason);
        if (user && res.maxScore && res.score !== null && res.score >= res.maxScore) {
          void awardAchievement(user.id, {
            id: "quiz_champ",
            title: "Quiz Prodigy",
            description: "Scored 100% on a quiz",
            icon: "Trophy",
            points: 150,
          }).catch(() => undefined);
        }
        void qc.invalidateQueries({ queryKey: ["quiz-submissions", quizId] });
        void qc.invalidateQueries({ queryKey: ["all-quizzes"] });
        void qc.invalidateQueries({ queryKey: ["quiz-detail", quizId] });
        await navigate({ to: "/quizzes/$quizId", params: { quizId } });
      } catch (e) {
        submittedRef.current = false;
        toast.error(e instanceof Error ? e.message : "Could not submit your attempt.");
      } finally {
        setSubmitting(false);
      }
    },
    [session, submitAttempt, navigate, quizId, qc, user],
  );

  // ---- countdown ----------------------------------------------------------
  useEffect(() => {
    if (!quiz?.timeLimitMinutes || !attempt) return;
    const deadline = new Date(attempt.startedAt).getTime() + quiz.timeLimitMinutes * 60_000;
    const tick = () => {
      const left = Math.floor((deadline - (Date.now() + skewRef.current)) / 1000);
      setRemaining(left);
      if (left <= 0) void submit("Time is up — your attempt was submitted automatically.");
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [quiz?.timeLimitMinutes, attempt?.startedAt, submit]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- lockdown -----------------------------------------------------------
  useEffect(() => {
    if (!quiz?.lockdownEnabled || !attempt || !user) return;
    let awaySince = 0;

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        awaySince = Date.now();
        return;
      }
      const away = awaySince ? Date.now() - awaySince : 0;
      awaySince = 0;
      setWarnings((prev) => {
        const next = prev + 1;
        void recordViolation({
          data: { attemptId: attempt.id, kind: "tab_switch", awayMs: away },
        }).catch(() => undefined);
        if (next >= 3) {
          setLocked("You left the quiz too many times. The attempt has been locked and submitted.");
          void submit("Attempt locked after repeated tab switches.", "Too many tab switches");
        } else {
          toast.warning(`Stay on this tab — warning ${next} of 3.`);
        }
        return next;
      });
    };

    const blockContext = (e: Event) => e.preventDefault();
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("contextmenu", blockContext);
    document.addEventListener("copy", blockContext);
    document.addEventListener("paste", blockContext);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("contextmenu", blockContext);
      document.removeEventListener("copy", blockContext);
      document.removeEventListener("paste", blockContext);
    };
  }, [quiz?.lockdownEnabled, attempt?.id, user, recordViolation, submit]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="panel space-y-3 p-10 text-center">
        <ShieldAlert className="mx-auto size-6 text-muted-foreground" aria-hidden />
        <h1 className="text-xl font-semibold tracking-tight">Can't start this quiz</h1>
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button asChild>
          <Link to="/quizzes">Back to quizzes</Link>
        </Button>
      </div>
    );
  }

  const current = questions[index];
  const response = current ? (responses[current.id] ?? []) : [];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="panel flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight">{quiz?.title}</h1>
          <p className="text-xs text-muted-foreground">
            Attempt {attempt?.attemptNo} · {answeredCount} of {total} answered
          </p>
        </div>
        <div className="flex items-center gap-3">
          {quiz?.lockdownEnabled && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs">
              <ShieldAlert className="size-3.5" /> Lockdown
            </span>
          )}
          {remaining !== null && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium tabular-nums ${
                remaining < 60 ? "bg-destructive/15 text-destructive" : "bg-muted"
              }`}
            >
              <Clock className="size-4" /> {formatClock(remaining)}
            </span>
          )}
        </div>
      </header>

      <Progress value={total ? (answeredCount / total) * 100 : 0} />

      {warnings > 0 && !locked && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          Leaving this tab is recorded. Warning {warnings} of 3 — the attempt locks after that.
        </div>
      )}

      {locked ? (
        <div className="panel space-y-2 p-10 text-center">
          <ShieldAlert className="mx-auto size-6 text-destructive" aria-hidden />
          <h2 className="text-lg font-semibold">Attempt locked</h2>
          <p className="text-sm text-muted-foreground">{locked}</p>
        </div>
      ) : (
        current && (
          <div className="panel space-y-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Question {index + 1} of {total} · {TYPE_LABEL[current.type]}
              </p>
              <span className="text-xs text-muted-foreground">
                {current.points} mark{current.points === 1 ? "" : "s"}
              </span>
            </div>
            <div className="whitespace-pre-wrap text-base font-medium">
              <RenderMathText text={current.prompt} />
            </div>

            {(current.type === "mcq" || current.type === "true_false") && (
              <div className="space-y-2">
                {current.options.map((opt) => (
                  <label
                    key={opt}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition-colors ${
                      response.includes(opt)
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <input
                      type="radio"
                      name={`q-${current.id}`}
                      className="accent-primary"
                      checked={response.includes(opt)}
                      onChange={() => answer(current.id, [opt])}
                    />
                    <RenderMathText text={opt} />
                  </label>
                ))}
              </div>
            )}

            {current.type === "multi_select" && (
              <div className="space-y-2">
                {current.options.map((opt) => (
                  <label
                    key={opt}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition-colors ${
                      response.includes(opt)
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <Checkbox
                      checked={response.includes(opt)}
                      onCheckedChange={() =>
                        answer(
                          current.id,
                          response.includes(opt)
                            ? response.filter((r) => r !== opt)
                            : [...response, opt],
                        )
                      }
                    />
                    <RenderMathText text={opt} />
                  </label>
                ))}
              </div>
            )}

            {(current.type === "fill_blank" || current.type === "short_answer") && (
              <Input
                value={response[0] ?? ""}
                onChange={(e) => answer(current.id, [e.target.value], true)}
                placeholder="Type your answer"
              />
            )}

            {current.type === "essay" && (
              <Textarea
                value={response[0] ?? ""}
                onChange={(e) => answer(current.id, [e.target.value], true)}
                placeholder="Write your response"
                className="min-h-48"
              />
            )}

            <div className="flex items-center justify-between gap-3 pt-2">
              <Button
                variant="outline"
                disabled={index === 0}
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
              >
                Previous
              </Button>
              {index < total - 1 ? (
                <Button onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}>Next</Button>
              ) : (
                <Button onClick={() => setConfirming(true)} disabled={submitting}>
                  {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Submit quiz
                </Button>
              )}
            </div>
          </div>
        )
      )}

      {!locked && (
        <div className="flex flex-wrap gap-1.5">
          {questions.map((q, i) => {
            const done = (responses[q.id] ?? []).some((v) => v.trim());
            return (
              <motion.button
                key={q.id}
                type="button"
                {...getPressProps(shouldReduceMotion, { hoverScale: 1.08, tapScale: 0.94 })}
                onClick={() => setIndex(i)}
                aria-label={`Go to question ${i + 1}`}
                aria-current={i === index}
                className={`size-8 rounded-md border text-xs font-medium cursor-pointer transition-colors ${
                  i === index
                    ? "border-primary bg-primary text-primary-foreground"
                    : done
                      ? "border-primary/40 bg-primary/10"
                      : "border-border hover:bg-muted"
                }`}
              >
                {i + 1}
              </motion.button>
            );
          })}
        </div>
      )}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit this attempt?</AlertDialogTitle>
            <AlertDialogDescription>
              You answered {answeredCount} of {total} questions. You can't change your answers after
              submitting.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep working</AlertDialogCancel>
            <AlertDialogAction onClick={() => void submit()}>Submit</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
