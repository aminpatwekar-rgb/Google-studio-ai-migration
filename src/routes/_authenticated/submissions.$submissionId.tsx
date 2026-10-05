import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useViewRole } from "@/lib/viewRole";
import { RenderMathText } from "@/components/math/RenderMathText";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { getSubmission, gradeSubmission, getAssignment } from "@/lib/firebase/firestore";

export const Route = createFileRoute("/_authenticated/submissions/$submissionId")({
  head: () => ({
    meta: [
      { title: "Review Submission — ONYX" },
      { name: "description", content: "Review a student submission, grade it and leave feedback." },
      { property: "og:title", content: "Review Submission — ONYX" },
    ],
  }),
  component: ReviewSubmission,
});

function ReviewSubmission() {
  const { submissionId } = Route.useParams();
  const { user } = useAuth();
  const { effectiveRole } = useViewRole();
  const qc = useQueryClient();
  const isTeacher = effectiveRole === "teacher" || effectiveRole === "admin";

  const [marks, setMarks] = useState("");
  const [feedback, setFeedback] = useState("");

  const q = useQuery({
    queryKey: ["submission", submissionId],
    queryFn: async () => {
      const sub = await getSubmission(submissionId);
      if (!sub) return null;
      let assignment = null;
      if (sub.type === "assignment") {
        assignment = await getAssignment(sub.refId);
      }
      return { sub, assignment };
    },
  });

  useEffect(() => {
    if (q.data?.sub) {
      setMarks(q.data.sub.score != null ? String(q.data.sub.score) : "");
      setFeedback(q.data.sub.feedback || "");
    }
  }, [q.data]);

  const save = useMutation({
    mutationFn: async () => {
      const scoreNum = parseFloat(marks);
      if (isNaN(scoreNum) || scoreNum < 0) throw new Error("Enter a valid mark");
      await gradeSubmission(submissionId, scoreNum, feedback.trim(), user?.id || "teacher");
    },
    onSuccess: () => {
      toast.success("Grade and feedback saved!");
      void qc.invalidateQueries({ queryKey: ["submission", submissionId] });
      void qc.invalidateQueries({ queryKey: ["grading-queue"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) return <Skeleton className="h-64 rounded-xl" />;
  if (!q.data?.sub) {
    return (
      <div className="panel p-8 text-center text-sm">
        <p className="text-muted-foreground">Submission not found</p>
        <Button asChild size="sm" variant="outline" className="mt-4">
          <Link to="/grading">Back to Grading</Link>
        </Button>
      </div>
    );
  }

  const { sub, assignment } = q.data;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link to="/grading" className="hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="size-3.5" /> Grading Hub
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">Review {sub.studentName}</span>
      </div>

      <header className="panel p-6 bg-card border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Submission: {sub.studentName || "Student"}
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Submitted {new Date(sub.submittedAt).toLocaleString()} • {sub.type}
          </p>
        </div>

        <span
          className={`text-xs font-semibold px-3 py-1 rounded-full ${
            sub.status === "graded"
              ? "bg-success/10 text-success"
              : "bg-warning/10 text-warning"
          }`}
        >
          {sub.status === "graded" ? `Graded: ${sub.score} pts` : "Awaiting Marks"}
        </span>
      </header>

      <section className="panel p-6 bg-card border-border space-y-4">
        <h2 className="text-base font-semibold text-foreground">Student Work</h2>
        <div className="p-4 bg-secondary/30 rounded-lg border text-sm">
          {sub.answers?.text ? (
            <RenderMathText text={sub.answers.text} />
          ) : sub.answers ? (
            <pre className="text-xs font-mono">{JSON.stringify(sub.answers, null, 2)}</pre>
          ) : (
            <p className="text-xs text-muted-foreground">No answers recorded</p>
          )}
        </div>
      </section>

      {isTeacher ? (
        <section className="panel p-6 bg-card border-border space-y-4">
          <h2 className="text-base font-semibold text-foreground">Teacher Evaluation</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="marks">Marks Awarded {assignment ? `(Max: ${assignment.maxPoints})` : ""}</Label>
              <Input
                id="marks"
                type="number"
                min={0}
                max={assignment?.maxPoints || 1000}
                value={marks}
                onChange={(e) => setMarks(e.target.value)}
                placeholder="e.g. 90"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="feedback">Feedback & Guidance</Label>
            <Textarea
              id="feedback"
              rows={4}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Leave notes, formulas corrections, or comments..."
            />
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={() => save.mutate()} disabled={save.isPending} className="gap-1.5 press">
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save Grade & Feedback
            </Button>
          </div>
        </section>
      ) : (
        sub.feedback && (
          <section className="panel p-6 bg-card border-border space-y-2">
            <h2 className="text-base font-semibold text-primary">Teacher Feedback</h2>
            <p className="text-sm bg-primary/5 p-4 rounded-lg border border-primary/20">{sub.feedback}</p>
          </section>
        )
      )}
    </div>
  );
}
