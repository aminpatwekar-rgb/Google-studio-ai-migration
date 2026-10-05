import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Clock, Inbox, Loader2 } from "lucide-react";
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
  getAssignment,
} from "@/lib/firebase/firestore";
import type { Submission } from "@/lib/firebase/models";

export const Route = createFileRoute("/_authenticated/grading/")({
  head: () => ({
    meta: [
      { title: "Grading — ONYX" },
      { name: "description", content: "Review student submissions and award grades and feedback." },
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
  const [activeSub, setActiveSub] = useState<Submission | null>(null);
  const [score, setScore] = useState("");
  const [feedback, setFeedback] = useState("");

  const queue = useQuery({
    enabled: canGrade && Boolean(user),
    queryKey: ["grading-queue", user?.id, effectiveRole],
    queryFn: async () => {
      const classes =
        effectiveRole === "admin"
          ? await getAllClasses()
          : await getTeacherClasses(user!.id);
      const classIds = classes.map((c) => c.id);
      const subs = await getTeacherGradingQueue(classIds);
      return subs;
    },
  });

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
  const displayed = activeTab === "todo" ? todoList : gradedList;

  return (
    <div className="space-y-6">
      <header className="border-b border-border/60 pb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Grading Hub</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review assignments and quizzes, award scores, and leave constructive feedback.
        </p>
      </header>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="space-y-4">
        <TabsList>
          <TabsTrigger value="todo" className="gap-2">
            <Clock className="size-3.5" /> Needs Grading ({todoList.length})
          </TabsTrigger>
          <TabsTrigger value="graded" className="gap-2">
            <CheckCircle2 className="size-3.5" /> Graded ({gradedList.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="space-y-3">
          {queue.isLoading ? (
            <div className="grid gap-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
          ) : displayed.length === 0 ? (
            <div className="panel p-12 text-center border-dashed">
              <Inbox className="mx-auto size-10 text-muted-foreground/60" />
              <h3 className="mt-3 text-base font-semibold">
                {activeTab === "todo" ? "All caught up!" : "No graded submissions yet"}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {activeTab === "todo"
                  ? "There are no pending submissions waiting for your marks."
                  : "Graded work will be displayed here."}
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              {displayed.map((sub) => (
                <div
                  key={sub.id}
                  className="panel p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-card hover:border-primary/40 transition-all hover:shadow-sm"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm text-foreground">
                        {sub.studentName || "Student"}
                      </p>
                      <span className="text-[10px] uppercase font-bold text-muted-foreground bg-secondary px-2 py-0.5 rounded">
                        {sub.type}
                      </span>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Submitted: {new Date(sub.submittedAt).toLocaleString()}
                    </p>

                    {sub.answers?.text && (
                      <div className="text-xs text-foreground/80 line-clamp-1 max-w-md pt-0.5">
                        <RenderMathText text={sub.answers.text} />
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    {sub.status === "graded" && (
                      <span className="text-sm font-bold text-success">
                        Score: {sub.score} pts
                      </span>
                    )}

                    <Button
                      size="sm"
                      variant={sub.status === "graded" ? "outline" : "default"}
                      onClick={() => {
                        setActiveSub(sub);
                        setScore(sub.score != null ? String(sub.score) : "");
                        setFeedback(sub.feedback || "");
                      }}
                    >
                      {sub.status === "graded" ? "Edit Feedback" : "Grade Now"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Grade Dialog */}
      <Dialog open={Boolean(activeSub)} onOpenChange={(open) => !open && setActiveSub(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Grade — {activeSub?.studentName}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="p-3 bg-secondary/50 rounded-md border text-sm max-h-48 overflow-y-auto">
              <p className="text-xs font-semibold text-muted-foreground mb-1">Student Answer:</p>
              {activeSub?.answers?.text ? (
                <RenderMathText text={activeSub.answers.text} />
              ) : activeSub?.answers ? (
                <pre className="text-xs">{JSON.stringify(activeSub.answers, null, 2)}</pre>
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
