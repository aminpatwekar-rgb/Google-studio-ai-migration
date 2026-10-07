import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Copy,
  Link2,
  Settings,
  UserPlus,
  Plus,
  Users,
  BookOpen,
  ClipboardList,
  ChevronRight,
  UserMinus,
  Calendar,
  MoreHorizontal,
  Archive,
  ArchiveRestore,
  Copy as DuplicateIcon,
  Trash2,
  Edit,
  Shield,
  FileEdit,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useViewRole } from "@/lib/viewRole";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AssignmentDialog } from "@/components/AssignmentDialog";
import { ClassSettingsDialog } from "@/components/ClassSettingsDialog";
import { Announcements } from "@/components/Announcements";
import { ClassResources } from "@/components/ClassResources";
import { ClassDiscussion } from "@/components/ClassDiscussion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getClass,
  getAssignmentsByClass,
  getQuizzesByClass,
  getUserProfile,
  updateClass,
  createAssignment,
  deleteAssignment,
  updateAssignment,
  getAllUsers,
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferEmail, setTransferEmail] = useState("");
  const [activeTab, setActiveTab] = useState("assignments");

  const klass = useQuery({
    queryKey: ["class", classId, user?.id],
    enabled: Boolean(user?.id && classId),
    queryFn: async () => {
      const c = await getClass(classId);
      if (!c) throw new Error("Class not found");
      return c;
    },
  });

  const assignments = useQuery({
    queryKey: ["class-assignments", classId, user?.id],
    enabled: Boolean(user?.id && classId),
    queryFn: async () => {
      return await getAssignmentsByClass(classId);
    },
  });

  const quizzes = useQuery({
    queryKey: ["class-quizzes", classId, user?.id],
    enabled: Boolean(user?.id && classId),
    queryFn: async () => {
      return await getQuizzesByClass(classId);
    },
  });

  const roster = useQuery({
    queryKey: ["class-roster", classId, klass.data?.studentIds],
    enabled: Boolean(klass.data?.studentIds?.length),
    queryFn: async () => {
      const studentIds = klass.data?.studentIds || [];
      const profiles: UserProfile[] = [];
      for (const sid of studentIds) {
        const p = await getUserProfile(sid);
        if (p) profiles.push(p);
        else
          profiles.push({
            id: sid,
            name: "Student",
            email: null,
            role: "student",
            classIds: [],
            createdAt: "",
          });
      }
      return profiles;
    },
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

  const transferOwnership = useMutation({
    mutationFn: async (targetEmail: string) => {
      if (!targetEmail.trim()) throw new Error("Enter teacher email");
      const all = await getAllUsers();
      const target = all.find(
        (u) => (u.email || "").toLowerCase() === targetEmail.trim().toLowerCase(),
      );
      if (!target) throw new Error("No user found with that email.");
      await updateClass(classId, {
        teacherId: target.id,
        teacherName: target.name || "Teacher",
        teacherIds: [...new Set([...(klass.data?.teacherIds || []), target.id])],
      });
    },
    onSuccess: () => {
      toast.success("Class ownership transferred successfully");
      setTransferOpen(false);
      setTransferEmail("");
      void qc.invalidateQueries({ queryKey: ["class", classId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const duplicateAssignment = useMutation({
    mutationFn: async (a: Assignment) => {
      await createAssignment({
        classId: a.classId,
        title: `${a.title} (Copy)`,
        description: a.description,
        dueDate: a.dueDate,
        maxPoints: a.maxPoints,
        createdBy: user?.id || a.createdBy,
        createdAt: new Date().toISOString(),
        published: a.published,
        submissionType: a.submissionType,
        rubricId: a.rubricId,
      });
    },
    onSuccess: () => {
      toast.success("Assignment duplicated");
      void qc.invalidateQueries({ queryKey: ["class-assignments", classId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleArchiveAssignment = useMutation({
    mutationFn: async (a: Assignment) => {
      await updateAssignment(a.id, {
        archived: !a.archived,
      });
    },
    onSuccess: (_, a) => {
      toast.success(a.archived ? "Assignment restored" : "Assignment archived");
      void qc.invalidateQueries({ queryKey: ["class-assignments", classId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeAssignment = useMutation({
    mutationFn: async (id: string) => {
      await deleteAssignment(id);
    },
    onSuccess: () => {
      toast.success("Assignment deleted");
      void qc.invalidateQueries({ queryKey: ["class-assignments", classId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (klass.isLoading) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (klass.isError || !klass.data) {
    return (
      <div className="panel p-8 text-center text-sm">
        <p className="text-destructive font-semibold">Couldn't load class</p>
        <p className="text-muted-foreground mt-1">
          {(klass.error as Error)?.message || "Class not found"}
        </p>
        <Button asChild size="sm" variant="outline" className="mt-4">
          <Link to="/classes">Back to classes</Link>
        </Button>
      </div>
    );
  }

  const c = klass.data;
  const isOwner = c.teacherId === user?.id || effectiveRole === "admin";
  const allAssignments = assignments.data || [];
  const publishedAssignments = allAssignments.filter((a) => !a.archived && a.published !== false);
  const draftAssignments = allAssignments.filter((a) => !a.archived && a.published === false);
  const archivedAssignments = allAssignments.filter((a) => a.archived === true);

  const copyInviteLink = () => {
    const inviteUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/classes?join=${c.joinCode}`;
    void navigator.clipboard.writeText(inviteUrl);
    toast.success("Invite link copied to clipboard!");
  };

  const copyJoinCode = () => {
    void navigator.clipboard.writeText(c.joinCode);
    toast.success(`Copied join code: ${c.joinCode}`);
  };

  return (
    <div className="space-y-6">
      {/* Back Navigation */}
      <div>
        <Link
          to="/classes"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-3.5" /> All classes
        </Link>
      </div>

      {/* Class Header matching Image 1 */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {c.name}
          </h1>
          <p className="text-xs text-muted-foreground mt-1 font-medium">
            {c.subject || "A"} · {c.section || "A"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {c.joinCode && (
            <button
              type="button"
              onClick={copyJoinCode}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card/80 px-3 py-1.5 text-xs font-mono font-medium hover:bg-secondary transition-colors"
              title="Click to copy join code"
            >
              <span>{c.joinCode}</span>
              <Copy className="size-3.5 text-muted-foreground" />
            </button>
          )}

          {isTeacher && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={copyInviteLink}
                className="gap-1.5 text-xs"
              >
                <Link2 className="size-3.5" /> Invite link
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setSettingsOpen(true)}
                className="gap-1.5 text-xs"
              >
                <Settings className="size-3.5" /> Settings
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setTransferOpen(true)}
                className="gap-1.5 text-xs"
              >
                <UserPlus className="size-3.5" /> Transfer
              </Button>

              <Button
                size="sm"
                onClick={() => setAssignmentOpen(true)}
                className="gap-1.5 bg-primary text-primary-foreground font-medium"
              >
                <Plus className="size-4" /> New assignment
              </Button>
            </>
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

      {/* Tabs matching Image 1 */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-card/70 border border-border/80 p-1 flex flex-wrap h-auto gap-1">
          <TabsTrigger value="assignments" className="rounded-md text-xs font-medium">
            Assignments ({publishedAssignments.length})
          </TabsTrigger>
          {isTeacher && (
            <TabsTrigger value="drafts" className="rounded-md text-xs font-medium">
              Drafts ({draftAssignments.length})
            </TabsTrigger>
          )}
          {isTeacher && (
            <TabsTrigger value="archived" className="rounded-md text-xs font-medium">
              Archived ({archivedAssignments.length})
            </TabsTrigger>
          )}
          <TabsTrigger value="students" className="rounded-md text-xs font-medium">
            Students ({(c.studentIds || []).length})
          </TabsTrigger>
          <TabsTrigger value="announcements" className="rounded-md text-xs font-medium">
            Announcements
          </TabsTrigger>
          <TabsTrigger value="resources" className="rounded-md text-xs font-medium">
            Resources
          </TabsTrigger>
          <TabsTrigger value="discussion" className="rounded-md text-xs font-medium">
            Discussion
          </TabsTrigger>
        </TabsList>

        {/* Published Assignments Tab */}
        <TabsContent value="assignments" className="space-y-3">
          {assignments.isLoading ? (
            <div className="grid gap-3">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
          ) : publishedAssignments.length === 0 ? (
            <div className="panel p-8 text-center border-dashed border-border/80">
              <p className="text-sm font-semibold text-foreground">
                No assignments in this class yet
              </p>
              {isTeacher && (
                <Button size="sm" onClick={() => setAssignmentOpen(true)} className="mt-3">
                  Create Assignment
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-3">
              {publishedAssignments.map((a) => (
                <div
                  key={a.id}
                  className="panel p-4 flex items-center justify-between bg-card hover:border-primary/40 transition-all hover:shadow-sm"
                >
                  <Link
                    to="/assignments/$assignmentId"
                    params={{ assignmentId: a.id }}
                    className="space-y-2 flex-1"
                  >
                    <p className="font-semibold text-sm text-foreground hover:text-primary transition-colors">
                      {a.title}
                    </p>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary/10 text-primary text-xs font-medium">
                      <Calendar className="size-3" />
                      <span>Due: {formatDue(a.dueDate)}</span>
                    </div>
                  </Link>

                  {isTeacher && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground"
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem
                          onSelect={() =>
                            navigate({
                              to: "/assignments/$assignmentId",
                              params: { assignmentId: a.id },
                            })
                          }
                        >
                          <Edit className="mr-2 size-4" /> Open / Grade
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => duplicateAssignment.mutate(a)}>
                          <DuplicateIcon className="mr-2 size-4" /> Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => toggleArchiveAssignment.mutate(a)}>
                          <Archive className="mr-2 size-4" /> Archive
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => removeAssignment.mutate(a.id)}
                        >
                          <Trash2 className="mr-2 size-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Drafts Tab */}
        {isTeacher && (
          <TabsContent value="drafts" className="space-y-3">
            {draftAssignments.length === 0 ? (
              <p className="panel p-6 text-sm text-muted-foreground">No draft assignments.</p>
            ) : (
              <div className="grid gap-3">
                {draftAssignments.map((a) => (
                  <div
                    key={a.id}
                    className="panel p-4 flex items-center justify-between bg-card hover:border-primary/40 transition-all hover:shadow-sm"
                  >
                    <Link
                      to="/assignments/$assignmentId"
                      params={{ assignmentId: a.id }}
                      className="space-y-1 flex-1"
                    >
                      <p className="font-semibold text-sm text-foreground">{a.title}</p>
                      <span className="text-xs text-muted-foreground">Draft — not published</span>
                    </Link>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          updateAssignment(a.id, { published: true }).then(() =>
                            qc.invalidateQueries({ queryKey: ["class-assignments", classId] }),
                          )
                        }
                      >
                        Publish
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        )}

        {/* Archived Tab */}
        {isTeacher && (
          <TabsContent value="archived" className="space-y-3">
            {archivedAssignments.length === 0 ? (
              <p className="panel p-6 text-sm text-muted-foreground">No archived assignments.</p>
            ) : (
              <div className="grid gap-3">
                {archivedAssignments.map((a) => (
                  <div
                    key={a.id}
                    className="panel p-4 flex items-center justify-between bg-card opacity-75"
                  >
                    <div>
                      <p className="font-semibold text-sm line-through text-muted-foreground">
                        {a.title}
                      </p>
                      <span className="text-xs text-muted-foreground">Archived</span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggleArchiveAssignment.mutate(a)}
                    >
                      <ArchiveRestore className="size-3.5 mr-1" /> Restore
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        )}

        {/* Students / Roster Tab */}
        <TabsContent value="students" className="space-y-3">
          {(c.studentIds || []).length === 0 ? (
            <div className="panel p-8 text-center border-dashed">
              <Users className="mx-auto size-8 text-muted-foreground/60" />
              <p className="mt-2 text-sm font-semibold">No students have joined yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Share join code{" "}
                <span className="font-mono font-bold text-foreground">{c.joinCode}</span> with
                students.
              </p>
            </div>
          ) : (
            <div className="panel divide-y divide-border bg-card">
              {(roster.data || []).map((student) => (
                <div key={student.id} className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{student.name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      {student.rollNo && <span>Roll: {student.rollNo}</span>}
                      {student.erNo && <span>ER: {student.erNo}</span>}
                      {student.srNo && <span>SR: {student.srNo}</span>}
                    </div>
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

        {/* Announcements Tab */}
        <TabsContent value="announcements" className="space-y-3">
          <Announcements classId={classId} canPost={isTeacher} />
        </TabsContent>

        {/* Resources Tab */}
        <TabsContent value="resources" className="space-y-3">
          <ClassResources classId={classId} canManage={isTeacher} />
        </TabsContent>

        {/* Discussion Tab */}
        <TabsContent value="discussion" className="space-y-3">
          <ClassDiscussion classId={classId} canModerate={isTeacher} />
        </TabsContent>
      </Tabs>

      {/* Assignment Creation Dialog */}
      {isTeacher && (
        <AssignmentDialog
          open={assignmentOpen}
          onOpenChange={setAssignmentOpen}
          classId={classId}
          teacherId={user?.id || ""}
        />
      )}

      {/* Class Settings Dialog */}
      <ClassSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        klass={{
          id: c.id,
          name: c.name,
          subject: c.subject || null,
          section: c.section || null,
          description: c.description || null,
          join_code: c.joinCode,
          teacher_id: c.teacherId,
          archived: c.archived || false,
          banner_url: c.bannerUrl || null,
        }}
      />

      {/* Transfer Ownership Dialog */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Transfer Class Ownership</DialogTitle>
            <DialogDescription>
              Assign a new lead teacher for this class by email. You will remain as a co-teacher.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="transferEmail">Teacher Email Address</Label>
            <Input
              id="transferEmail"
              type="email"
              placeholder="teacher@school.edu"
              value={transferEmail}
              onChange={(e) => setTransferEmail(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => transferOwnership.mutate(transferEmail)}
              disabled={transferOwnership.isPending}
            >
              Transfer Class
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
