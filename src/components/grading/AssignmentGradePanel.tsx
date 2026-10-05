import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CornerDownLeft, Loader2, SkipForward, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { getSubmission, gradeSubmission } from "@/lib/firebase/firestore";
import { useAuth } from "@/lib/auth";
import { formatDue, type SubmissionStatus } from "@/lib/assignments";
import { percentOf, quickMarks } from "@/lib/grading/types";
import { StatusBadge } from "@/components/StatusBadge";
import { SubmissionComments } from "@/components/SubmissionComments";
import { SubmissionViewer } from "@/components/grading/SubmissionViewer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const COMMENTS = [
  "Well done.",
  "Show your working.",
  "Check your units.",
  "Good method, small slip.",
  "Please add more detail.",
];

export function AssignmentGradePanel({
  submissionId,
  maxMarks,
  hasNext,
  onDone,
  onSkip,
}: {
  submissionId: string;
  maxMarks: number;
  hasNext: boolean;
  onDone: (status: "reviewed" | "returned") => void;
  onSkip: () => void;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [marks, setMarks] = useState("");
  const [feedback, setFeedback] = useState("");
  const [notes, setNotes] = useState("");
  const [released, setReleased] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  const q = useQuery({
    queryKey: ["grading", "submission", submissionId],
    queryFn: async () => {
      const sub = await getSubmission(submissionId);
      if (!sub) return null;
      return {
        sub,
        files: [],
        violations: [],
      };
    },
  });

  useEffect(() => {
    if (hydrated || !q.data?.sub) return;
    const s = q.data.sub;
    setMarks(s.score != null ? String(s.score) : "");
    setFeedback(s.feedback ?? "");
    setReleased(true);
    setHydrated(true);
  }, [q.data, hydrated]);

  const value = marks.trim() === "" ? null : Number(marks);
  const invalid = value !== null && (!Number.isFinite(value) || value < 0 || value > maxMarks);
  const pct = percentOf(value, maxMarks);

  const save = useMutation({
    mutationFn: async (status: "reviewed" | "returned") => {
      if (status === "reviewed" && value === null)
        throw new Error(`Enter marks from 0 to ${maxMarks}`);
      if (invalid) throw new Error(`Marks must be between 0 and ${maxMarks}`);
      if (status === "returned" && !feedback.trim())
        throw new Error("Tell the student what to change before returning the work");

      await gradeSubmission(
        submissionId,
        value ?? 0,
        feedback.trim() + (notes.trim() ? `\nImprovement: ${notes.trim()}` : ""),
        user?.id || "teacher",
      );
      return status;
    },
    onSuccess: (status) => {
      toast.success(status === "returned" ? "Returned to student" : "Grade saved");
      void qc.invalidateQueries();
      onDone(status);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }
  if (!q.data) return <p className="text-muted-foreground">Submission not found.</p>;

  const { sub, files, violations } = q.data;
  const alreadyGraded = sub.status === "graded";
  const busy = save.isPending;

  const submit = () => save.mutate("reviewed");

  const typedContent =
    typeof sub.answers === "string" ? sub.answers : JSON.stringify(sub.answers || "");

  return (
    <div className="space-y-5">
      <div className="panel flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="text-sm text-muted-foreground">
          {sub.submittedAt ? `Submitted ${formatDue(sub.submittedAt)}` : "Submitted"}
        </p>
        <StatusBadge status={sub.status as SubmissionStatus} />
      </div>

      <SubmissionViewer
        files={files}
        typedContent={typedContent}
        violations={violations}
        violationCount={0}
      />

      <section
        className="panel space-y-5 p-5 sm:p-6"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !busy) {
            e.preventDefault();
            submit();
          }
        }}
      >
        <h2 className="text-lg font-semibold">Grade &amp; feedback</h2>

        <div className="space-y-2">
          <Label htmlFor="gp-marks">Marks</Label>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-baseline gap-2">
              <Input
                id="gp-marks"
                type="number"
                inputMode="decimal"
                min={0}
                max={maxMarks}
                step={0.5}
                value={marks}
                onChange={(e) => setMarks(e.target.value)}
                aria-invalid={invalid}
                className={cn(
                  "h-12 w-28 text-center text-2xl font-semibold",
                  invalid && "border-destructive",
                )}
              />
              <span className="text-muted-foreground">/ {maxMarks}</span>
              {pct !== null && !invalid && (
                <span className="ml-1 text-sm font-medium text-muted-foreground tabular-nums">
                  {pct}%
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick marks">
              {quickMarks(maxMarks).map((m) => (
                <Button
                  key={m.label}
                  type="button"
                  size="sm"
                  variant={value === m.value ? "default" : "outline"}
                  onClick={() => setMarks(String(m.value))}
                >
                  {m.label}
                </Button>
              ))}
            </div>
          </div>
          {invalid && (
            <p className="text-xs text-destructive">Marks must be between 0 and {maxMarks}.</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="gp-fb">Feedback</Label>
          <Textarea
            id="gp-fb"
            maxLength={4000}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="What went well, and what to fix"
            className="min-h-28"
          />
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick comments">
            {COMMENTS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setFeedback((f) => (f.trim() ? `${f.trimEnd()} ${c}` : c))}
                className="cursor-pointer rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                + {c}
              </button>
            ))}
          </div>
        </div>

        <details
          className="group rounded-md border border-border/70 px-3 py-2"
          open={Boolean(notes)}
        >
          <summary className="cursor-pointer text-sm text-muted-foreground">
            Add a &ldquo;how to improve&rdquo; note (optional)
          </summary>
          <Textarea
            maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-2"
            aria-label="How to improve"
          />
        </details>

        <div className="flex items-start justify-between gap-4 rounded-md border border-border p-3">
          <div>
            <Label htmlFor="gp-release" className="text-sm font-medium">
              Show the grade to the student
            </Label>
            <p className="text-xs text-muted-foreground">
              Marks and feedback will be visible immediately upon grading.
            </p>
          </div>
          <Switch id="gp-release" checked={released} onCheckedChange={setReleased} />
        </div>
      </section>

      <div className="sticky bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-30 lg:bottom-4">
        <div className="panel glass flex flex-wrap items-center gap-2 p-3 shadow-lg">
          <Button onClick={submit} disabled={busy || invalid} className="gap-1.5">
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CornerDownLeft className="size-4" />
            )}
            {alreadyGraded ? "Update grade" : hasNext ? "Save & next" : "Save grade"}
          </Button>
          <Button
            variant="outline"
            onClick={() => save.mutate("returned")}
            disabled={busy}
            className="gap-1.5"
          >
            <Undo2 className="size-4" /> Return for changes
          </Button>
          {hasNext && (
            <Button variant="ghost" onClick={onSkip} disabled={busy} className="ml-auto gap-1.5">
              <SkipForward className="size-4" /> Skip
            </Button>
          )}
          <span className="ml-auto hidden text-xs text-muted-foreground xl:inline">
            Ctrl + Enter to save
          </span>
        </div>
      </div>

      <details className="panel p-4">
        <summary className="cursor-pointer text-sm font-medium">Comments with the student</summary>
        <div className="mt-3">
          <SubmissionComments submissionId={submissionId} />
        </div>
      </details>
    </div>
  );
}
