import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ClipboardList, Plus, Timer, Trash2, ChevronRight } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useViewRole } from "@/lib/viewRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getTeacherClasses,
  getAllClasses,
  getStudentClasses,
  getQuizzesByClass,
  createQuiz,
  deleteQuiz,
  getStudentSubmissions,
} from "@/lib/firebase/firestore";
import type { Quiz } from "@/lib/firebase/models";

export const Route = createFileRoute("/_authenticated/quizzes/")({
  head: () => ({
    meta: [
      { title: "Quizzes — ONYX" },
      { name: "description", content: "Create and take quizzes with formatted math equations." },
      { property: "og:title", content: "Quizzes — ONYX" },
    ],
  }),
  component: QuizzesPage,
});

function QuizzesPage() {
  const { user } = useAuth();
  const { effectiveRole } = useViewRole();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const isTeacher = effectiveRole === "teacher" || effectiveRole === "admin";
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [classId, setClassId] = useState("");
  const [timeLimit, setTimeLimit] = useState("20");

  const classes = useQuery({
    queryKey: ["quizzes-classes", user?.id, effectiveRole],
    enabled: Boolean(user),
    queryFn: async () => {
      if (effectiveRole === "admin") return await getAllClasses();
      if (isTeacher) return await getTeacherClasses(user!.id);
      return await getStudentClasses(user!.id);
    },
  });

  const quizzes = useQuery({
    queryKey: ["all-quizzes", user?.id, classes.data?.length],
    enabled: Boolean(classes.data?.length),
    queryFn: async () => {
      const cls = classes.data || [];
      const classMap = new Map(cls.map((c) => [c.id, c.name]));
      let all: (Quiz & { className?: string })[] = [];

      for (const c of cls) {
        const qList = await getQuizzesByClass(c.id);
        all = all.concat(qList.map((q) => ({ ...q, className: c.name })));
      }
      return { list: all, classMap };
    },
  });

  const studentSubmissions = useQuery({
    queryKey: ["student-quiz-subs", user?.id],
    enabled: !isTeacher && Boolean(user),
    queryFn: async () => {
      const subs = await getStudentSubmissions(user!.id);
      return new Map(subs.filter((s) => s.type === "quiz").map((s) => [s.refId, s]));
    },
  });

  const newQuiz = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("Title is required");
      if (!classId) throw new Error("Please select a class");

      // Sample template quiz with math equation questions
      const sampleQuestions = [
        {
          id: "q1",
          type: "single_choice" as const,
          text: "What is the solution to $x^2 - 16 = 0$?",
          options: ["$x = \\pm 4$", "$x = 4$", "$x = 16$", "$x = \\pm 2$"],
          points: 10,
          correctAnswer: "$x = \\pm 4$",
        },
        {
          id: "q2",
          type: "single_choice" as const,
          text: "Calculate the derivative: $\\frac{d}{dx}(3x^3 + 2x)$",
          options: ["$9x^2 + 2$", "$3x^2 + 2$", "$6x + 2$", "$9x^3$"],
          points: 10,
          correctAnswer: "$9x^2 + 2$",
        },
        {
          id: "q3",
          type: "text" as const,
          text: "State Pythagoras' Theorem in mathematical notation.",
          points: 10,
          correctAnswer: "a^2 + b^2 = c^2",
        },
      ];

      const answerKey: Record<string, string | number> = {
        q1: "$x = \\pm 4$",
        q2: "$9x^2 + 2$",
        q3: "a^2 + b^2 = c^2",
      };

      const quizId = await createQuiz(
        {
          classId,
          title: title.trim(),
          questions: sampleQuestions,
          timeLimit: parseInt(timeLimit, 10) || 20,
          createdBy: user!.id,
          createdAt: new Date().toISOString(),
        },
        answerKey,
      );

      return quizId;
    },
    onSuccess: (quizId) => {
      toast.success("Quiz created!");
      setCreateOpen(false);
      setTitle("");
      setClassId("");
      void qc.invalidateQueries({ queryKey: ["all-quizzes"] });
      void navigate({ to: "/quizzes/$quizId/edit", params: { quizId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeQuiz = useMutation({
    mutationFn: async (quizId: string) => {
      await deleteQuiz(quizId);
    },
    onSuccess: () => {
      toast.success("Quiz deleted");
      void qc.invalidateQueries({ queryKey: ["all-quizzes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = quizzes.data?.list || [];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 border-b border-border/60 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Quizzes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isTeacher
              ? "Create interactive quizzes and exams with KaTeX math equation support."
              : "Complete quizzes for your classes and test your knowledge."}
          </p>
        </div>

        {isTeacher && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5 press">
                <Plus className="size-4" /> New Quiz
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create a New Quiz</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label htmlFor="q-title">Quiz Title</Label>
                  <Input
                    id="q-title"
                    placeholder="e.g. Midterm Calculus Quiz"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Class</Label>
                  <Select value={classId} onValueChange={setClassId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select class" />
                    </SelectTrigger>
                    <SelectContent>
                      {(classes.data || []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="q-time">Time Limit (minutes)</Label>
                  <Input
                    id="q-time"
                    type="number"
                    min={5}
                    max={180}
                    value={timeLimit}
                    onChange={(e) => setTimeLimit(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => newQuiz.mutate()} disabled={newQuiz.isPending}>
                  {newQuiz.isPending ? "Creating..." : "Create & Edit Questions"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </header>

      {quizzes.isLoading ? (
        <div className="grid gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="panel p-12 text-center border-dashed">
          <ClipboardList className="mx-auto size-10 text-muted-foreground/60" />
          <h3 className="mt-3 text-base font-semibold">No quizzes found</h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
            {isTeacher
              ? "Create your first quiz to test your students with multiple choice and math equations."
              : "Your teacher has not published any quizzes for your classes yet."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {list.map((q) => {
            const sub = studentSubmissions.data?.get(q.id);
            const isCompleted = Boolean(sub);

            return (
              <div
                key={q.id}
                className="panel p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-card hover:border-primary/40 transition-all hover:shadow-sm"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-base text-foreground">{q.title}</p>
                    {q.className && (
                      <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded">
                        {q.className}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Timer className="size-3.5" /> {q.timeLimit || 20} mins
                    </span>
                    <span>•</span>
                    <span>{(q.questions || []).length} questions</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isTeacher ? (
                    <>
                      <Button asChild size="sm" variant="outline">
                        <Link to="/quizzes/$quizId/edit" params={{ quizId: q.id }}>
                          Edit Questions
                        </Link>
                      </Button>
                      <Button asChild size="sm">
                        <Link to="/quizzes/$quizId" params={{ quizId: q.id }}>
                          View
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:bg-destructive/10"
                        onClick={() => removeQuiz.mutate(q.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      {isCompleted ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-success bg-success/10 px-2.5 py-1 rounded">
                            Score: {sub?.score} pts
                          </span>
                          <Button asChild size="sm" variant="outline">
                            <Link to="/quizzes/$quizId" params={{ quizId: q.id }}>
                              Review
                            </Link>
                          </Button>
                        </div>
                      ) : (
                        <Button asChild size="sm">
                          <Link to="/quizzes/$quizId/take" params={{ quizId: q.id }}>
                            Take Quiz <ChevronRight className="size-3.5 ml-1" />
                          </Link>
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
