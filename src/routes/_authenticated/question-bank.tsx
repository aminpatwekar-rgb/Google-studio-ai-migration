import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  query as fsQuery,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/lib/auth";
import { getQuiz, updateQuiz } from "@/lib/firebase/firestore";
import { fromDrafts, toDrafts } from "@/lib/quiz/model";
import { tempId } from "@/lib/quiz/types";
import { QUESTION_TYPES, DIFFICULTIES, type QuestionType, type Difficulty } from "@/lib/quiz/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type QB = {
  id: string;
  type: QuestionType;
  difficulty: Difficulty;
  prompt: string;
  options: string[];
  correct: string[];
  explanation: string | null;
  points: number;
  subject: string | null;
  tags: string[];
};

export const Route = createFileRoute("/_authenticated/question-bank")({
  validateSearch: (search: Record<string, unknown>) => ({
    quizId: typeof search.quizId === "string" ? search.quizId : undefined,
  }),
  head: () => ({ meta: [{ title: "Question Bank — ONYX" }] }),
  component: Page,
});

function Page() {
  const { user } = useAuth();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [difficulty, setDifficulty] = useState("all");
  const [open, setOpen] = useState(false);
  const [addedIds, setAddedIds] = useState<string[]>([]);

  // Opened from a quiz's "Add from Question Bank": each card gets an "Add to quiz" button.
  const addToQuiz = useMutation({
    mutationFn: async (q: QB) => {
      if (!search.quizId) throw new Error("No quiz selected");
      const res = await getQuiz(search.quizId, true);
      if (!res) throw new Error("Quiz not found");
      const drafts = [
        ...toDrafts(res.quiz, res.answerKey),
        {
          id: tempId(),
          type: q.type,
          difficulty: q.difficulty,
          prompt: q.prompt,
          options: q.options ?? [],
          correct: q.correct ?? [],
          explanation: q.explanation ?? "",
          points: Number(q.points) || 1,
        },
      ];
      const stored = fromDrafts(drafts);
      await updateQuiz(
        search.quizId,
        {
          questions: stored.questions,
          totalMarks: stored.questions.reduce((n, x) => n + x.points, 0),
        },
        stored.answers,
        { correct: stored.correct, explanations: stored.explanations },
      );
      return q.id;
    },
    onSuccess: (id) => {
      setAddedIds((prev) => [...prev, id]);
      toast.success("Added to quiz");
      void qc.invalidateQueries({ queryKey: ["quiz-edit", search.quizId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const [editing, setEditing] = useState<QB | null>(null);
  const [form, setForm] = useState({
    type: "mcq",
    difficulty: "medium",
    prompt: "",
    options: "",
    correct: "",
    explanation: "",
    points: "1",
    subject: "",
    tags: "",
  });

  const questions = useQuery({
    queryKey: ["question-bank", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      if (!user) return [];
      try {
        const snap = await getDocs(
          fsQuery(collection(db, "question_bank"), where("owner_id", "==", user.id)),
        );
        return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as QB[];
      } catch {
        return [];
      }
    },
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (questions.data ?? []).filter(
      (x) =>
        (!q ||
          x.prompt.toLowerCase().includes(q) ||
          (x.subject ?? "").toLowerCase().includes(q) ||
          (x.tags ?? []).some((t) => t.toLowerCase().includes(q))) &&
        (type === "all" || x.type === type) &&
        (difficulty === "all" || x.difficulty === difficulty),
    );
  }, [questions.data, query, type, difficulty]);

  function reset(q?: QB) {
    setEditing(q ?? null);
    setForm(
      q
        ? {
            type: q.type,
            difficulty: q.difficulty,
            prompt: q.prompt,
            options: (q.options ?? []).join("\n"),
            correct: (q.correct ?? []).join("\n"),
            explanation: q.explanation ?? "",
            points: String(q.points),
            subject: q.subject ?? "",
            tags: (q.tags ?? []).join(", "),
          }
        : {
            type: "mcq",
            difficulty: "medium",
            prompt: "",
            options: "",
            correct: "",
            explanation: "",
            points: "1",
            subject: "",
            tags: "",
          },
    );
    setOpen(true);
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!form.prompt.trim()) throw new Error("Question prompt is required.");
      if (!user) throw new Error("Sign in to save question");

      const payload = {
        owner_id: user.id,
        type: form.type,
        difficulty: form.difficulty,
        prompt: form.prompt.trim(),
        options: form.options
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        correct: form.correct
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        explanation: form.explanation.trim() || null,
        points: Math.max(1, Number(form.points) || 1),
        subject: form.subject.trim() || null,
        tags: form.tags
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        updated_at: new Date().toISOString(),
      };

      const ref = editing
        ? doc(db, "question_bank", editing.id)
        : doc(collection(db, "question_bank"));

      await setDoc(ref, { id: ref.id, ...payload }, { merge: true });
    },
    onSuccess: async () => {
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ["question-bank", user?.id] });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await deleteDoc(doc(db, "question_bank", id));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["question-bank", user?.id] }),
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Question Bank</h1>
          <p className="text-sm text-muted-foreground">
            Curate reusable questions for quizzes and assessments.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {search.quizId && (
            <Button
              variant="outline"
              onClick={() =>
                void navigate({ to: "/quizzes/$quizId/edit", params: { quizId: search.quizId! } })
              }
              className="gap-2"
            >
              <ArrowLeft className="size-4" /> Back to quiz
            </Button>
          )}
          <Button onClick={() => reset()} className="gap-2">
            <Plus className="size-4" /> Add Question
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search questions by text, subject or tag…"
            className="pl-9"
          />
        </div>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {QUESTION_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={difficulty} onValueChange={setDifficulty}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All levels" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All levels</SelectItem>
            {DIFFICULTIES.map((d) => (
              <SelectItem key={d} value={d} className="capitalize">
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((q) => (
          <div key={q.id} className="panel p-4 flex flex-col justify-between space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="outline" className="text-[11px] capitalize">
                  {q.type.replace(/_/g, " ")}
                </Badge>
                <span className="text-xs text-muted-foreground">{q.points} pt{q.points === 1 ? "" : "s"}</span>
              </div>
              <p className="text-sm font-medium line-clamp-3">{q.prompt}</p>
              {q.options && q.options.length > 0 && (
                <ul className="text-xs text-muted-foreground space-y-1 pl-4 list-disc">
                  {q.options.slice(0, 3).map((opt, i) => (
                    <li key={i} className="truncate">{opt}</li>
                  ))}
                  {q.options.length > 3 && <li>+{q.options.length - 3} more</li>}
                </ul>
              )}
            </div>
            <div className="flex items-center justify-between pt-2 border-t text-xs">
              <span className="text-muted-foreground capitalize">{q.difficulty}</span>
              <div className="flex items-center gap-1">
                {search.quizId && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs"
                    disabled={addToQuiz.isPending || addedIds.includes(q.id)}
                    onClick={() => addToQuiz.mutate(q)}
                  >
                    {addedIds.includes(q.id) ? "Added" : "Add to quiz"}
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="size-7" onClick={() => reset(q)}>
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-destructive hover:text-destructive"
                  onClick={() => remove.mutate(q.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="col-span-full panel p-8 text-center text-sm text-muted-foreground">
            No questions found. Add questions to your repository to build quizzes quickly.
          </p>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Question" : "Add Question"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Prompt</Label>
              <Textarea
                rows={3}
                placeholder="Question text (LaTeX math supported e.g. $E=mc^2$)"
                value={form.prompt}
                onChange={(e) => setForm({ ...form, prompt: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {QUESTION_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Difficulty</Label>
                <Select
                  value={form.difficulty}
                  onValueChange={(v) => setForm({ ...form, difficulty: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DIFFICULTIES.map((d) => (
                      <SelectItem key={d} value={d} className="capitalize">
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {(form.type === "mcq" || form.type === "multi_select") && (
              <div className="space-y-1">
                <Label>Options (one per line)</Label>
                <Textarea
                  rows={3}
                  value={form.options}
                  onChange={(e) => setForm({ ...form, options: e.target.value })}
                />
              </div>
            )}
            <div className="space-y-1">
              <Label>Correct answer(s) (one per line)</Label>
              <Textarea
                rows={2}
                value={form.correct}
                onChange={(e) => setForm({ ...form, correct: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Points</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.points}
                  onChange={(e) => setForm({ ...form, points: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Subject (optional)</Label>
                <Input
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              Save Question
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
