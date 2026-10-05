import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Copy,
  Plus,
  Users,
  BookOpen,
  ClipboardList,
  ChevronRight,
  UserMinus,
  Calendar,
  Download,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useViewRole } from "@/lib/viewRole";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AssignmentDialog } from "@/components/AssignmentDialog";
import {
  getClass,
  getAssignmentsByClass,
  getQuizzesByClass,
  getUserProfile,
  updateClass,
  removeCoTeacher,
  getClassRoster,
  exportClassRosterCsv,
} from "@/lib/firebase/firestore";
import type { Assignment, Quiz, UserProfile } from "@/lib/firebase/models";
import { formatDue } from "@/lib/assignments";

export const Route = createFileRoute("/_authenticated/classes/$classId")({
  head: () => ({
    meta: [
      { title: "Class — ONYX" },
      { name: "description", content: "Class roster, assignments and join code." },
      { property: "og:title", content: "Class — ONYX" },
      { property: "og:description", content: "Class roster and assignments." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ClassDetail,
});

function ClassDetail() {
  const { classId } = Route.useParams();
  const { user } = useAuth();
  const { effectiveRole } = useViewRole();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const isTeacher = effectiveRole === "teacher" || effectiveRole === "admin";
  const [assignmentOpen, setAssignmentOpen] = useState(false);

  const klass = useQuery({
    queryKey: ["class", classId],
    queryFn: async () => {
      const c = await getClass(classId);
      if (!c) throw new Error("Class not found");
      return c;
    },
  });

  const assignments = useQuery({
    queryKey: ["class-assignments", classId],
    queryFn: async () => {
      return await getAssignmentsByClass(classId);
    },
  });

  const quizzes = useQuery({
    queryKey: ["class-quizzes", classId],
    queryFn: async () => {
      return await getQuizzesByClass(classId);
    },
  });

  const roster = useQuery({
    queryKey: ["class-roster", classId, klass.data?.studentIds],
    enabled: Boolean(klass.data?.studentIds?.length),
    queryFn: () => getClassRoster(classId),
  });

  const removeStudent = useMutation({
    mutationFn: async (studentId: string) => {
      if (!klass.data) return;
      const updatedStudents = (klass.data.studentIds || []).filter((id) => id !== studentId);
      await updateClass(classId, { studentIds: updatedStudents });
    },
    onSuccess: () => {
      toast.success("Student removed from class");
      void qc.invalidateQueries({ queryKey: ["class", classId] });
      void qc.invalidateQueries({ queryKey: ["class-roster", classId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const leaveClass = useMutation({
    mutationFn: async () => {
      if (!klass.data || !user) return;
      if (isCoTeacher) {
        await removeCoTeacher(classId, user.id);
        return;
      }
      const updatedStudents = (klass.data.studentIds || []).filter((id) => id !== user.id);
      await updateClass(classId, { studentIds: updatedStudents });
    },
    onSuccess: () => {
      toast.success("You have left the class");
      void qc.invalidateQueries();
      void navigate({ to: "/classes", replace: true });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (klass.isLoading) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (klass.isError || !klass.data) {
    return (
      <div className="panel p-8 text-center text-sm">
        <p className="text-destructive font-semibold">Couldn't load class</p>
        <p className="text-muted-foreground mt-1">{(klass.error as Error)?.message || "Class not found"}</p>
        <Button asChild size="sm" variant="outline" className="mt-4">
          <Link to="/classes">Back to classes</Link>
        </Button>
      </div>
    );
  }

  const c = klass.data;
  const teacherIds = c.teacherIds || [c.teacherId];
  const isOwner = c.teacherId === user?.id || effectiveRole === "admin";
  const isCoTeacher = isTeacher && teacherIds.includes(user?.id || "") && !isOwner;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link to="/classes" className="hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="size-3.5" /> Classes
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">{c.name}</span>
      </div>

      <header className="panel p-6 bg-card border-border flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{c.name}</h1>
          </div>
          {c.subject && <p className="text-sm text-primary font-medium mt-0.5">{c.subject}</p>}
          {c.description && <p className="text-xs text-muted-foreground mt-2 max-w-xl">{c.description}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {c.joinCode && (
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(c.joinCode);
                toast.success(`Copied join code: ${c.joinCode}`);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary/80 px-3 py-1.5 text-xs font-mono font-medium hover:bg-secondary transition-colors"
              title="Click to copy code"
            >
              <span>Code: {c.joinCode}</span>
              <Copy className="size-3.5 text-muted-foreground" />
            </button>
          )}

          {isTeacher && isOwner && (
            <Button size="sm" onClick={() => setAssignmentOpen(true)} className="gap-1.5 press">
              <Plus className="size-4" /> New Assignment
            </Button>
          )}

          {isCoTeacher && (
            <Button size="sm" variant="outline" onClick={() => leaveClass.mutate()} disabled={leaveClass.isPending} className="text-destructive hover:bg-destructive/10">Leave as Co-teacher</Button>
          )}

          {!isTeacher && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => leaveClass.mutate()}
              disabled={leaveClass.isPending}
              className="text-destructive hover:bg-destructive/10"
            >
              Leave Class
            </Button>
          )}
        </div>
      </header>

      <Tabs defaultValue="assignments" className="space-y-4">
        <TabsList>
          <TabsTrigger value="assignments" className="gap-1.5">
            <BookOpen className="size-3.5" /> Assignments ({(assignments.data || []).length})
          </TabsTrigger>
          <TabsTrigger value="quizzes" className="gap-1.5">
            <ClipboardList className="size-3.5" /> Quizzes ({(quizzes.data || []).length})
          </TabsTrigger>
          <TabsTrigger value="roster" className="gap-1.5">
            <Users className="size-3.5" /> Roster ({(c.studentIds || []).length})
          </TabsTrigger>
          {isTeacher && isOwner && (roster.data?.length || 0) > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="ml-auto gap-1.5"
              onClick={() => {
                const csv = exportClassRosterCsv(roster.data || []);
                const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${c.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "class"}-roster.csv`;
                a.click();
                URL.revokeObjectURL(url);
                toast.success("Roster CSV exported");
              }}
            >
              <Download className="size-3.5" /> Export CSV
            </Button>
          )}
        </TabsList>

        <TabsContent value="assignments" className="space-y-3">
          {assignments.isLoading ? (
            <div className="grid gap-3">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
          ) : (assignments.data || []).length === 0 ? (
            <div className="panel p-8 text-center border-dashed">
              <p className="text-sm font-semibold text-foreground">No assignments in this class yet</p>
              {isTeacher && (
                <Button size="sm" onClick={() => setAssignmentOpen(true)} className="mt-3">
                  Create Assignment
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-3">
              {(assignments.data || []).map((a) => (
                <Link
                  key={a.id}
                  to="/assignments/$assignmentId"
                  params={{ assignmentId: a.id }}
                  className="panel p-4 flex items-center justify-between bg-card hover:border-primary/40 transition-all hover:shadow-sm"
                >
                  <div className="space-y-1">
                    <p className="font-semibold text-sm text-foreground hover:text-primary transition-colors">
                      {a.title}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="size-3" /> Due {formatDue(a.dueDate)}
                      </span>
                      <span>•</span>
                      <span>{a.maxPoints} points</span>
                    </div>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="quizzes" className="space-y-3">
          {quizzes.isLoading ? (
            <div className="grid gap-3">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
          ) : (quizzes.data || []).length === 0 ? (
            <div className="panel p-8 text-center border-dashed">
              <p className="text-sm font-semibold text-foreground">No quizzes posted yet</p>
              {isTeacher && (
                <Button asChild size="sm" className="mt-3">
                  <Link to="/quizzes">Go to Quiz Creator</Link>
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-3">
              {(quizzes.data || []).map((q) => (
                <Link
                  key={q.id}
                  to="/quizzes/$quizId"
                  params={{ quizId: q.id }}
                  className="panel p-4 flex items-center justify-between bg-card hover:border-primary/40 transition-all hover:shadow-sm"
                >
                  <div className="space-y-1">
                    <p className="font-semibold text-sm text-foreground hover:text-primary transition-colors">
                      {q.title}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{(q.questions || []).length} questions</span>
                      <span>•</span>
                      <span>{q.timeLimit || 30} mins</span>
                    </div>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="roster" className="space-y-3">
          {(c.studentIds || []).length === 0 ? (
            <div className="panel p-8 text-center border-dashed">
              <Users className="mx-auto size-8 text-muted-foreground/60" />
              <p className="mt-2 text-sm font-semibold">No students have joined yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                {teacherIds.length > 1 && <span className="mr-1">{teacherIds.length} teachers ·</span>}
                Share join code <span className="font-mono font-bold text-foreground">{c.joinCode}</span> with students.
              </p>
            </div>
          ) : (
            <div className="panel divide-y divide-border bg-card">
              {(roster.data || []).map((student) => (
                <div key={student.id} className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{student.name}</p>
                    {student.rollNo && (
                      <p className="text-xs text-muted-foreground">Roll No: {student.rollNo}</p>
                    )}
                  </div>
                  {isTeacher && isOwner && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:bg-destructive/10 text-xs gap-1"
                      onClick={() => removeStudent.mutate(student.id)}
                      disabled={removeStudent.isPending}
                    >
                      <UserMinus className="size-3.5" /> Remove
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {isTeacher && (
        <AssignmentDialog
          open={assignmentOpen}
          onOpenChange={setAssignmentOpen}
          classId={classId}
          teacherId={user?.id || ""}
        />
      )}
    </div>
  );
}
