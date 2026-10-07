import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ClipboardList,
  Plus,
  Timer,
  Trash2,
  ChevronRight,
  Sparkles,
  ShieldAlert,
  Clock,
  Calendar,
  BookOpen,
  GraduationCap,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useViewRole } from "@/lib/viewRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import type { Quiz, QuizKind } from "@/lib/firebase/models";

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
  const [quizType, setQuizType] = useState<QuizKind>("practice");
  const [timeLimit, setTimeLimit] = useState("20");
  const [scheduledStart, setScheduledStart] = useState("");
  const [scheduledEnd, setScheduledEnd] = useState("");

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
      if (!classId) throw new Error("Please choose a class");

      const isExam = quizType === "exam";

      const quizId = await createQuiz(
        {
          classId,
          title: title.trim(),
          kind: quizType,
          questions: [],
          timeLimit: quizType === "practice" ? 0 : parseInt(timeLimit, 10) || 20,
          scheduledStart: quizType === "scheduled" && scheduledStart ? scheduledStart : null,
          scheduledEnd: quizType === "scheduled" && scheduledEnd ? scheduledEnd : null,
          lockdown: isExam,
          createdBy: user!.id,
          createdAt: new Date().toISOString(),
        },
        {},
      );

      return quizId;
    },
    onSuccess: (quizId) => {
      toast.success("Quiz created successfully!");
      setCreateOpen(false);
      setTitle("");
      setClassId("");
      setQuizType("practice");
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
              ? "Create interactive quizzes, timed tests, and secure final exams."
              : "Complete quizzes for your classes and test your knowledge."}
          </p>
        </div>

        {isTeacher && (
          <div className="flex items-center gap-2">
            {/* Create a quiz dialog */}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="default" className="gap-1.5 press font-medium shadow-sm">
                  <Plus className="size-4" /> Create a quiz
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md bg-card border-border p-6">
                <DialogHeader className="space-y-1">
                  <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
                    Create a quiz
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">
                    Start blank, then generate questions with AI or pull them from your question
                    bank.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="q-title" className="text-xs font-medium text-foreground">
                      Title
                    </Label>
                    <Input
                      id="q-title"
                      placeholder="Chapter 4 — Thermodynamics"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      required
                      className="bg-card text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-foreground">Class</Label>
                    <Select value={classId} onValueChange={setClassId}>
                      <SelectTrigger className="bg-card text-sm">
                        <SelectValue placeholder="Choose a class" />
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
                    <Label className="text-xs font-medium text-foreground">Type</Label>
                    <Select value={quizType} onValueChange={(val: QuizKind) => setQuizType(val)}>
                      <SelectTrigger className="bg-card text-sm capitalize">
                        <SelectValue placeholder="Practice" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="practice">Practice</SelectItem>
                        <SelectItem value="timed">Timed quiz</SelectItem>
                        <SelectItem value="scheduled">Scheduled quiz</SelectItem>
                        <SelectItem value="exam">Final exam</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Time limit for timed quiz or final exam */}
                  {(quizType === "timed" || quizType === "exam") && (
                    <div className="space-y-1.5">
                      <Label htmlFor="q-time" className="text-xs font-medium text-foreground">
                        Time Limit (minutes)
                      </Label>
                      <Input
                        id="q-time"
                        type="number"
                        min={1}
                        max={300}
                        value={timeLimit}
                        onChange={(e) => setTimeLimit(e.target.value)}
                        className="bg-card text-sm"
                      />
                    </div>
                  )}

                  {/* Scheduled quiz start & end */}
                  {quizType === "scheduled" && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Start Window</Label>
                        <Input
                          type="datetime-local"
                          value={scheduledStart}
                          onChange={(e) => setScheduledStart(e.target.value)}
                          className="bg-card text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">End Window</Label>
                        <Input
                          type="datetime-local"
                          value={scheduledEnd}
                          onChange={(e) => setScheduledEnd(e.target.value)}
                          className="bg-card text-xs"
                        />
                      </div>
                    </div>
                  )}

                  {/* Final Exam Lockdown Notice */}
                  {quizType === "exam" && (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-foreground space-y-1">
                      <div className="flex items-center gap-1.5 font-semibold text-destructive">
                        <ShieldAlert className="size-4" /> Strict Exam Lockdown Active
                      </div>
                      <p className="text-muted-foreground">
                        Students are forbidden from switching tabs or leaving the exam window. Any
                        tab switch will trigger immediate lockout and auto-submission.
                      </p>
                    </div>
                  )}
                </div>

                <DialogFooter className="pt-2">
                  <Button
                    onClick={() => newQuiz.mutate()}
                    disabled={newQuiz.isPending || !title.trim() || !classId}
                    className="w-full sm:w-auto bg-primary text-primary-foreground font-medium text-xs px-5 h-9"
                  >
                    {newQuiz.isPending ? "Creating..." : "Create & add questions"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </header>

      {quizzes.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="panel p-8 text-center border-dashed">
          <ClipboardList className="mx-auto size-12 text-muted-foreground/60" />
          <h3 className="mt-3 text-sm font-semibold text-foreground">No quizzes yet</h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
            {isTeacher
              ? "Create your first quiz with LaTeX formulas, practice mode, or locked final exams."
              : "Your teacher hasn't published any quizzes yet."}
          </p>
          {isTeacher && (
            <div className="mt-4 flex justify-center gap-2">
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                Create a quiz
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((qz) => {
            const sub = studentSubmissions.data?.get(qz.id);
            const isCompleted = sub?.status === "graded";
            const kind = qz.kind || "practice";

            return (
              <div
                key={qz.id}
                className="panel p-5 flex flex-col justify-between bg-card hover:border-primary/40 transition-all hover:shadow-md group space-y-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-semibold text-primary">
                      {qz.className || "Class"}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {kind === "exam" ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-destructive/15 px-2 py-0.5 text-[11px] font-semibold text-destructive border border-destructive/20">
                          <ShieldAlert className="size-3" /> Final Exam
                        </span>
                      ) : kind === "timed" ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-warning/15 px-2 py-0.5 text-[11px] font-semibold text-warning border border-warning/20">
                          <Timer className="size-3" /> Timed ({qz.timeLimit}m)
                        </span>
                      ) : kind === "scheduled" ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-info/15 px-2 py-0.5 text-[11px] font-semibold text-info border border-info/20">
                          <Calendar className="size-3" /> Scheduled
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-[11px] font-semibold text-muted-foreground border border-border">
                          <BookOpen className="size-3" /> Practice
                        </span>
                      )}

                      {isTeacher && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground hover:text-destructive"
                          onClick={() => removeQuiz.mutate(qz.id)}
                          disabled={removeQuiz.isPending}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>

                  <h3 className="text-base font-bold text-foreground mt-2 group-hover:text-primary transition-colors">
                    {qz.title}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    {(qz.questions || []).length} question
                    {(qz.questions || []).length === 1 ? "" : "s"}
                  </p>
                </div>

                <div className="pt-2 border-t flex items-center justify-between">
                  {!isTeacher && sub ? (
                    <div className="text-xs">
                      <span className="font-semibold text-success">Completed: </span>
                      <span className="font-bold">{sub.score} pts</span>
                    </div>
                  ) : !isTeacher ? (
                    <span className="text-xs text-warning font-medium">Not attempted</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Ready for students</span>
                  )}

                  <Button asChild size="sm" variant={isCompleted ? "outline" : "default"}>
                    <Link
                      to={isTeacher ? "/quizzes/$quizId/edit" : "/quizzes/$quizId"}
                      params={{ quizId: qz.id }}
                    >
                      {isTeacher ? "Edit Quiz" : isCompleted ? "View Result" : "Take Quiz"}
                      <ChevronRight className="size-3.5 ml-1" />
                    </Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
