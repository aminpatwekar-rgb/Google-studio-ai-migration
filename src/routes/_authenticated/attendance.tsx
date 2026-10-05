import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Check, Save } from "lucide-react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/lib/auth";
import { useViewRole } from "@/lib/viewRole";
import { getTeacherClasses, getStudentClasses, getClass, getUserProfile } from "@/lib/firebase/firestore";
import { Button } from "@/components/ui/button";
import { PlanGate } from "@/components/PlanGate";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const STATUSES = ["present", "absent", "late", "excused"] as const;
type Status = (typeof STATUSES)[number];

export const Route = createFileRoute("/_authenticated/attendance")({
  head: () => ({ meta: [{ title: "Attendance — ONYX" }] }),
  component: Page,
});

function Page() {
  const { user } = useAuth();
  const { effectiveRole } = useViewRole();
  const isTeacher = effectiveRole === "teacher" || effectiveRole === "admin";
  const today = new Date().toISOString().slice(0, 10);
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState(today);
  const [draft, setDraft] = useState<Record<string, Status>>({});

  const classes = useQuery({
    queryKey: ["attendance-classes", user?.id, effectiveRole],
    enabled: Boolean(user),
    queryFn: async () => {
      if (!user) return [];
      if (isTeacher) {
        return await getTeacherClasses(user.id);
      } else {
        return await getStudentClasses(user.id);
      }
    },
  });

  const roster = useQuery({
    queryKey: ["attendance-roster", classId],
    enabled: isTeacher && Boolean(classId),
    queryFn: async () => {
      if (!classId) return [];
      const cls = await getClass(classId);
      if (!cls || !cls.studentIds) return [];
      const students = await Promise.all(
        cls.studentIds.map(async (sid) => {
          const profile = await getUserProfile(sid);
          return {
            student_id: sid,
            full_name: profile?.name || "Student",
            roll_no: profile?.rollNo || "",
          };
        }),
      );
      return students;
    },
  });

  const records = useQuery({
    queryKey: ["attendance-records", classId, date, user?.id, isTeacher],
    enabled: Boolean(classId && date),
    queryFn: async () => {
      try {
        const snap = await getDoc(doc(db, "classes", classId, "attendance", date));
        if (!snap.exists()) return {};
        return (snap.data()?.records || {}) as Record<string, Status>;
      } catch {
        return {};
      }
    },
  });

  const current = (records.data || {}) as Record<string, Status>;
  const values = { ...current, ...draft };

  async function save() {
    if (!classId || !date) return;
    await setDoc(
      doc(db, "classes", classId, "attendance", date),
      {
        classId,
        date,
        records: values,
        markedBy: user?.id || "teacher",
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
    setDraft({});
    await records.refetch();
  }

  const selectedClass = (classes.data ?? []).find((c) => c.id === classId);

  return (
    <PlanGate feature="attendance">
      <div className="space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Attendance Register</h1>
            <p className="text-sm text-muted-foreground">
              {isTeacher ? "Mark daily roll call and track student presence." : "Your class attendance log."}
            </p>
          </div>
          {isTeacher && classId && (
            <Button onClick={save} className="gap-2">
              <Save className="size-4" /> Save attendance
            </Button>
          )}
        </header>

        <div className="panel p-4 flex flex-wrap items-center gap-3">
          <div className="w-56">
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a class" />
              </SelectTrigger>
              <SelectContent>
                {(classes.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-44">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        {classId && (
          <div className="panel overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3">Student</th>
                  <th className="p-3">Roll No</th>
                  <th className="p-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(roster.data ?? []).map((s) => {
                  const currentStatus = values[s.student_id] || "present";
                  return (
                    <tr key={s.student_id} className="hover:bg-muted/40">
                      <td className="p-3 font-medium">{s.full_name}</td>
                      <td className="p-3 text-muted-foreground">{s.roll_no || "—"}</td>
                      <td className="p-3 text-right">
                        {isTeacher ? (
                          <div className="inline-flex gap-1">
                            {STATUSES.map((st) => (
                              <Button
                                key={st}
                                size="sm"
                                variant={currentStatus === st ? "default" : "outline"}
                                className="h-7 text-xs capitalize"
                                onClick={() => setDraft((d) => ({ ...d, [s.student_id]: st }))}
                              >
                                {st}
                              </Button>
                            ))}
                          </div>
                        ) : (
                          <Badge variant="outline" className="capitalize">
                            {currentStatus}
                          </Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {(roster.data ?? []).length === 0 && (
              <p className="p-6 text-center text-sm text-muted-foreground">
                No students enrolled in this class yet.
              </p>
            )}
          </div>
        )}
      </div>
    </PlanGate>
  );
}
