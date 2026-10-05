import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  BookOpen,
  FileClock,
  GraduationCap,
  Search,
  Shield,
  ShieldCheck,
  ShieldOff,
  Trash2,
  Users,
} from "lucide-react";
import {
  getAllUsers,
  getAllClasses,
  getAllAssignments,
  updateUserRole,
  updateClass,
  deleteClass as removeClassDoc,
} from "@/lib/firebase/firestore";
import { collection, getDocs, query as fsQuery, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth, type AppRole } from "@/lib/auth";
import { deletePlatformUser } from "@/lib/admin.functions";
import { formatDue } from "@/lib/assignments";
import { DueDateChip } from "@/components/DueDateChip";
import { Announcements } from "@/components/Announcements";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin console — ONYX" },
      {
        name: "description",
        content: "Platform statistics, user management, classes and announcements for ONYX admins.",
      },
      { property: "og:title", content: "Admin console — ONYX" },
      { property: "og:description", content: "Manage users, classes and announcements." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminConsole,
});

type UserRow = {
  id: string;
  full_name: string;
  email: string | null;
  is_active: boolean;
  created_at: string;
  role: AppRole | null;
};

function Stat({
  icon: Icon,
  label,
  value,
  tone = "text-primary",
}: {
  icon: typeof Users;
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="panel lift p-5 hover:lift-hover">
      <Icon className={`size-4 ${tone}`} />
      <p className="mt-3 text-3xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function AdminConsole() {
  const { role, user, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isAdmin = role === "admin";

  useEffect(() => {
    if (!loading && role && role !== "admin") void navigate({ to: "/dashboard", replace: true });
  }, [loading, role, navigate]);

  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | AppRole>("all");
  const [pendingDelete, setPendingDelete] = useState<UserRow | null>(null);

  const users = useQuery({
    enabled: isAdmin,
    queryKey: ["admin-users"],
    queryFn: async (): Promise<UserRow[]> => {
      const all = await getAllUsers();
      return all.map((u) => ({
        id: u.id,
        full_name: u.name,
        email: u.email,
        is_active: true,
        created_at: u.createdAt,
        role: u.role,
      }));
    },
  });

  const classes = useQuery({
    enabled: isAdmin,
    queryKey: ["admin-classes"],
    queryFn: async () => {
      return await getAllClasses();
    },
  });

  const assignments = useQuery({
    enabled: isAdmin,
    queryKey: ["admin-assignments"],
    queryFn: async () => {
      return await getAllAssignments();
    },
  });

  const submissions = useQuery({
    enabled: isAdmin,
    queryKey: ["admin-submissions"],
    queryFn: async () => {
      try {
        const snap = await getDocs(
          fsQuery(collection(db, "submissions"), orderBy("submittedAt", "desc"), limit(200)),
        );
        return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      } catch {
        return [];
      }
    },
  });

  const nameOf = useMemo(() => {
    const m = new Map((users.data ?? []).map((u) => [u.id, u.full_name || u.email || "Unknown"]));
    return (id: string) => m.get(id) ?? "Unknown";
  }, [users.data]);

  const setRole = useMutation({
    mutationFn: async ({ userId, next }: { userId: string; next: AppRole }) => {
      await updateUserRole(userId, next);
    },
    onSuccess: () => {
      toast.success("Role updated");
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteUserFn = useServerFn(deletePlatformUser);
  const removeUser = useMutation({
    mutationFn: async (userId: string) => deleteUserFn({ data: { userId } }),
    onSuccess: () => {
      toast.success("User deleted");
      setPendingDelete(null);
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteClass = useMutation({
    mutationFn: async (id: string) => {
      await removeClassDoc(id);
    },
    onSuccess: () => {
      toast.success("Class deleted");
      void qc.invalidateQueries({ queryKey: ["admin-classes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (loading || (!role && !isAdmin)) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (!isAdmin)
    return (
      <div className="panel p-8 text-center">
        <Shield className="mx-auto size-6 text-muted-foreground" />
        <p className="mt-3 font-medium">Admins only</p>
        <p className="mt-1 text-sm text-muted-foreground">
          You don't have permission to view the admin console.
        </p>
      </div>
    );

  const all = users.data ?? [];
  const counts = {
    students: all.filter((u) => u.role === "student").length,
    teachers: all.filter((u) => u.role === "teacher").length,
    admins: all.filter((u) => u.role === "admin").length,
    classes: (classes.data ?? []).length,
    assignments: (assignments.data ?? []).length,
    submissions: (submissions.data ?? []).length,
  };

  const filteredUsers = all.filter((u) => {
    const q = query.trim().toLowerCase();
    const matches =
      !q || u.full_name.toLowerCase().includes(q) || (u.email ?? "").toLowerCase().includes(q);
    return matches && (roleFilter === "all" || u.role === roleFilter);
  });

  const aList = assignments.data ?? [];
  const activity = [
    ...all.slice(0, 10).map((u) => ({
      at: u.created_at,
      text: `${u.full_name || u.email || "Someone"} registered as ${u.role ?? "user"}`,
    })),
    ...(classes.data ?? []).slice(0, 10).map((c: any) => ({
      at: c.createdAt || new Date().toISOString(),
      text: `Class "${c.name}" created`,
    })),
    ...aList.slice(0, 10).map((a: any) => ({
      at: a.createdAt || new Date().toISOString(),
      text: `Assignment "${a.title}" created`,
    })),
  ]
    .sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime())
    .slice(0, 12);

  const busy = users.isLoading || classes.isLoading || assignments.isLoading;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl sm:text-3xl font-semibold">Admin console</h1>
        <p className="mt-1 text-muted-foreground">
          Platform-wide people, classes and announcements.
        </p>
      </header>

      {busy ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Stat icon={Users} label="Students" value={counts.students} />
          <Stat icon={GraduationCap} label="Teachers" value={counts.teachers} />
          <Stat icon={ShieldCheck} label="Admins" value={counts.admins} tone="text-info" />
          <Stat icon={GraduationCap} label="Classes" value={counts.classes} />
          <Stat icon={BookOpen} label="Assignments" value={counts.assignments} />
          <Stat
            icon={FileClock}
            label="Submissions"
            value={counts.submissions}
            tone="text-warning"
          />
        </div>
      )}

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="users">Users ({all.length})</TabsTrigger>
          <TabsTrigger value="classes">Classes ({counts.classes})</TabsTrigger>
          <TabsTrigger value="assignments">Assignments ({counts.assignments})</TabsTrigger>
          <TabsTrigger value="announcements">Announcements</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-5 space-y-3">
          <h2 className="text-lg font-semibold">Recent activity</h2>
          {activity.length === 0 ? (
            <p className="panel p-6 text-sm text-muted-foreground">No recent activity yet.</p>
          ) : (
            <ul className="panel divide-y divide-border">
              {activity.map((e, i) => (
                <li key={`${e.at}-${i}`} className="flex items-center justify-between gap-4 p-4">
                  <span className="min-w-0 truncate text-sm">{e.text}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(e.at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="users" className="mt-5 space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative min-w-56 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or email"
                className="pl-9"
                aria-label="Search users"
              />
            </div>
            <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as typeof roleFilter)}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                <SelectItem value="student">Students</SelectItem>
                <SelectItem value="teacher">Teachers</SelectItem>
                <SelectItem value="admin">Admins</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {users.isLoading ? (
            <Skeleton className="h-56 w-full rounded-xl" />
          ) : filteredUsers.length === 0 ? (
            <p className="panel p-6 text-sm text-muted-foreground">
              {all.length === 0 ? "No users yet." : "No users match your search."}
            </p>
          ) : (
            <div className="panel overflow-x-auto">
              <table className="w-full min-w-[46rem] text-sm">
                <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="p-3 font-medium">Name</th>
                    <th className="p-3 font-medium">Email</th>
                    <th className="p-3 font-medium">Role</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium">Registered</th>
                    <th className="p-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-muted/40">
                      <td className="p-3 font-medium">{u.full_name || "—"}</td>
                      <td className="p-3 text-muted-foreground">{u.email ?? "—"}</td>
                      <td className="p-3 capitalize">{u.role ?? "—"}</td>
                      <td className="p-3">
                        <span className="rounded-full border border-success/40 bg-success/15 px-2 py-0.5 text-xs text-success">
                          Active
                        </span>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td className="p-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" disabled={u.id === user?.id}>
                              Manage
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            {u.role !== "admin" && (
                              <DropdownMenuItem
                                onSelect={() => setRole.mutate({ userId: u.id, next: "admin" })}
                              >
                                <ShieldCheck className="mr-2 size-4" /> Promote to admin
                              </DropdownMenuItem>
                            )}
                            {u.role !== "teacher" && (
                              <DropdownMenuItem
                                onSelect={() => setRole.mutate({ userId: u.id, next: "teacher" })}
                              >
                                <GraduationCap className="mr-2 size-4" /> Set as teacher
                              </DropdownMenuItem>
                            )}
                            {u.role !== "student" && (
                              <DropdownMenuItem
                                onSelect={() => setRole.mutate({ userId: u.id, next: "student" })}
                              >
                                <ShieldOff className="mr-2 size-4" /> Demote to student
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onSelect={() => setPendingDelete(u)}
                            >
                              <Trash2 className="mr-2 size-4" /> Delete user
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="classes" className="mt-5">
          {classes.isLoading ? (
            <Skeleton className="h-56 w-full rounded-xl" />
          ) : (classes.data ?? []).length === 0 ? (
            <p className="panel p-6 text-sm text-muted-foreground">No classes yet.</p>
          ) : (
            <div className="panel overflow-x-auto">
              <table className="w-full min-w-[46rem] text-sm">
                <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="p-3 font-medium">Class</th>
                    <th className="p-3 font-medium">Teacher</th>
                    <th className="p-3 font-medium">Students</th>
                    <th className="p-3 font-medium">Join Code</th>
                    <th className="p-3 font-medium">Created</th>
                    <th className="p-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(classes.data ?? []).map((c: any) => (
                    <tr key={c.id} className="hover:bg-muted/40">
                      <td className="p-3 font-medium">{c.name}</td>
                      <td className="p-3 text-muted-foreground">{nameOf(c.teacherId)}</td>
                      <td className="p-3 tabular-nums">{c.studentIds?.length || 0}</td>
                      <td className="p-3 font-mono">{c.joinCode || "—"}</td>
                      <td className="p-3 text-muted-foreground">
                        {new Date(c.createdAt || Date.now()).toLocaleDateString()}
                      </td>
                      <td className="p-3">
                        <div className="flex justify-end gap-2">
                          <Button asChild variant="outline" size="sm">
                            <Link to="/classes/$classId" params={{ classId: c.id }}>
                              View
                            </Link>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Delete ${c.name}`}
                            onClick={() => {
                              deleteClass.mutate(c.id);
                            }}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="assignments" className="mt-5 space-y-4">
          {aList.length === 0 ? (
            <p className="panel p-6 text-sm text-muted-foreground">No assignments yet.</p>
          ) : (
            <ul className="panel divide-y divide-border">
              {aList.slice(0, 15).map((a: any) => (
                <li key={a.id} className="flex flex-wrap items-center gap-3 p-4">
                  <Link
                    to="/assignments/$assignmentId"
                    params={{ assignmentId: a.id }}
                    className="min-w-0 flex-1"
                  >
                    <p className="truncate font-medium">{a.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      Max {a.maxPoints} pts · {formatDue(a.dueDate)}
                    </p>
                  </Link>
                  <DueDateChip due={a.dueDate} size="sm" />
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="announcements" className="mt-5">
          <Announcements
            canPost
            emptyText="No platform announcements yet. Publish one to reach everyone."
          />
        </TabsContent>
      </Tabs>

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(v) => !v && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingDelete?.full_name || "this user"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes their account from ONYX. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeUser.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (pendingDelete) removeUser.mutate(pendingDelete.id);
              }}
              disabled={removeUser.isPending}
            >
              Delete user
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
