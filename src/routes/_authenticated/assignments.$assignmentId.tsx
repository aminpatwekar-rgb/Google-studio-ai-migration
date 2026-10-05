import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Calendar, CheckCircle2, Clock, Loader2, Sparkles, Send } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useViewRole } from "@/lib/viewRole";
import { formatDue } from "@/lib/assignments";
import { RenderMathText } from "@/components/math/RenderMathText";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getAssignment,
  getClass,
  getSubmissionsByRef,
  createSubmission,
  gradeSubmission,
  awardAchievement,
} from "@/lib/firebase/firestore";
import type { Submission } from "@/lib/firebase/models";

export const Route = createFileRoute("/_authenticated/assignments/$assignmentId")({
  head: () => ({
    meta: [
      { title: "Assignment — ONYX" },
      { name: "description", content: "Assignment details, instructions and submission." },
      { property: "og:title", content: "Assignment — ONYX" },
      { property: "og:description", content: "View instructions and submit your work." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AssignmentPage,
});

const MATH_SHORTCUTS = [
  { label: "Fraction", latex: "\\frac{a}{b}" },
  { label: "Square Root", latex: "\\sqrt{x}" },
  { label: "Exponent", latex: "x^{2}" },
  { label: "Subscript", latex: "x_{1}" },
  { label: "Plus/Minus", latex: "\\pm" },
  { label: "Pi", latex: "\\pi" },
  { label: "Integral", latex: "\\int_{a}^{b} f(x) dx" },
  { label: "Sum", latex: "\\sum_{i=1}^{n} x_i" },
];

function AssignmentPage() {
  const { assignmentId } = Route.useParams();
  const { user, profile } = useAuth();
  const { effectiveRole } = useViewRole();
  const qc = useQueryClient();
  const isTeacher = effectiveRole === "teacher" || effectiveRole === "admin";

  const [answerText, setAnswerText] = useState("");
  const [gradingSub, setGradingSub] = useState<Submission | null>(null);
  const [gradeScore, setGradeScore] = useState("");
  const [gradeFeedback, setGradeFeedback] = useState("");

  const assignment = useQuery({
    queryKey: ["assignment", assignmentId],
    queryFn: async () => {
      const a = await getAssignment(assignmentId);
      if (!a) throw new Error("Assignment not found");
      const c = await getClass(a.classId);
      return { ...a, className: c?.name || "Class" };
    },
  });

  const submissions = useQuery({
    queryKey: ["assignment-submissions", assignmentId],
    queryFn: async () => {
      return await getSubmissionsByRef(assignmentId);
    },
  });

  const studentSub = (submissions.data || []).find((s) => s.studentId === user?.id);

  const submitWork = useMutation({
    mutationFn: async () => {
      if (!answerText.trim()) throw new Error("Please write an answer before submitting");
      if (!user) throw new Error("Must be logged in to submit");

      await createSubmission({
        type: "assignment",
        refId: assignmentId,
        classId: assignment.data!.classId,
        studentId: user.id,
        studentName: profile?.name || "Student",
        studentEmail: user.email || undefined,
        answers: { text: answerText.trim() },
        submittedAt: new Date().toISOString(),
        status: "submitted",
        score: null,
        feedback: null,
        gradedBy: null,
        gradedAt: null,
      });

      // Award achievement if formula entered
      if (answerText.includes("$") || answerText.includes("\\")) {
        await awardAchievement(user.id, {
          id: "math_master",
          title: "Formula Wizard",
          description: "Solved an equation using formatted math",
          icon: "Calculator",
          points: 100,
        }).catch(() => {});
      }
    },
    onSuccess: () => {
      toast.success("Assignment submitted successfully!");
      setAnswerText("");
      void qc.invalidateQueries({ queryKey: ["assignment-submissions", assignmentId] });
      void qc.invalidateQueries({ queryKey: ["student-dash"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submitGrade = useMutation({
    mutationFn: async () => {
      if (!gradingSub) return;
      const scoreNum = parseFloat(gradeScore);
      if (isNaN(scoreNum) || scoreNum < 0) throw new Error("Enter a valid score");

      await gradeSubmission(
        gradingSub.id,
        scoreNum,
        gradeFeedback.trim(),
        user?.id || "teacher",
      );
    },
    onSuccess: () => {
      toast.success("Submission graded!");
      setGradingSub(null);
      setGradeScore("");
      setGradeFeedback("");
      void qc.invalidateQueries({ queryKey: ["assignment-submissions", assignmentId] });
      void qc.invalidateQueries({ queryKey: ["teacher-review-queue"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const insertMath = (latex: string) => {
    setAnswerText((prev) => `${prev} $${latex}$ `);
  };

  if (assignment.isLoading) return <Skeleton className="h-72 w-full rounded-xl" />;
  if (assignment.isError || !assignment.data) {
    return (
      <div className="panel p-8 text-center text-sm">
        <p className="text-destructive font-semibold">Couldn't load assignment</p>
        <Button asChild size="sm" variant="outline" className="mt-4">
          <Link to="/assignments">Back to assignments</Link>
        </Button>
      </div>
    );
  }

  const a = assignment.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link to="/assignments" className="hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="size-3.5" /> Assignments
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">{a.title}</span>
      </div>

      <header className="panel p-6 bg-card border-border">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className="text-xs font-semibold text-primary uppercase tracking-wider">
              {a.className}
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl mt-1">
              {a.title}
            </h1>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground bg-secondary/80 px-3 py-1.5 rounded-lg border border-border">
            <span className="flex items-center gap-1">
              <Calendar className="size-3.5" /> Due {formatDue(a.dueDate)}
            </span>
            <span>•</span>
            <span className="font-semibold text-foreground">{a.maxPoints} points</span>
          </div>
        </div>

        {a.description && (
          <div className="mt-4 pt-4 border-t border-border/60">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Instructions</h3>
            <RenderMathText text={a.description} className="text-sm text-foreground/90" />
          </div>
        )}
      </header>

      {/* STUDENT SUBMISSION SECTION */}
      {!isTeacher && (
        <section className="panel p-6 bg-card border-border space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Your Submission</h2>

          {studentSub ? (
            <div className="space-y-3 p-4 rounded-lg bg-secondary/40 border border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-5 text-success" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {studentSub.status === "graded" ? "Graded" : "Submitted"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Submitted on {new Date(studentSub.submittedAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                {studentSub.status === "graded" && (
                  <div className="text-right">
                    <span className="text-lg font-bold text-primary">
                      {studentSub.score} / {a.maxPoints}
                    </span>
                  </div>
                )}
              </div>

              {studentSub.answers?.text && (
                <div className="mt-3 pt-3 border-t border-border/60">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Your response:</p>
                  <RenderMathText text={studentSub.answers.text} className="text-sm bg-background p-3 rounded-md border" />
                </div>
              )}

              {studentSub.feedback && (
                <div className="mt-3 pt-3 border-t border-border/60">
                  <p className="text-xs font-semibold text-primary mb-1">Teacher Feedback:</p>
                  <p className="text-sm text-foreground bg-primary/5 p-3 rounded-md border border-primary/20">
                    {studentSub.feedback}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label htmlFor="answer" className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Write your answer (supports LaTeX / KaTeX formatted math using $math$ syntax)
                </Label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  <span className="text-xs text-muted-foreground flex items-center mr-1">Insert equation:</span>
                  {MATH_SHORTCUTS.map((sc) => (
                    <button
                      key={sc.label}
                      type="button"
                      onClick={() => insertMath(sc.latex)}
                      className="px-2 py-0.5 text-xs rounded bg-secondary hover:bg-secondary/80 border text-secondary-foreground transition-colors"
                    >
                      {sc.label}
                    </button>
                  ))}
                </div>
                <Textarea
                  id="answer"
                  rows={6}
                  placeholder="Type your response here. For formatted math, enclose expressions in single dollars, like $x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$"
                  value={answerText}
                  onChange={(e) => setAnswerText(e.target.value)}
                />
              </div>

              {answerText && (
                <div className="p-3 bg-secondary/30 rounded-lg border">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Live Math Preview:</p>
                  <RenderMathText text={answerText} className="text-sm" />
                </div>
              )}

              <Button
                onClick={() => submitWork.mutate()}
                disabled={submitWork.isPending || !answerText.trim()}
                className="gap-2 press"
              >
                {submitWork.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                Turn in Assignment
              </Button>
            </div>
          )}
        </section>
      )}

      {/* TEACHER SUBMISSIONS REVIEW SECTION */}
      {isTeacher && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">
              Student Submissions ({(submissions.data || []).length})
            </h2>
          </div>

          {(submissions.data || []).length === 0 ? (
            <div className="panel p-8 text-center border-dashed">
              <Clock className="mx-auto size-8 text-muted-foreground/60" />
              <p className="mt-2 text-sm font-semibold">No submissions received yet</p>
              <p className="text-xs text-muted-foreground mt-1">Students will appear here once they turn in work.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {(submissions.data || []).map((sub) => (
                <div key={sub.id} className="panel p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-card">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm text-foreground">
                        {sub.studentName || "Student"}
                      </p>
                      <span
                        className={`text-xs px-2 py-0.5 rounded font-medium ${
                          sub.status === "graded"
                            ? "bg-success/10 text-success"
                            : "bg-warning/10 text-warning"
                        }`}
                      >
                        {sub.status === "graded" ? `Graded: ${sub.score}/${a.maxPoints}` : "Needs Grading"}
                      </span>
                    </div>
                    {sub.answers?.text && (
                      <div className="mt-1 text-xs text-foreground/80 line-clamp-2 max-w-lg">
                        <RenderMathText text={sub.answers.text} />
                      </div>
                    )}
                  </div>

                  <Button
                    size="sm"
                    variant={sub.status === "graded" ? "outline" : "default"}
                    onClick={() => {
                      setGradingSub(sub);
                      setGradeScore(sub.score != null ? String(sub.score) : "");
                      setGradeFeedback(sub.feedback || "");
                    }}
                  >
                    {sub.status === "graded" ? "Edit Grade" : "Grade Work"}
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Grade Dialog */}
          <Dialog open={Boolean(gradingSub)} onOpenChange={(open) => !open && setGradingSub(null)}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Grade Submission — {gradingSub?.studentName}</DialogTitle>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="p-3 bg-secondary/50 rounded-md border text-sm max-h-48 overflow-y-auto">
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Student Answer:</p>
                  <RenderMathText text={gradingSub?.answers?.text || "No text provided"} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="score">Score (Out of {a.maxPoints})</Label>
                  <Input
                    id="score"
                    type="number"
                    min={0}
                    max={a.maxPoints}
                    value={gradeScore}
                    onChange={(e) => setGradeScore(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="feedback">Feedback for Student</Label>
                  <Textarea
                    id="feedback"
                    rows={3}
                    placeholder="Provide comments or guidance..."
                    value={gradeFeedback}
                    onChange={(e) => setGradeFeedback(e.target.value)}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setGradingSub(null)}>
                  Cancel
                </Button>
                <Button onClick={() => submitGrade.mutate()} disabled={submitGrade.isPending}>
                  {submitGrade.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Save Grade
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </section>
      )}
    </div>
  );
}
