import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Printer } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useViewRole } from "@/lib/viewRole";
import {
  getTeacherClasses,
  getStudentClasses,
  getClass,
  getUserProfile,
  getStudentSubmissions,
} from "@/lib/firebase/firestore";
import { Button } from "@/components/ui/button";
import { PlanGate } from "@/components/PlanGate";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { downloadCsv, toCsv } from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "Progress Reports — ONYX" }] }),
  component: Page,
});

function Page() {
  const { user } = useAuth();
  const { effectiveRole } = useViewRole();
  const isTeacher = effectiveRole === "teacher" || effectiveRole === "admin";
  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");

  const classes = useQuery({
    queryKey: ["report-classes", user?.id, isTeacher],
    enabled: Boolean(user),
    queryFn: async () => {
      if (!user) return [];
      if (isTeacher) return await getTeacherClasses(user.id);
      return await getStudentClasses(user.id);
    },
  });

  const roster = useQuery({
    queryKey: ["report-roster", classId],
    enabled: isTeacher && Boolean(classId),
    queryFn: async () => {
      if (!classId) return [];
      const cls = await getClass(classId);
      if (!cls || !cls.studentIds) return [];
      return await Promise.all(
        cls.studentIds.map(async (sid) => {
          const profile = await getUserProfile(sid);
          return {
            student_id: sid,
            full_name: profile?.name || "Student",
          };
        }),
      );
    },
  });

  const target = isTeacher ? studentId || roster.data?.[0]?.student_id : user?.id;

  const report = useQuery({
    queryKey: ["progress-report", target, classId],
    enabled: Boolean(target),
    queryFn: async () => {
      if (!target) return null;
      const allSubs = await getStudentSubmissions(target);
      const filtered = classId ? allSubs.filter((s) => s.classId === classId) : allSubs;
      const graded = filtered.filter((s) => s.status === "graded" && s.score != null);
      const scores = graded.map((s) => s.score!);
      const totalScore = scores.reduce((sum, val) => sum + val, 0);
      const avgScore = scores.length ? Math.round((totalScore / scores.length) * 10) / 10 : 0;
      const highestScore = scores.length ? Math.max(...scores) : 0;

      return {
        Total_Submissions: filtered.length,
        Graded_Submissions: graded.length,
        Pending_Evaluation: filtered.filter((s) => s.status === "submitted").length,
        Average_Score: avgScore,
        Highest_Score: highestScore,
        Total_Points_Earned: totalScore,
      };
    },
  });

  const exportReport = () => {
    if (!report.data || !target) return;
    const r = report.data;
    downloadCsv(`onyx-progress-${target}.csv`, toCsv(["Metric", "Value"], Object.entries(r)));
  };

  return (
    <PlanGate feature="progress_reports">
      <div className="space-y-6 print:space-y-3">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Progress Reports</h1>
            <p className="text-sm text-muted-foreground">
              Real assignment progress calculated from ONYX records.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="mr-2 size-4" />
              Print
            </Button>
            <Button variant="outline" onClick={exportReport} disabled={!report.data}>
              <Download className="mr-2 size-4" />
              CSV
            </Button>
          </div>
        </header>

        <div className="flex flex-wrap gap-3">
          <Select
            value={classId}
            onValueChange={(v) => {
              setClassId(v);
              setStudentId("");
            }}
          >
            <SelectTrigger className="w-60">
              <SelectValue placeholder="All classes or select class" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All classes</SelectItem>
              {(classes.data ?? []).map((c: any) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isTeacher && roster.data && roster.data.length > 0 && (
            <Select
              value={studentId || roster.data?.[0]?.student_id || ""}
              onValueChange={setStudentId}
            >
              <SelectTrigger className="w-60">
                <SelectValue placeholder="Select student" />
              </SelectTrigger>
              <SelectContent>
                {(roster.data ?? []).map((s: any) => (
                  <SelectItem key={s.student_id} value={s.student_id}>
                    {s.full_name || "Student"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {!target ? (
          <div className="panel p-8 text-center text-sm text-muted-foreground">
            Select a student to generate a report.
          </div>
        ) : report.isLoading ? (
          <div className="panel p-8">Generating report…</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(report.data ?? {}).map(([k, v]) => (
              <div className="panel p-5" key={k}>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {k.replaceAll("_", " ")}
                </p>
                <p className="mt-2 text-2xl font-semibold">{String(v)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </PlanGate>
  );
}
