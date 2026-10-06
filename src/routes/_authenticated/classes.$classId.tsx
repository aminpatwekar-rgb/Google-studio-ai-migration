import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ChevronRight,
  ClipboardList,
  Copy,
  Download,
  Link2,
  LogOut,
  MoreHorizontal,
  Plus,
  Settings,
  UserMinus,
  Users,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useViewRole } from "@/lib/viewRole";
import { downloadCsv, toCsv } from "@/lib/csv";
import { Pagination } from "@/components/Pagination";
import { AssignmentDialog } from "@/components/AssignmentDialog";
import { AssignmentActions } from "@/components/AssignmentActions";
import { DueDateChip } from "@/components/DueDateChip";
import { Announcements } from "@/components/Announcements";
import { ClassDiscussion } from "@/components/ClassDiscussion";
import { ClassResources } from "@/components/ClassResources";
import { ClassSettingsDialog, type ClassRecord } from "@/components/ClassSettingsDialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  exportClassRosterCsv,
  getAssignmentsByClass,
  getClass,
  getClassRoster,
  getClassSubmissions,
  getQuizzesByClass,
  getTeachers,
  removeCoTeacher,
  removeStudentFromClass,
  transferClass,
} from "@/lib/firebase/firestore";
import type { Assignment } from "@/lib/firebase/models";
import { isArchived, isPublished } from "@/lib/assignments";

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
  const { user, role } = useAuth();
  const { effectiveRole } = useViewRole();
  const qc = useQueryClient();
  const navigate = useNavigate();
  // UI branches on effectiveRole; ownership/permission checks use the real role.
  const isTeacher = effectiveRole === "teacher" || effectiveRole === "admin";
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [newOwner, setNewOwner] = useState("");
  const [rosterPage, setRosterPage] = useState(1);

  const klass = useQuery({
    queryKey: ["class", classId],
    queryFn: async () => {
      const c = await getClass(classId);
      if (!c) throw new Error("Class not found");
      return c;
    },
  });

  const teachers = useQuery({
    enabled: role === "admin" && transferOpen,
    queryKey: ["teacher-options"],
    queryFn: getTeachers,
  });

  const transfer = useMutation({
    mutationFn: async () => {
      if (!newOwner) throw new Error("Pick a teacher first");
      await transferClass(classId, newOwner);
    },
    onSuccess: () => {
      toast.success("Class ownership transferred");
      setTransferOpen(false);
      setNewOwner("");
      void qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const roster = useQuery({
    queryKey: ["class-roster", classId, klass.data?.studentIds],
    enabled: Boolean(klass.data),
    queryFn: () => getClassRoster(classId),
  });

  const assignments = useQuery({
    queryKey: ["class-assignments", classId],
    queryFn: () => getAssignmentsByClass(classId),
  });

  const quizzes = useQuery({
    queryKey: ["class-quizzes", classId],
    queryFn: () => getQuizzesByClass(classId),
  });

  // Per-student submission progress, derived from the database.
  const progress = useQuery({
    enabled: isTeacher && (assignments.data ?? []).length > 0,
    queryKey: ["class-progress", classId, (assignments.data ?? []).length],
    queryFn: async () => {
      const live = (assignments.data ?? []).filter((a) => isPublished(a) && !isArchived(a));
      const ids = new Set(live.map((a) => a.id));
      const subs = await getClassSubmissions(classId);
      const byStudent = new Map<string, number>();
      for (const s of subs) {
        if (s.type === "assignment" && ids.has(s.refId)) {
          byStudent.set(s.studentId, (byStudent.get(s.studentId) ?? 0) + 1);
        }
      }
      return { total: ids.size, byStudent };
    },
  });

  const removeMember = useMutation({
    mutationFn: (studentId: string) => removeStudentFromClass(classId, studentId),
    onSuccess: () => {
      toast.success("Student removed");
      void qc.invalidateQueries({ queryKey: ["class", classId] });
      void qc.invalidateQueries({ queryKey: ["class-roster", classId] });
      void qc.invalidateQueries({ queryKey: ["teacher-dash"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const leave = useMutation({
    mutationFn: async () => {
      if (!user) return;
      const teacherIds = klass.data?.teacherIds ?? [];
      if (isTeacher && teacherIds.includes(user.id) && klass.data?.teacherId !== user.id) {
        await removeCoTeacher(classId, user.id);
      } else {
        await removeStudentFromClass(classId, user.id);
      }
    },
    onSuccess: () => {
      toast.success("You've left this class");
      void qc.invalidateQueries();
      void navigate({ to: "/classes", replace: true });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (klass.isLoading) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (klass.isError || !klass.data)
    return (
      <div className="panel p-6">
        <p className="text-sm text-muted-foreground">
          {(klass.error as Error | null)?.message || "We couldn't load this class."}
        </p>
        <Button className="mt-3" variant="outline" onClick={() => void klass.refetch()}>
          Try again
        </Button>
      </div>
    );

  const c = klass.data;
  const teacherIds = c.teacherIds ?? [c.teacherId];
  const isCoTeacher = isTeacher && teacherIds.includes(user?.id ?? "") && c.teacherId !== user?.id;
  // Only the class owner, co-teachers and platform admins manage a class.
  const canManage = role === "admin" || teacherIds.includes(user?.id ?? "");
  const record: ClassRecord = {
    id: c.id,
    name: c.name,
    subject: c.subject ?? null,
    section: c.section ?? null,
    description: c.description ?? null,
    join_code: c.joinCode,
    teacher_id: c.teacherId,
    archived: Boolean(c.archived),
    banner_url: null,
  };

  const inviteLink = `${window.location.origin}/classes?join=${c.joinCode}`;
  function copyInvite() {
    void navigator.clipboard.writeText(inviteLink);
    toast.success("Invitation link copied");
  }

  const rosterRows = roster.data ?? [];
  const rosterPageSize = 20;
  const rosterPageCount = Math.max(1, Math.ceil(rosterRows.length / rosterPageSize));
  const visibleRoster = rosterRows.slice(
    (rosterPage - 1) * rosterPageSize,
    rosterPage * rosterPageSize,
  );

  function exportRosterTemplate() {
    downloadCsv(
      "onyx-student-import-template.csv",
      toCsv(
        ["email", "full_name", "roll_no", "er_no", "sr_no"],
        [["student@example.com", "Student Name", "12", "ER123", "SR123"]],
      ),
    );
  }

  function exportRoster() {
    const csv = exportClassRosterCsv(rosterRows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${c.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "class"}-roster.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Roster CSV exported");
  }

  const all = [...(assignments.data ?? [])].sort(
    (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
  );
  const active = all.filter((a) => !isArchived(a) && isPublished(a));
  const drafts = all.filter((a) => !isArchived(a) && !isPublished(a));
  const archived = all.filter((a) => isArchived(a));
  const quizList = quizzes.data ?? [];

  function AssignmentList({ items }: { items: Assignment[] }) {
    if (assignments.isLoading)
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      );
    if (!items.length)
      return <p className="panel p-6 text-sm text-muted-foreground">Nothing here yet.</p>;
    return (
      <ul className="grid gap-3 sm:grid-cols-2">
        {items.map((a) => (
          <li key={a.id} className="panel lift flex items-start gap-3 p-4 hover:lift-hover">
            <Link
              to="/assignments/$assignmentId"
              params={{ assignmentId: a.id }}
              className="min-w-0 flex-1"
            >
              <div className="flex items-center gap-2">
                <p className="truncate font-medium">{a.title}</p>
                {!isPublished(a) && (
                  <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                    Draft
                  </span>
                )}
                {isArchived(a) && (
                  <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                    Archived
                  </span>
                )}
              </div>
              <div className="mt-2">
                <DueDateChip due={a.dueDate} size="sm" />
              </div>
            </Link>
            {isTeacher && canManage && user && (
              <AssignmentActions assignment={a} teacherId={user.id} />
            )}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="space-y-8">
      <Link
        to="/classes"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> All classes
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold">{c.name}</h1>
          <p className="mt-1 text-muted-foreground">
            {[c.subject, c.section].filter(Boolean).join(" · ") || "No subject"}
          </p>
          {c.description && (
            <p className="mt-2 max-w-xl text-xs text-muted-foreground">{c.description}</p>
          )}
        </div>

        {!isTeacher && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline">
                <LogOut className="mr-1.5 size-4" /> Leave class
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Leave this class?</AlertDialogTitle>
                <AlertDialogDescription>
                  You will no longer have access to this class and its assignments. Work you
                  already submitted is kept.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault();
                    leave.mutate();
                  }}
                  disabled={leave.isPending}
                >
                  Leave class
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {isCoTeacher && (
          <Button
            variant="outline"
            className="text-destructive hover:bg-destructive/10"
            onClick={() => leave.mutate()}
            disabled={leave.isPending}
          >
            Leave as co-teacher
          </Button>
        )}

        {isTeacher && canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(c.joinCode);
                toast.success("Join code copied");
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-mono text-sm tracking-widest"
              title="Click to copy join code"
            >
              {c.joinCode}
              <Copy className="size-3.5" />
            </button>
            <Button variant="outline" className="hidden sm:inline-flex" onClick={copyInvite}>
              <Link2 className="mr-1.5 size-4" /> Invite link
            </Button>
            <Button
              variant="outline"
              className="hidden sm:inline-flex"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings className="mr-1.5 size-4" /> Settings
            </Button>
            {role === "admin" && (
              <Button
                variant="outline"
                className="hidden sm:inline-flex"
                onClick={() => setTransferOpen(true)}
              >
                <Users className="mr-1.5 size-4" /> Transfer
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="sm:hidden" aria-label="More actions">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={copyInvite}>
                  <Link2 className="mr-2 size-4" /> Invite link
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
                  <Settings className="mr-2 size-4" /> Settings
                </DropdownMenuItem>
                {role === "admin" && (
                  <DropdownMenuItem onClick={() => setTransferOpen(true)}>
                    <Users className="mr-2 size-4" /> Transfer
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button onClick={() => setOpen(true)}>
              <Plus className="mr-1.5 size-4" /> New assignment
            </Button>
            {user && (
              <AssignmentDialog
                open={open}
                onOpenChange={setOpen}
                classId={classId}
                teacherId={user.id}
                onSaved={(id) =>
                  void navigate({ to: "/assignments/$assignmentId", params: { assignmentId: id } })
                }
              />
            )}
            <ClassSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} klass={record} />
            <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Transfer class ownership</DialogTitle>
                </DialogHeader>
                <div className="space-y-1.5">
                  <Label>New owner</Label>
                  <Select value={newOwner} onValueChange={setNewOwner}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a teacher" />
                    </SelectTrigger>
                    <SelectContent>
                      {(teachers.data ?? [])
                        .filter((t) => t.id !== c.teacherId)
                        .map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name || t.email || t.id}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <Button onClick={() => transfer.mutate()} disabled={transfer.isPending || !newOwner}>
                    Transfer class
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </header>

      <Tabs defaultValue="assignments">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="assignments">Assignments ({active.length})</TabsTrigger>
          {isTeacher && <TabsTrigger value="drafts">Drafts ({drafts.length})</TabsTrigger>}
          {isTeacher && <TabsTrigger value="archived">Archived ({archived.length})</TabsTrigger>}
          <TabsTrigger value="quizzes">Quizzes ({quizList.length})</TabsTrigger>
          <TabsTrigger value="students">
            {isTeacher ? "Students" : "Classmates"} ({rosterRows.length})
          </TabsTrigger>
          <TabsTrigger value="announcements">Announcements</TabsTrigger>
          <TabsTrigger value="resources">Resources</TabsTrigger>
          <TabsTrigger value="discussion">Discussion</TabsTrigger>
        </TabsList>

        <TabsContent value="announcements" className="mt-5">
          <Announcements classId={classId} canPost={canManage} emptyText="No class announcements yet." />
        </TabsContent>
        <TabsContent value="resources" className="mt-5">
          <ClassResources classId={classId} canManage={canManage} />
        </TabsContent>
        <TabsContent value="discussion" className="mt-5">
          <ClassDiscussion classId={classId} canModerate={canManage} />
        </TabsContent>

        <TabsContent value="assignments" className="mt-5 space-y-3">
          <AssignmentList items={active} />
        </TabsContent>
        {isTeacher && (
          <TabsContent value="drafts" className="mt-5 space-y-3">
            <AssignmentList items={drafts} />
          </TabsContent>
        )}
        {isTeacher && (
          <TabsContent value="archived" className="mt-5 space-y-3">
            <AssignmentList items={archived} />
          </TabsContent>
        )}

        <TabsContent value="quizzes" className="mt-5 space-y-3">
          {quizzes.isLoading ? (
            <Skeleton className="h-20 rounded-xl" />
          ) : quizList.length === 0 ? (
            <div className="panel p-6 text-center">
              <ClipboardList className="mx-auto size-7 text-muted-foreground/60" />
              <p className="mt-2 text-sm font-semibold">No quizzes posted yet</p>
              {isTeacher && (
                <Button asChild size="sm" className="mt-3">
                  <Link to="/quizzes">Go to Quiz Creator</Link>
                </Button>
              )}
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {quizList.map((q) => (
                <li key={q.id}>
                  <Link
                    to="/quizzes/$quizId"
                    params={{ quizId: q.id }}
                    className="panel lift flex items-center justify-between gap-3 p-4 hover:lift-hover"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{q.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {(q.questions ?? []).length} questions · {q.timeLimit || 30} mins
                      </p>
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="students" className="mt-5">
          {isTeacher && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Button variant="ghost" onClick={exportRosterTemplate}>
                <Download className="mr-1.5 size-4" /> CSV template
              </Button>
              <Button variant="ghost" asChild>
                <Link to="/classes/$classId/import" params={{ classId }}>
                  Import Students
                </Link>
              </Button>
              {rosterRows.length > 0 && (
                <Button variant="ghost" onClick={exportRoster}>
                  <Download className="mr-1.5 size-4" /> Export roster
                </Button>
              )}
            </div>
          )}
          {roster.isLoading ? (
            <Skeleton className="h-40 w-full rounded-xl" />
          ) : roster.isError ? (
            <div className="panel p-6">
              <p className="text-sm text-muted-foreground">We couldn't load the roster.</p>
              <Button className="mt-3" variant="outline" onClick={() => void roster.refetch()}>
                Try again
              </Button>
            </div>
          ) : rosterRows.length === 0 ? (
            <p className="panel p-6 text-sm text-muted-foreground">
              {isTeacher ? "No students yet. Share the join code above." : "No classmates yet."}
            </p>
          ) : (
            <>
              <ul className="panel divide-y divide-border">
                {visibleRoster.map((m) => {
                  const name = m.name?.trim() || "Student";
                  const identifiers = [
                    m.rollNo && `Roll ${m.rollNo}`,
                    m.erNo && `ER ${m.erNo}`,
                    m.srNo && `Sr ${m.srNo}`,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  const submitted = progress.data?.byStudent.get(m.id) ?? 0;
                  const total = progress.data?.total ?? 0;
                  return (
                    <li key={m.id} className="flex flex-wrap items-center gap-3 p-4">
                      <Avatar className="size-9">
                        <AvatarFallback className="text-xs">
                          {name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{name}</p>
                        {identifiers && (
                          <p className="truncate text-xs text-muted-foreground">{identifiers}</p>
                        )}
                      </div>
                      {isTeacher && (
                        <span className="rounded-full border border-success/40 bg-success/15 px-2 py-0.5 text-xs text-success">
                          {total > 0 ? `Active · ${submitted}/${total} submitted` : "Active"}
                        </span>
                      )}
                      {isTeacher && canManage && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label={`Remove ${name}`}>
                              <UserMinus className="size-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove {name} from this class?</AlertDialogTitle>
                              <AlertDialogDescription>
                                They will lose access to this class's assignments. They can rejoin
                                with the join code.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={(e) => {
                                  e.preventDefault();
                                  removeMember.mutate(m.id);
                                }}
                                disabled={removeMember.isPending}
                              >
                                Remove student
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </li>
                  );
                })}
              </ul>
              <Pagination page={rosterPage} pageCount={rosterPageCount} onPageChange={setRosterPage} />
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
