import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Plus, Save, Users, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  blankQuestion,
  KIND_LABEL,
  type Difficulty,
  type QuestionDraft,
  type QuestionType,
  type QuizKind,
} from "@/lib/quiz/types";
import { generateQuizQuestions, regenerateQuizQuestion } from "@/lib/quiz/ai.functions";
import {
  getQuizReviewAttempt,
  getQuizReviewAttempts,
  type QuizReviewAttemptDetail,
} from "@/lib/quiz/review.functions";
import { percent } from "@/lib/quiz/types";
import { fromDrafts, toDrafts } from "@/lib/quiz/model";
import { getClass, getQuiz, saveQuestionToBank, updateQuiz } from "@/lib/firebase/firestore";
import { QuestionEditor } from "@/components/quiz/QuestionEditor";
import { AiGeneratorPanel, type GenerationOptions } from "@/components/quiz/AiGeneratorPanel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/quizzes/$quizId/edit")({
  head: () => ({
    meta: [
      { title: "Quiz builder — ONYX" },
      { name: "description", content: "Build and publish quizzes in ONYX." },
      { property: "og:title", content: "Quiz builder — ONYX" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

type Settings = {
  title: string;
  description: string;
  kind: QuizKind;
  time_limit_minutes: number | null;
  max_attempts: number;
  passing_marks: number;
  lockdown_enabled: boolean;
  randomize_questions: boolean;
  randomize_choices: boolean;
  show_results: boolean;
  start_at: string | null;
  end_at: string | null;
};

function toLocalInput(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type ReviewAttemptFn = (args: { data: { attemptId: string } }) => Promise<QuizReviewAttemptDetail>;

function AttemptReview({
  attemptId,
  reviewAttempt,
  onClose,
}: {
  attemptId: string;
  reviewAttempt: ReviewAttemptFn;
  onClose: () => void;
}) {
  const detail = useQuery({
    queryKey: ["quiz-review-attempt", attemptId],
    queryFn: () => reviewAttempt({ data: { attemptId } }),
    staleTime: 15_000,
  });

  return (
    <div className="panel space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Attempt review</p>
          <h3 className="mt-1 text-lg font-semibold">
            {detail.data?.student_name ?? "Student"}
          </h3>
          {detail.data && (
            <p className="text-sm text-muted-foreground">
              Attempt {detail.data.attempt.attempt_no} ·{" "}
              {detail.data.attempt.score != null && detail.data.attempt.max_score != null
                ? `${detail.data.attempt.score}/${detail.data.attempt.max_score} · ${percent(
                    detail.data.attempt.score,
                    detail.data.attempt.max_score,
                  )}%`
                : "Not graded"}
            </p>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close attempt review">
          <X className="size-4" />
        </Button>
      </div>

      {detail.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      ) : detail.isError ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          Could not load this student's answers. {(detail.error as Error).message}
        </div>
      ) : (
        <div className="space-y-3">
          {detail.data?.answers.map((answer) => (
            <div key={answer.question_id} className="rounded-xl border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Question {answer.position + 1} · {answer.type.replace("_", " ")}
                </p>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {answer.awarded_points != null
                    ? `${answer.awarded_points}/${answer.points}`
                    : `—/${answer.points}`}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm font-medium">{answer.prompt}</p>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Student's answer
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">
                    {answer.response.length ? answer.response.join(", ") : "No answer"}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Correct answer
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">
                    {answer.correct.length ? answer.correct.join(", ") : "No answer key"}
                  </p>
                </div>
              </div>

              <div className="mt-3">
                <Badge
                  variant={
                    answer.is_correct === true
                      ? "default"
                      : answer.is_correct === false
                        ? "destructive"
                        : "outline"
                  }
                >
                  {answer.is_correct === true
                    ? "Correct"
                    : answer.is_correct === false
                      ? "Incorrect"
                      : answer.id
                        ? "Needs manual grading"
                        : "Unanswered"}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Page() {
  const { quizId } = Route.useParams();
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const generate = useServerFn(generateQuizQuestions);
  const regenerate = useServerFn(regenerateQuizQuestion);
  const reviewAttempts = useServerFn(getQuizReviewAttempts);
  const reviewAttempt = useServerFn(getQuizReviewAttempt);

  const [settings, setSettings] = useState<Settings | null>(null);
  const [questions, setQuestions] = useState<QuestionDraft[]>([]);
  const [material, setMaterial] = useState("");
  const [regenIndex, setRegenIndex] = useState<number | null>(null);
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null);

  const quiz = useQuery({
    queryKey: ["quiz-edit", quizId],
    queryFn: async () => {
      const res = await getQuiz(quizId, true);
      if (!res) throw new Error("Quiz not found");
      const klass = await getClass(res.quiz.classId).catch(() => null);
      return { ...res, className: klass?.name ?? "Class" };
    },
  });

  useEffect(() => {
    if (!quiz.data || settings) return;
    const q = quiz.data.quiz;
    setSettings({
      title: q.title,
      description: q.description ?? "",
      kind: (q.kind ?? (q.timeLimit ? "timed" : "practice")) as QuizKind,
      time_limit_minutes: q.timeLimit ? q.timeLimit : null,
      max_attempts: q.maxAttempts ?? 1,
      passing_marks: q.passingMarks ?? 0,
      lockdown_enabled: Boolean(q.lockdownEnabled),
      randomize_questions: Boolean(q.randomizeQuestions),
      randomize_choices: Boolean(q.randomizeChoices),
      show_results: q.showResults !== false,
      start_at: q.startAt ?? null,
      end_at: q.endAt ?? null,
    });
    setQuestions(toDrafts(q, quiz.data.answerKey));
  }, [quiz.data, settings]);

  const totalMarks = useMemo(
    () => questions.reduce((sum, q) => sum + (Number(q.points) || 0), 0),
    [questions],
  );

  const attempts = useQuery({
    queryKey: ["quiz-review-attempts", quizId],
    enabled: Boolean(user),
    queryFn: () => reviewAttempts({ data: { quizId } }),
    staleTime: 15_000,
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!settings) return;
      const stored = fromDrafts(questions);
      await updateQuiz(
        quizId,
        {
          title: settings.title.trim(),
          description: settings.description.trim(),
          kind: settings.kind,
          timeLimit: settings.time_limit_minutes ?? 0,
          maxAttempts: settings.max_attempts,
          passingMarks: settings.passing_marks,
          lockdownEnabled: settings.lockdown_enabled,
          randomizeQuestions: settings.randomize_questions,
          randomizeChoices: settings.randomize_choices,
          showResults: settings.show_results,
          startAt: settings.start_at,
          endAt: settings.end_at,
          questions: stored.questions,
          totalMarks: stored.questions.reduce((n, q) => n + q.points, 0),
        },
        stored.answers,
        { correct: stored.correct, explanations: stored.explanations },
      );
    },
    onSuccess: async () => {
      toast.success("Quiz saved");
      await qc.invalidateQueries({ queryKey: ["quiz-edit", quizId] });
      await qc.invalidateQueries({ queryKey: ["teacher-quizzes"] });
      await qc.invalidateQueries({ queryKey: ["quiz-detail", quizId] });
      setSettings(null); // re-seed from the saved copy (new questions get permanent ids)
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const publish = useMutation({
    mutationFn: async (published: boolean) => {
      // Publishing with unsaved edits would hide them from students, so save first.
      if (published && settings) await save.mutateAsync();
      await updateQuiz(quizId, { published });
      return published;
    },
    onSuccess: async (published) => {
      toast.success(published ? "Quiz published" : "Quiz unpublished");
      await qc.invalidateQueries({ queryKey: ["quiz-edit", quizId] });
      await qc.invalidateQueries({ queryKey: ["teacher-quizzes"] });
      await qc.invalidateQueries({ queryKey: ["class-quizzes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const aiGenerate = useMutation({
    mutationFn: async (opts: GenerationOptions) =>
      generate({
        data: {
          material: opts.material,
          count: opts.count,
          difficulty: opts.difficulty,
          types: opts.types,
          withExplanations: opts.withExplanations,
          topic: opts.topic || undefined,
          avoid: questions.map((q) => q.prompt).filter(Boolean),
        },
      }),
    onSuccess: (res) => {
      const added = res.questions.map((q) => ({
        ...blankQuestion(q.type as QuestionType),
        type: q.type as QuestionType,
        difficulty: q.difficulty as Difficulty,
        prompt: q.prompt,
        options: q.options,
        correct: q.correct,
        explanation: q.explanation,
        points: q.points,
      }));
      setQuestions((prev) => [...prev, ...added]);
      toast.success(`Added ${added.length} question${added.length === 1 ? "" : "s"}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function regenerateAt(index: number) {
    const target = questions[index];
    if (!target) return;
    if (material.trim().length < 40) {
      toast.error("Add study material in the AI tab first.");
      return;
    }
    setRegenIndex(index);
    try {
      const res = await regenerate({
        data: {
          material,
          count: 1,
          difficulty: target.difficulty,
          types: [target.type],
          withExplanations: true,
          avoid: questions.map((q) => q.prompt).filter(Boolean),
        },
      });
      const q = res.question;
      setQuestions((prev) =>
        prev.map((item, i) =>
          i === index
            ? {
                ...item,
                type: q.type as QuestionType,
                difficulty: q.difficulty as Difficulty,
                prompt: q.prompt,
                options: q.options,
                correct: q.correct,
                explanation: q.explanation,
                points: q.points,
              }
            : item,
        ),
      );
      toast.success("Question regenerated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not regenerate");
    } finally {
      setRegenIndex(null);
    }
  }

  async function saveToBank(index: number) {
    const q = questions[index];
    if (!q || !user) return;
    try {
      await saveQuestionToBank(user.id, q);
      void qc.invalidateQueries({ queryKey: ["question-bank", user.id] });
      toast.success("Saved to question bank");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save to the question bank");
    }
  }

  if (quiz.isError) {
    return (
      <div className="panel p-6 text-sm text-destructive">
        Couldn't load this quiz. {(quiz.error as Error).message}
      </div>
    );
  }

  if (quiz.isLoading || !settings) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  const isOwner = quiz.data!.quiz.createdBy === user?.id || role === "admin";
  if (!isOwner) {
    return (
      <div className="panel space-y-3 p-10 text-center">
        <h1 className="text-xl font-semibold">Not available</h1>
        <p className="text-sm text-muted-foreground">Only the quiz owner can edit this quiz.</p>
        <Button onClick={() => void navigate({ to: "/quizzes" })}>Back to quizzes</Button>
      </div>
    );
  }

  // Quizzes created before drafts existed have no flag and are already visible to students.
  const published = quiz.data!.quiz.published !== false;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
            <Link to="/quizzes">
              <ArrowLeft className="mr-1.5 size-4" /> Quizzes
            </Link>
          </Button>
          <h1 className="truncate text-2xl font-semibold tracking-tight">{settings.title}</h1>
          <p className="text-sm text-muted-foreground">
            {quiz.data!.className} · {questions.length} question
            {questions.length === 1 ? "" : "s"} · {totalMarks} marks
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/quizzes/$quizId" params={{ quizId }}>
              Overview
            </Link>
          </Button>
          <Button
            variant={published ? "ghost" : "secondary"}
            disabled={publish.isPending || (!published && questions.length === 0)}
            onClick={() => publish.mutate(!published)}
          >
            {published ? "Unpublish" : "Publish"}
          </Button>
          <Button disabled={save.isPending || !settings.title.trim()} onClick={() => save.mutate()}>
            {save.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Save className="mr-2 size-4" />
            )}
            Save
          </Button>
        </div>
      </header>

      <Tabs defaultValue="questions">
        <TabsList>
          <TabsTrigger value="questions">Questions ({questions.length})</TabsTrigger>
          <TabsTrigger value="attempts">Attempts</TabsTrigger>
          <TabsTrigger value="ai">AI generator</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="questions" className="mt-4 space-y-3">
          {questions.length === 0 && (
            <div className="panel p-10 text-center">
              <p className="font-medium">No questions yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add one manually or generate a set from your notes in the AI generator tab.
              </p>
            </div>
          )}
          {questions.map((q, i) => (
            <QuestionEditor
              key={q.id}
              index={i}
              question={q}
              regenerating={regenIndex === i}
              onChange={(next) => setQuestions((prev) => prev.map((x, j) => (j === i ? next : x)))}
              onDelete={() => setQuestions((prev) => prev.filter((_, j) => j !== i))}
              onMove={(dir) =>
                setQuestions((prev) => {
                  const target = i + dir;
                  if (target < 0 || target >= prev.length) return prev;
                  const next = [...prev];
                  [next[i], next[target]] = [next[target]!, next[i]!];
                  return next;
                })
              }
              onRegenerate={() => void regenerateAt(i)}
              onSaveToBank={() => void saveToBank(i)}
            />
          ))}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setQuestions((p) => [...p, blankQuestion()])}>
              <Plus className="mr-2 size-4" /> Add question
            </Button>
            <Button variant="outline" asChild>
              <Link to="/question-bank" search={{ quizId }}>
                Add from Question Bank
              </Link>
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="attempts" className="mt-4 space-y-4">
          {attempts.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-20 w-full rounded-xl" />
            </div>
          ) : attempts.isError ? (
            <div className="panel p-5 text-sm text-destructive">
              Could not load student attempts. {(attempts.error as Error).message}
            </div>
          ) : (
            (() => {
              const rows = attempts.data?.attempts ?? [];
              const names = attempts.data?.names ?? {};
              const studentIds = new Set(rows.map((a) => a.student_id));
              const graded = rows.filter((a) => a.score != null && a.max_score);
              const average = graded.length
                ? Math.round(
                    graded.reduce(
                      (sum, a) => sum + percent(a.score ?? 0, a.max_score ?? 0),
                      0,
                    ) / graded.length,
                  )
                : null;

              return (
                <>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="panel p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Students attempted
                      </p>
                      <p className="mt-1 text-xl font-semibold">{studentIds.size}</p>
                    </div>
                    <div className="panel p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Total attempts
                      </p>
                      <p className="mt-1 text-xl font-semibold">{rows.length}</p>
                    </div>
                    <div className="panel p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Average score
                      </p>
                      <p className="mt-1 text-xl font-semibold">
                        {average === null ? "—" : `${average}%`}
                      </p>
                    </div>
                  </div>

                  {rows.length === 0 ? (
                    <div className="panel p-10 text-center">
                      <Users className="mx-auto mb-2 size-6 text-muted-foreground" />
                      <p className="font-medium">No students have attempted this quiz yet.</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Submitted and in-progress attempts will appear here automatically.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="panel divide-y divide-border">
                        {rows.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => setSelectedAttemptId(a.id)}
                            className="flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-muted/40"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                {names[a.student_id] ?? "Student"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Attempt {a.attempt_no} ·{" "}
                                {a.submitted_at
                                  ? new Date(a.submitted_at).toLocaleString()
                                  : "In progress"}
                              </p>
                            </div>
                            <div className="flex items-center gap-3 text-sm">
                              <Badge
                                variant={a.status === "graded" ? "default" : "outline"}
                              >
                                {a.status.replace("_", " ")}
                              </Badge>
                              <span className="tabular-nums font-medium">
                                {a.score != null && a.max_score != null
                                  ? `${a.score}/${a.max_score} · ${percent(
                                      a.score,
                                      a.max_score,
                                    )}%`
                                  : "Not graded"}
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>

                      {selectedAttemptId && (
                        <AttemptReview
                          attemptId={selectedAttemptId}
                          reviewAttempt={reviewAttempt}
                          onClose={() => setSelectedAttemptId(null)}
                        />
                      )}
                    </>
                  )}
                </>
              );
            })()
          )}
        </TabsContent>

        <TabsContent value="ai" className="mt-4">
          <div className="panel p-5">
            <AiGeneratorPanel
              busy={aiGenerate.isPending}
              material={material}
              onMaterialChange={setMaterial}
              onGenerate={(opts) => aiGenerate.mutate(opts)}
            />
          </div>
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <div className="panel space-y-5 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="s-title">Title</Label>
                <Input
                  id="s-title"
                  value={settings.title}
                  onChange={(e) => setSettings({ ...settings, title: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s-kind">Type</Label>
                <Select
                  value={settings.kind}
                  onValueChange={(v) => setSettings({ ...settings, kind: v as QuizKind })}
                >
                  <SelectTrigger id="s-kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(KIND_LABEL) as QuizKind[]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {KIND_LABEL[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="s-desc">Instructions</Label>
              <Textarea
                id="s-desc"
                value={settings.description}
                onChange={(e) => setSettings({ ...settings, description: e.target.value })}
                className="min-h-20"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="s-time">Time limit (minutes)</Label>
                <Input
                  id="s-time"
                  type="number"
                  min={0}
                  value={settings.time_limit_minutes ?? ""}
                  placeholder="No limit"
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      time_limit_minutes: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s-att">Max attempts</Label>
                <Input
                  id="s-att"
                  type="number"
                  min={1}
                  value={settings.max_attempts}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      max_attempts: Math.max(1, Number(e.target.value) || 1),
                    })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s-pass">Passing marks</Label>
                <Input
                  id="s-pass"
                  type="number"
                  min={0}
                  value={settings.passing_marks}
                  onChange={(e) =>
                    setSettings({ ...settings, passing_marks: Number(e.target.value) || 0 })
                  }
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="s-start">Opens at</Label>
                <Input
                  id="s-start"
                  type="datetime-local"
                  value={toLocalInput(settings.start_at)}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      start_at: e.target.value ? new Date(e.target.value).toISOString() : null,
                    })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s-end">Closes at</Label>
                <Input
                  id="s-end"
                  type="datetime-local"
                  value={toLocalInput(settings.end_at)}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      end_at: e.target.value ? new Date(e.target.value).toISOString() : null,
                    })
                  }
                />
              </div>
            </div>

            <div className="space-y-3">
              {(
                [
                  [
                    "lockdown_enabled",
                    "Lockdown mode",
                    "Warn and lock the attempt if the student leaves the tab.",
                  ],
                  [
                    "randomize_questions",
                    "Shuffle questions",
                    "Each student sees a different order.",
                  ],
                  ["randomize_choices", "Shuffle options", "Randomise answer choices per student."],
                  [
                    "show_results",
                    "Show results",
                    "Let students see their score after submitting.",
                  ],
                ] as const
              ).map(([key, label, hint]) => (
                <div key={key} className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{hint}</p>
                  </div>
                  <Switch
                    checked={settings[key]}
                    onCheckedChange={(v) => setSettings({ ...settings, [key]: v })}
                    aria-label={label}
                  />
                </div>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
