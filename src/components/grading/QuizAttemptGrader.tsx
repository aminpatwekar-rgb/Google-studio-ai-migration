import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CornerDownLeft, Loader2, SkipForward, X } from "lucide-react";
import { toast } from "sonner";
import { getQuizAttemptForGrading, saveQuizAttemptGrade } from "@/lib/grading/quiz.functions";
import { percentOf, type QuizGradingAnswer } from "@/lib/grading/types";
import { RenderMathText } from "@/components/math/RenderMathText";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Entry = { points: string; feedback: string };

const TYPE_LABEL: Record<string, string> = {
  essay: "Essay",
  short_answer: "Short answer",
  fill_blank: "Fill in the blank",
  mcq: "Multiple choice",
  multi_select: "Multi-select",
  true_false: "True / false",
};

const num = (v: string) => (v.trim() === "" ? null : Number(v));

/** Marks the written answers of one quiz attempt; automatic marks are shown but locked. */
export function QuizAttemptGrader({
  attemptId,
  hasNext,
  onDone,
  onSkip,
}: {
  attemptId: string;
  hasNext: boolean;
  onDone: () => void;
  onSkip: () => void;
}) {
  const qc = useQueryClient();
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [hydrated, setHydrated] = useState(false);

  const q = useQuery({
    queryKey: ["grading", "quiz-attempt", attemptId],
    queryFn: () => getQuizAttemptForGrading({ data: { attemptId } }),
  });

  useEffect(() => {
    if (hydrated || !q.data) return;
    const next: Record<string, Entry> = {};
    for (const a of q.data.answers) {
      if (!a.manual) continue;
      next[a.question_id] = {
        points: a.awarded_points == null ? "" : String(a.awarded_points),
        feedback: a.feedback ?? "",
      };
    }
    setEntries(next);
    setHydrated(true);
  }, [q.data, hydrated]);

  const parts = useMemo(() => {
    const answers = q.data?.answers ?? [];
    const manual = answers.filter((a) => a.manual);
    const marked = manual.filter((a) => a.response.some((r) => r.trim()) || a.answer_id !== null);
    const auto = answers.filter((a) => !a.manual);
    const autoScore = auto.reduce((n, a) => n + (a.awarded_points ?? 0), 0);
    const max = answers.reduce((n, a) => n + a.points, 0);
    return { manual, marked, auto, autoScore, max };
  }, [q.data]);

  const save = useMutation({
    mutationFn: async (mode: "all" | "progress") => {
      const grades = parts.marked
        .map((a) => ({ a, e: entries[a.question_id] }))
        .filter(({ e }) => e && num(e.points) !== null)
        .map(({ a, e }) => ({
          questionId: a.question_id,
          points: num(e!.points) as number,
          feedback: e!.feedback,
        }));
      for (const g of grades) {
        const max = parts.marked.find((a) => a.question_id === g.questionId)?.points ?? 0;
        if (!Number.isFinite(g.points) || g.points < 0 || g.points > max)
          throw new Error(`Marks must be between 0 and ${max}`);
      }
      if (mode === "all" && grades.length < parts.marked.length)
        throw new Error("Enter marks for every written answer, or use Save progress");
      if (grades.length === 0) throw new Error("Enter marks for at least one answer");
      return saveQuizAttemptGrade({ data: { attemptId, grades } });
    },
    onSuccess: (result) => {
      toast.success(
        result.finished
          ? `Graded: ${result.score} / ${result.max}`
          : "Progress saved. Some answers still need marks",
      );
      void qc.invalidateQueries();
      if (result.finished) onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <div className="panel p-6 text-sm text-muted-foreground">
        {q.error instanceof Error ? q.error.message : "This attempt could not be loaded."}
      </div>
    );
  }

  const { attempt } = q.data;
  const entered = parts.marked.reduce(
    (n, a) => n + (num(entries[a.question_id]?.points ?? "") ?? 0),
    0,
  );
  const total = parts.autoScore + entered;
  const pct = percentOf(total, parts.max);
  const busy = save.isPending;
  const wasGraded = attempt.status === "graded";

  const setEntry = (id: string, patch: Partial<Entry>) =>
    setEntries((prev) => ({ ...prev, [id]: { points: "", feedback: "", ...prev[id], ...patch } }));

  return (
    <div className="space-y-5">
      <div className="panel grid grid-cols-3 divide-x divide-border p-0 text-center">
        <Stat
          label="Automatic"
          value={`${parts.autoScore}`}
          sub={`${parts.auto.length} question${parts.auto.length === 1 ? "" : "s"}`}
        />
        <Stat label="Written" value={`${entered}`} sub={`${parts.marked.length} to mark`} />
        <Stat
          label="Total"
          value={`${total} / ${parts.max}`}
          sub={pct === null ? "" : `${pct}%`}
          strong
        />
      </div>

      {parts.manual.length === 0 && (
        <div className="panel p-6 text-center text-sm text-muted-foreground">
          Every answer in this attempt was graded automatically. There&apos;s nothing to mark by
          hand.
        </div>
      )}

      {parts.manual.map((a) => (
        <WrittenAnswer
          key={a.question_id}
          answer={a}
          entry={entries[a.question_id] ?? { points: "", feedback: "" }}
          onChange={(patch) => setEntry(a.question_id, patch)}
        />
      ))}

      {parts.auto.length > 0 && (
        <details className="panel p-4">
          <summary className="cursor-pointer text-sm font-medium">
            Automatically graded answers ({parts.auto.length})
          </summary>
          <ul className="mt-3 divide-y divide-border">
            {parts.auto.map((a) => (
              <li key={a.question_id} className="flex items-start gap-3 py-3">
                <span
                  className={cn(
                    "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
                    a.is_correct
                      ? "bg-success/15 text-success"
                      : "bg-destructive/15 text-destructive",
                  )}
                >
                  {a.is_correct ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                </span>
                <div className="min-w-0 flex-1 text-sm">
                  <RenderMathText text={a.prompt} />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Answered: {a.response.length ? a.response.join(", ") : "no answer"}
                  </p>
                </div>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {a.awarded_points ?? 0}/{a.points}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {parts.marked.length > 0 && (
        <div className="sticky bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-30 lg:bottom-4">
          <div className="panel glass flex flex-wrap items-center gap-2 p-3 shadow-lg">
            <Button onClick={() => save.mutate("all")} disabled={busy} className="gap-1.5">
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CornerDownLeft className="size-4" />
              )}
              {wasGraded ? "Update grade" : hasNext ? "Save & next" : "Save grade"}
            </Button>
            <Button variant="outline" onClick={() => save.mutate("progress")} disabled={busy}>
              Save progress
            </Button>
            {hasNext && (
              <Button variant="ghost" onClick={onSkip} disabled={busy} className="ml-auto gap-1.5">
                <SkipForward className="size-4" /> Skip
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  strong,
}: {
  label: string;
  value: string;
  sub: string;
  strong?: boolean;
}) {
  return (
    <div className="px-3 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 tabular-nums",
          strong ? "text-2xl font-semibold" : "text-xl font-medium",
        )}
      >
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function WrittenAnswer({
  answer,
  entry,
  onChange,
}: {
  answer: QuizGradingAnswer;
  entry: Entry;
  onChange: (patch: Partial<Entry>) => void;
}) {
  const answered = answer.response.some((r) => r.trim()) || answer.answer_id !== null;
  const value = num(entry.points);
  const invalid = value !== null && (!Number.isFinite(value) || value < 0 || value > answer.points);
  const half = Math.round(answer.points * 1) / 2;
  const chips = [
    { label: "Full", v: answer.points },
    { label: "Half", v: half },
    { label: "0", v: 0 },
  ].filter((c, i, all) => all.findIndex((x) => x.v === c.v) === i);

  return (
    <section className="panel space-y-4 p-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Question {answer.position + 1} · {TYPE_LABEL[answer.type] ?? answer.type}
        </p>
        <span className="text-xs text-muted-foreground">
          {answer.points} mark{answer.points === 1 ? "" : "s"}
        </span>
      </header>

      <RenderMathText text={answer.prompt} className="font-medium leading-7" />

      <div className="rounded-lg border border-border bg-muted/30 p-4">
        {answered && answer.response.some((r) => r.trim()) ? (
          <RenderMathText text={answer.response.join("\n")} className="text-[15px] leading-7" />
        ) : (
          <p className="text-sm italic text-muted-foreground">The student left this blank.</p>
        )}
      </div>

      {answer.correct.some((c) => c.trim()) && (
        <p className="text-xs text-muted-foreground">
          Expected: <span className="text-foreground">{answer.correct.join(", ")}</span>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-baseline gap-2">
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            max={answer.points}
            step={0.5}
            value={entry.points}
            onChange={(e) => onChange({ points: e.target.value })}
            aria-label={`Marks for question ${answer.position + 1}`}
            aria-invalid={invalid}
            className={cn(
              "h-11 w-24 text-center text-lg font-semibold",
              invalid && "border-destructive",
            )}
          />
          <span className="text-sm text-muted-foreground">/ {answer.points}</span>
        </div>
        <div className="flex gap-1.5" role="group" aria-label="Quick marks">
          {chips.map((c) => (
            <Button
              key={c.label}
              type="button"
              size="sm"
              variant={value === c.v ? "default" : "outline"}
              onClick={() => onChange({ points: String(c.v) })}
            >
              {c.label}
            </Button>
          ))}
        </div>
      </div>
      {invalid && (
        <p className="-mt-2 text-xs text-destructive">
          Marks must be between 0 and {answer.points}.
        </p>
      )}

      <Textarea
        value={entry.feedback}
        onChange={(e) => onChange({ feedback: e.target.value })}
        maxLength={2000}
        placeholder="Comment for this answer (optional)"
        aria-label={`Comment for question ${answer.position + 1}`}
        className="min-h-16"
      />
    </section>
  );
}
