import { useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2,
  Clock,
  Inbox,
  Loader2,
  FileText,
  ClipboardList,
  ArrowRight,
  Filter,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useViewRole } from "@/lib/viewRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RenderMathText } from "@/components/math/RenderMathText";
import {
  getTeacherClasses,
  getAllClasses,
  getTeacherGradingQueue,
  gradeSubmission,
  getAllAssignments,
  getAllQuizzes,
} from "@/lib/firebase/firestore";
import type { Submission } from "@/lib/firebase/models";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/grading/")({
  head: () => ({
    meta: [
      { title: "Grading Hub — ONYX Workspace" },
      {
        name: "description",
        content: "Review assignments and quizzes, award scores, and leave constructive feedback.",
      },
    ],
  }),
  component: GradingHub,
});

function GradingHub() {
  const { user } = useAuth();
  const { effectiveRole } = useViewRole();
  const canGrade = effectiveRole === "teacher" || effectiveRole === "admin";
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<"todo" | "graded">("todo");
  const [typeFilter, setTypeFilter] = useState<"all" | "assignment" | "quiz">("all");
  const [activeSub, setActiveSub] = useState<Submission | null>(null);
  const [score, setScore] = useState("");
  const [feedback, setFeedback] = useState("");

  const queue = useQuery({
    enabled: canGrade && Boolean(user),
    queryKey: ["grading-queue", user?.id, effectiveRole],
    queryFn: async () => {
      const classes =
        effectiveRole === "admin" ? await getAllClasses() : await getTeacherClasses(user!.id);
      const classIds = classes.map((c) => c.id);
      const subs = await getTeacherGradingQueue(classIds);
      return subs;
    },
  });

  const assignmentsQuery = useQuery({
    enabled: canGrade,
    queryKey: ["all-assignments-grading"],
    queryFn: async () => await getAllAssignments(),
  });

  const quizzesQuery = useQuery({
    enabled: canGrade,
    queryKey: ["all-quizzes-grading"],
    queryFn: async () => await getAllQuizzes(),
  });

  const titleMap = useMemo(() => {
    const map = new Map<string, string>();
    (assignmentsQuery.data || []).forEach((a) => map.set(a.id, a.title));
    (quizzesQuery.data || []).forEach((q) => map.set(q.id, q.title));
    return map;
  }, [assignmentsQuery.data, quizzesQuery.data]);

  const saveGrade = useMutation({
    mutationFn: async () => {
      if (!activeSub) return;
      const num = parseFloat(score);
      if (isNaN(num) || num < 0) throw new Error("Enter a valid score");

      await gradeSubmission(activeSub.id, num, feedback.trim(), user?.id || "teacher");
    },
    onSuccess: () => {
      toast.success("Grade saved!");
      setActiveSub(null);
      setScore("");
      setFeedback("");
      void qc.invalidateQueries({ queryKey: ["grading-queue"] });
      void qc.invalidateQueries({ queryKey: ["teacher-dash"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!canGrade) {
    return (
      <div className="panel p-8 text-center text-muted-foreground">
        Grading is available to teachers and administrators only.
      </div>
    );
  }

  const allSubs = queue.data || [];
  const todoList = allSubs.filter((s) => s.status === "submitted");
  const gradedList = allSubs.filter((s) => s.status === "graded");
  const statusList = activeTab === "todo" ? todoList : gradedList;

  const assignmentsCount = statusList.filter((s) => s.type !== "quiz").length;
  const quizzesCount = statusList.filter((s) => s.type === "quiz").length;

  const displayed = statusList.filter((s) => {
    if (typeFilter === "assignment") return s.type !== "quiz";
    if (typeFilter === "quiz") return s.type === "quiz";
    return true;
  });

  return (
    <div className="space-y-6">
      <header className="border-b border-border/60 pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Grading Hub
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review assignments and quizzes, award scores, and leave constructive feedback.
        </p>
      </header>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="space-y-4">
        {/* Status Tabs and Type Differentiation Filter Pills */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList className="bg-secondary/70">
            <TabsTrigger value="todo" className="gap-2">
              <Clock className="size-3.5" /> Needs Grading ({todoList.length})
            </TabsTrigger>
            <TabsTrigger value="graded" className="gap-2">
              <CheckCircle2 className="size-3.5 text-success" /> Graded ({gradedList.length})
            </TabsTrigger>
          </TabsList>

          {/* Differentiating Tabs: All vs Assignments vs Quizzes */}
          <div className="inline-flex items-center gap-1 rounded-xl border border-border/80 bg-card p-1 text-xs shadow-2xs">
            <button
              type="button"
              onClick={() => setTypeFilter("all")}
              className={cn(
                "px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer",
                typeFilter === "all"
                  ? "bg-primary text-primary-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
              )}
            >
              All Work ({statusList.length})
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter("assignment")}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer",
                typeFilter === "assignment"
                  ? "bg-primary text-primary-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
              )}
            >
              <FileText className="size-3.5" /> Assignments ({assignmentsCount})
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter("quiz")}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer",
                typeFilter === "quiz"
                  ? "bg-purple-600 text-white shadow-2xs dark:bg-purple-500"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
              )}
            >
              <ClipboardList className="size-3.5" /> Quizzes ({quizzesCount})
            </button>
          </div>
        </div>

        <TabsContent value={activeTab} className="space-y-3 pt-1">
          {queue.isLoading ? (
            <div className="grid gap-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
          ) : displayed.length === 0 ? (
            <div className="panel p-12 text-center border-dashed rounded-2xl bg-card">
              <Inbox className="mx-auto size-10 text-muted-foreground/60" />
              <h3 className="mt-3 text-base font-semibold text-foreground">
                {activeTab === "todo"
                  ? typeFilter === "assignment"
                    ? "No pending assignments to grade!"
                    : typeFilter === "quiz"
                      ? "No pending quizzes to grade!"
                      : "All caught up!"
                  : "No graded work in this filter"}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
                {activeTab === "todo"
                  ? "There are no pending submissions waiting for your marks in this section."
                  : "Graded assignments and quizzes will appear here."}
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              {displayed.map((sub) => {
                const isQuiz = sub.type === "quiz";
                const itemTitle =
                  titleMap.get(sub.refId) || (isQuiz ? "Quiz Submission" : "Assignment Submission");

                return (
                  <div
                    key={sub.id}
                    className="panel p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-card border-border/80 hover:border-primary/40 transition-all hover:shadow-xs rounded-xl"
                  >
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Clear Type Distinction Badge */}
                        {isQuiz ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[11px] font-bold text-purple-600 dark:text-purple-400">
                            <ClipboardList className="size-3" /> Quiz
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                            <FileText className="size-3" /> Assignment
                          </span>
                        )}

                        <h3 className="font-bold text-sm text-foreground truncate">{itemTitle}</h3>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground/90">
                          Student: {sub.studentName || "Student"}
                        </span>
                        <span>•</span>
                        <span>Submitted: {new Date(sub.submittedAt).toLocaleString()}</span>
                      </div>

                      {sub.answers?.text && (
                        <div className="text-xs text-foreground/80 line-clamp-1 max-w-xl pt-0.5 font-mono bg-secondary/30 px-2 py-1 rounded">
                          <RenderMathText text={sub.answers.text} />
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {sub.status === "graded" && (
                        <span className="text-sm font-bold text-success tabular-nums">
                          Score: {sub.score} pts
                        </span>
                      )}

                      {/* Dedicated grading links for assignments vs quizzes */}
                      {isQuiz ? (
                        <Button
                          asChild
                          size="sm"
                          variant={sub.status === "graded" ? "outline" : "default"}
                          className={cn(
                            "gap-1.5 h-8 text-xs font-semibold",
                            sub.status !== "graded" &&
                              "bg-purple-600 hover:bg-purple-700 text-white dark:bg-purple-500",
                          )}
                        >
                          <Link
                            to="/grading/quiz/$quizId"
                            params={{ quizId: sub.refId }}
                            search={{ s: undefined }}
                          >
                            {sub.status === "graded" ? "Review Quiz" : "Grade Quiz"}
                            <ArrowRight className="size-3" />
                          </Link>
                        </Button>
                      ) : (
                        <Button
                          asChild
                          size="sm"
                          variant={sub.status === "graded" ? "outline" : "default"}
                          className="gap-1.5 h-8 text-xs font-semibold"
                        >
                          <Link
                            to="/grading/assignment/$assignmentId"
                            params={{ assignmentId: sub.refId }}
                            search={{ s: undefined }}
                          >
                            {sub.status === "graded" ? "Review Work" : "Grade Assignment"}
                            <ArrowRight className="size-3" />
                          </Link>
                        </Button>
                      )}

                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-xs px-2 text-muted-foreground"
                        onClick={() => {
                          setActiveSub(sub);
                          setScore(sub.score != null ? String(sub.score) : "");
                          setFeedback(sub.feedback || "");
                        }}
                      >
                        Quick Score
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Quick Score Modal */}
      <Dialog open={Boolean(activeSub)} onOpenChange={(open) => !open && setActiveSub(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {activeSub?.type === "quiz" ? (
                <ClipboardList className="size-4 text-purple-500" />
              ) : (
                <FileText className="size-4 text-primary" />
              )}
              Grade {activeSub?.type === "quiz" ? "Quiz" : "Assignment"} — {activeSub?.studentName}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="p-3 bg-secondary/50 rounded-md border text-sm max-h-48 overflow-y-auto">
              <p className="text-xs font-semibold text-muted-foreground mb-1">Submitted Content:</p>
              {activeSub?.answers?.text ? (
                <RenderMathText text={activeSub.answers.text} />
              ) : activeSub?.answers ? (
                <pre className="text-xs whitespace-pre-wrap">
                  {JSON.stringify(activeSub.answers, null, 2)}
                </pre>
              ) : (
                <p className="text-xs text-muted-foreground">No content submitted</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="gradeScore">Score (Points)</Label>
              <Input
                id="gradeScore"
                type="number"
                min={0}
                value={score}
                onChange={(e) => setScore(e.target.value)}
                placeholder="e.g. 95"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="gradeFeedback">Feedback / Notes</Label>
              <Textarea
                id="gradeFeedback"
                rows={3}
                placeholder="Give constructive feedback on work, formulas, or steps..."
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setActiveSub(null)}>
              Cancel
            </Button>
            <Button onClick={() => saveGrade.mutate()} disabled={saveGrade.isPending}>
              {saveGrade.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Save & Release Grade
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
