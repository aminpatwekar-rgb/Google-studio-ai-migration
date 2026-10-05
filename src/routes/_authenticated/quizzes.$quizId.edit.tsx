import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { RenderMathText } from "@/components/math/RenderMathText";
import { getQuiz, updateQuiz } from "@/lib/firebase/firestore";
import type { QuizQuestion } from "@/lib/firebase/models";

export const Route = createFileRoute("/_authenticated/quizzes/$quizId/edit")({
  head: () => ({
    meta: [
      { title: "Edit Quiz — ONYX" },
      { name: "description", content: "Build and edit questions in ONYX." },
      { property: "og:title", content: "Edit Quiz — ONYX" },
    ],
  }),
  component: EditQuizPage,
});

function EditQuizPage() {
  const { quizId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [title, setTitle] = useState("");
  const [timeLimit, setTimeLimit] = useState("20");
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [correctAnswers, setCorrectAnswers] = useState<Record<string, string>>({});

  const quizData = useQuery({
    queryKey: ["quiz-edit", quizId],
    queryFn: async () => {
      const res = await getQuiz(quizId, true);
      if (!res) throw new Error("Quiz not found");
      return res;
    },
  });

  useEffect(() => {
    if (quizData.data) {
      const { quiz, answerKey } = quizData.data;
      setTitle(quiz.title || "");
      setTimeLimit(String(quiz.timeLimit || 20));
      setQuestions(quiz.questions || []);
      const keys: Record<string, string> = {};
      if (answerKey?.answers) {
        Object.entries(answerKey.answers).forEach(([k, v]) => {
          keys[k] = String(v);
        });
      }
      setCorrectAnswers(keys);
    }
  }, [quizData.data]);

  const addQuestion = () => {
    const newId = `q_${Date.now()}`;
    const newQ: QuizQuestion = {
      id: newId,
      type: "single_choice",
      text: "New math or theory question: e.g. Solve $f(x) = x^2 - 4$",
      options: ["$x = \\pm 2$", "$x = 2$", "$x = 4$", "None of the above"],
      points: 10,
    };
    setQuestions((prev) => [...prev, newQ]);
    setCorrectAnswers((prev) => ({ ...prev, [newId]: "$x = \\pm 2$" }));
  };

  const removeQuestion = (idx: number) => {
    const q = questions[idx];
    if (q) {
      setCorrectAnswers((prev) => {
        const next = { ...prev };
        delete next[q.id];
        return next;
      });
    }
    setQuestions((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateQuestionText = (idx: number, text: string) => {
    setQuestions((prev) => {
      const next = [...prev];
      if (next[idx]) next[idx] = { ...next[idx], text };
      return next;
    });
  };

  const updateOption = (qIdx: number, optIdx: number, val: string) => {
    setQuestions((prev) => {
      const next = [...prev];
      const q = next[qIdx];
      if (q && q.options) {
        const opts = [...q.options];
        opts[optIdx] = val;
        next[qIdx] = { ...q, options: opts };
      }
      return next;
    });
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("Title is required");
      if (questions.length === 0) throw new Error("Add at least one question");

      await updateQuiz(
        quizId,
        {
          title: title.trim(),
          timeLimit: parseInt(timeLimit, 10) || 20,
          questions,
        },
        correctAnswers,
      );
    },
    onSuccess: () => {
      toast.success("Quiz questions saved successfully!");
      void qc.invalidateQueries({ queryKey: ["quiz-detail", quizId] });
      void qc.invalidateQueries({ queryKey: ["all-quizzes"] });
      void navigate({ to: "/quizzes/$quizId", params: { quizId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (quizData.isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (quizData.isError) {
    return (
      <div className="panel p-8 text-center text-sm">
        <p className="text-destructive font-semibold">Couldn't load quiz</p>
        <Button asChild size="sm" variant="outline" className="mt-4">
          <Link to="/quizzes">Back</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between border-b pb-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link to="/quizzes/$quizId" params={{ quizId }} className="hover:text-foreground flex items-center gap-1">
            <ArrowLeft className="size-3.5" /> Back to Quiz
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium">Edit Questions</span>
        </div>

        <Button onClick={() => save.mutate()} disabled={save.isPending} className="gap-1.5 press">
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save Quiz
        </Button>
      </div>

      <header className="panel p-6 bg-card border-border space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="title">Quiz Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="timeLimit">Time Limit (minutes)</Label>
            <Input
              id="timeLimit"
              type="number"
              min={1}
              max={180}
              value={timeLimit}
              onChange={(e) => setTimeLimit(e.target.value)}
            />
          </div>
        </div>
      </header>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Questions ({questions.length})</h2>
          <Button size="sm" variant="outline" onClick={addQuestion} className="gap-1.5">
            <Plus className="size-4" /> Add Question
          </Button>
        </div>

        <div className="space-y-4">
          {questions.map((q, qIdx) => (
            <div key={q.id || qIdx} className="panel p-6 bg-card border-border space-y-4">
              <div className="flex items-start justify-between gap-2">
                <span className="font-mono text-xs font-bold bg-secondary px-2.5 py-1 rounded">
                  Question #{qIdx + 1}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => removeQuestion(qIdx)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>

              <div className="space-y-1.5">
                <Label>Question Text (supports $inline$ and $$block$$ LaTeX equations)</Label>
                <Textarea
                  value={q.text}
                  onChange={(e) => updateQuestionText(qIdx, e.target.value)}
                  rows={2}
                />
              </div>

              {q.text && (
                <div className="p-3 bg-secondary/30 rounded border text-xs">
                  <span className="text-muted-foreground font-semibold">Rendered Preview: </span>
                  <RenderMathText text={q.text} className="inline font-medium" />
                </div>
              )}

              {q.options && q.options.length > 0 && (
                <div className="space-y-2 pt-2">
                  <Label className="text-xs">Multiple Choice Options</Label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {q.options.map((opt, optIdx) => (
                      <div key={optIdx} className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-muted-foreground">
                            {String.fromCharCode(65 + optIdx)}:
                          </span>
                          <Input
                            value={opt}
                            onChange={(e) => updateOption(qIdx, optIdx, e.target.value)}
                            placeholder={`Option ${optIdx + 1}`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-2 border-t flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="space-y-1 flex-1">
                  <Label htmlFor={`correct_${q.id}`} className="text-xs text-primary font-semibold">
                    Teacher-Only Answer Key (Protected)
                  </Label>
                  <Input
                    id={`correct_${q.id}`}
                    placeholder="Correct answer value"
                    value={correctAnswers[q.id] || ""}
                    onChange={(e) =>
                      setCorrectAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                    }
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="pt-4 flex justify-between items-center pb-12">
          <Button variant="outline" onClick={addQuestion} className="gap-1.5">
            <Plus className="size-4" /> Add Question
          </Button>

          <Button onClick={() => save.mutate()} disabled={save.isPending} className="gap-1.5 press">
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save All Changes
          </Button>
        </div>
      </section>
    </div>
  );
}
