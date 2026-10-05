import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, CheckCircle2, Clock3, Users } from "lucide-react";
import { fetchQuizAnalytics } from "@/lib/quiz/analytics";
import { useViewRole } from "@/lib/viewRole";
import { Button } from "@/components/ui/button";
import { PlanGate } from "@/components/PlanGate";

export const Route = createFileRoute("/_authenticated/quizzes/$quizId/analytics")({
  head: () => ({ meta: [{ title: "Quiz Analytics — ONYX" }] }),
  component: Page,
});

function Page() {
  const { quizId } = Route.useParams();
  const { effectiveRole } = useViewRole();
  const allowed = effectiveRole === "teacher" || effectiveRole === "admin";
  const q = useQuery({
    queryKey: ["quiz-analytics", quizId],
    enabled: allowed,
    queryFn: () => fetchQuizAnalytics(quizId),
    staleTime: 15_000,
  });
  if (!allowed)
    return (
      <div className="panel p-10 text-center">
        Analytics are available to teachers and administrators.
      </div>
    );
  if (q.isLoading) return <div className="panel p-10">Loading analytics…</div>;
  if (q.isError)
    return (
      <div className="panel p-10 text-center">
        <p className="text-sm text-destructive">{(q.error as Error).message}</p>
      </div>
    );
  const a = q.data!;
  const t = a.totals;
  return (
    <PlanGate feature="advanced_analytics">
      <div className="space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{a.quiz.title} · Analytics</h1>
            <p className="text-sm text-muted-foreground">
              {a.quiz.className ?? "Class"} · Real attempt data
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link to="/quizzes/$quizId" params={{ quizId }}>
              Back to quiz
            </Link>
          </Button>
        </header>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Assigned", t.assigned, Users],
            ["Attempted", t.attempted, BarChart3],
            ["Average", t.avgPct == null ? "—" : `${t.avgPct}%`, CheckCircle2],
            ["Pass rate", t.passRate == null ? "—" : `${t.passRate}%`, CheckCircle2],
          ].map(([label, value, Icon]: any) => (
            <div className="panel p-4" key={label}>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Icon className="size-4" />
                <span className="text-xs uppercase tracking-wide">{label}</span>
              </div>
              <p className="mt-2 text-2xl font-semibold">{value}</p>
            </div>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="panel p-5">
            <h2 className="font-semibold">Students</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="p-2">Student</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Score</th>
                    <th className="p-2">%</th>
                    <th className="p-2">
                      <Clock3 className="size-4" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {a.students.map((s) => (
                    <tr key={s.studentId} className="border-b border-border/60">
                      <td className="p-2 font-medium">{s.name}</td>
                      <td className="p-2 capitalize">{s.status.replace("_", " ")}</td>
                      <td className="p-2">{s.score == null ? "—" : `${s.score}/${s.maxScore}`}</td>
                      <td className="p-2">{s.pct == null ? "—" : `${s.pct}%`}</td>
                      <td className="p-2">
                        {s.timeTakenMs == null ? "—" : `${Math.round(s.timeTakenMs / 60000)}m`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel p-5">
            <h2 className="font-semibold">Questions</h2>
            <div className="mt-4 space-y-3">
              {a.questions.map((x) => (
                <div key={x.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium">
                      Q{x.index}. {x.prompt}
                    </p>
                    <span className="text-xs text-muted-foreground">{x.correctPct}% correct</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {x.responses} responses · {x.unanswered} unanswered · Avg {x.avgMarks} marks ·{" "}
                    {x.difficulty}
                  </p>
                  {x.options.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {x.options.map((o) => (
                        <div className="flex items-center justify-between text-xs" key={o.label}>
                          <span>{o.label}</span>
                          <span>
                            {o.count} ({o.pct}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
      ;
    </PlanGate>
  );
}
