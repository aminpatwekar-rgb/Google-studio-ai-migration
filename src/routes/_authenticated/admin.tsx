import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Database,
  DollarSign,
  FileClock,
  GraduationCap,
  HardDrive,
  Mail,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  ShieldOff,
  Sliders,
  Trash2,
  Users,
} from "lucide-react";
import {
  getFirestoreBillingMetrics,
  updateFirestoreBillingConfig,
  runFirestoreBillingCheckNow,
  sendTestBillingAlertEmail,
  type BillingAlertRecord,
} from "@/lib/billing-monitor.functions";
import {
  getAllUsers,
  getAllClasses,
  getAllAssignments,
  updateUserRole,
  deleteUserProfile,
  updateClass,
  deleteClass as removeClassDoc,
  getAuditLogs,
} from "@/lib/firebase/firestore";
import { collection, getDocs, query as fsQuery, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth, type AppRole } from "@/lib/auth";
import { deletePlatformUser, setPlatformUserRole } from "@/lib/admin.functions";
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
  const { role, user, loading, superAdminUid, isSuperAdmin } = useAuth();
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
        full_name: u.name || "User",
        email: u.email || null,
        is_active: true,
        created_at: u.createdAt || new Date().toISOString(),
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

  const auditLogs = useQuery({
    enabled: isAdmin,
    queryKey: ["admin-audit-logs"],
    queryFn: async () => {
      try {
        return await getAuditLogs(100);
      } catch {
        return [];
      }
    },
  });

  const nameOf = useMemo(() => {
    const m = new Map((users.data ?? []).map((u) => [u.id, u.full_name || u.email || "Unknown"]));
    return (id: string) => m.get(id) ?? "Unknown";
  }, [users.data]);

  const setRoleFn = useServerFn(setPlatformUserRole);
  const setRole = useMutation({
    mutationFn: async ({ userId, next }: { userId: string; next: AppRole }) => {
      // Direct Firestore update using Client Auth session (enforced by firestore.rules for admins)
      await updateUserRole(userId, next);
      try {
        await setRoleFn({ data: { userId, role: next } });
      } catch {
        // Fallback catch if server function is unauthenticated in dev
      }
    },
    onSuccess: () => {
      toast.success("Role updated successfully");
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: Error) => toast.error(`Failed to update role: ${e.message}`),
  });

  const deleteUserFn = useServerFn(deletePlatformUser);
  const removeUser = useMutation({
    mutationFn: async (userId: string) => {
      await deleteUserProfile(userId);
      try {
        await deleteUserFn({ data: { userId } });
      } catch {
        // Fallback catch
      }
    },
    onSuccess: () => {
      toast.success("User deleted successfully");
      setPendingDelete(null);
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: Error) => toast.error(`Failed to delete user: ${e.message}`),
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

  // Super Admin Firestore Billing & Usage Monitor Hooks
  const getBillingFn = useServerFn(getFirestoreBillingMetrics);
  const updateBillingFn = useServerFn(updateFirestoreBillingConfig);
  const runBillingCheckFn = useServerFn(runFirestoreBillingCheckNow);
  const sendTestEmailFn = useServerFn(sendTestBillingAlertEmail);

  const billingData = useQuery({
    enabled: isSuperAdmin,
    queryKey: ["admin-billing-metrics"],
    queryFn: async () => {
      return await getBillingFn();
    },
  });

  const [budgetInput, setBudgetInput] = useState<string>("10.00");
  const [thresholdInput, setThresholdInput] = useState<string>("80");
  const [emailInput, setEmailInput] = useState<string>("aminpatwekar@gmail.com");
  const [autoAlertInput, setAutoAlertInput] = useState<boolean>(true);
  const [hasInitializedInputs, setHasInitializedInputs] = useState<boolean>(false);

  useEffect(() => {
    if (billingData.data?.config && !hasInitializedInputs) {
      setBudgetInput(String(billingData.data.config.monthlyBudgetUSD));
      setThresholdInput(String(billingData.data.config.alertThresholdPercent));
      setEmailInput(billingData.data.config.alertEmail || "aminpatwekar@gmail.com");
      setAutoAlertInput(billingData.data.config.autoAlertEnabled ?? true);
      setHasInitializedInputs(true);
    }
  }, [billingData.data, hasInitializedInputs]);

  const updateBillingMutation = useMutation({
    mutationFn: async () => {
      const budget = parseFloat(budgetInput);
      const threshold = parseInt(thresholdInput, 10);
      return await updateBillingFn({
        data: {
          monthlyBudgetUSD: budget,
          alertThresholdPercent: threshold,
          alertEmail: emailInput.trim(),
          autoAlertEnabled: autoAlertInput,
        },
      });
    },
    onSuccess: () => {
      toast.success("Billing budget & alert thresholds saved successfully");
      void qc.invalidateQueries({ queryKey: ["admin-billing-metrics"] });
    },
    onError: (err: Error) => {
      toast.error(`Failed to update billing config: ${err.message}`);
    },
  });

  const runBillingCheckMutation = useMutation({
    mutationFn: async () => {
      return await runBillingCheckFn();
    },
    onSuccess: (data) => {
      if (data.alertSent) {
        toast.warning(`Alert notification dispatched! ${data.reason}`);
      } else if (data.alertTriggered) {
        toast.info(data.reason);
      } else {
        toast.success(
          `Check passed: Normal usage (${data.metrics.usagePercent}% of budget consumed).`,
        );
      }
      void qc.invalidateQueries({ queryKey: ["admin-billing-metrics"] });
    },
    onError: (err: Error) => {
      toast.error(`Billing check failed: ${err.message}`);
    },
  });

  const sendTestEmailMutation = useMutation({
    mutationFn: async () => {
      return await sendTestEmailFn({ data: { email: emailInput } });
    },
    onSuccess: (res) => {
      toast.success(`Test alert email successfully dispatched to ${res.recipient}`);
      void qc.invalidateQueries({ queryKey: ["admin-billing-metrics"] });
    },
    onError: (err: Error) => {
      toast.error(`Failed to send test email: ${err.message}`);
    },
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
    const nameStr = (u.full_name || "").toLowerCase();
    const emailStr = (u.email || "").toLowerCase();
    const matches = !q || nameStr.includes(q) || emailStr.includes(q);
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
          <TabsTrigger value="audit">Audit Logs</TabsTrigger>
          {isSuperAdmin && (
            <TabsTrigger value="superadmin" className="text-primary font-semibold">
              Super Admin
            </TabsTrigger>
          )}
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
                  {filteredUsers.map((u) => {
                    const isUserSuperAdmin =
                      u.id === superAdminUid || u.email === "aminpatwekar@gmail.com";
                    const isTargetAdmin = u.role === "admin";
                    const canManageUser =
                      !isUserSuperAdmin && u.id !== user?.id && (isSuperAdmin || !isTargetAdmin);

                    return (
                      <tr key={u.id} className="hover:bg-muted/40">
                        <td className="p-3 font-medium">{u.full_name || "—"}</td>
                        <td className="p-3 text-muted-foreground">{u.email ?? "—"}</td>
                        <td className="p-3">
                          {isUserSuperAdmin ? (
                            <span className="inline-flex items-center gap-1 rounded bg-indigo-100 dark:bg-indigo-950/40 px-1.5 py-0.5 text-xs font-semibold text-indigo-700 dark:text-indigo-400">
                              Super Admin
                            </span>
                          ) : (
                            <span className="capitalize">{u.role ?? "—"}</span>
                          )}
                        </td>
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
                              <Button variant="outline" size="sm" disabled={!canManageUser}>
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
                    );
                  })}
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

        <TabsContent value="audit" className="mt-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Security & Administrative Audit Logs</h2>
            <span className="text-xs text-muted-foreground">
              Immutable platform activity records
            </span>
          </div>

          {auditLogs.isLoading ? (
            <Skeleton className="h-48 w-full rounded-xl" />
          ) : (auditLogs.data || []).length === 0 ? (
            <div className="panel p-8 text-center text-sm text-muted-foreground">
              No audit logs recorded yet.
            </div>
          ) : (
            <div className="panel overflow-x-auto">
              <table className="w-full min-w-[42rem] text-sm">
                <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="p-3 font-medium">Timestamp</th>
                    <th className="p-3 font-medium">Actor</th>
                    <th className="p-3 font-medium">Action</th>
                    <th className="p-3 font-medium">Target</th>
                    <th className="p-3 font-medium">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(auditLogs.data || []).map((log) => (
                    <tr key={log.id} className="hover:bg-muted/30">
                      <td className="p-3 text-xs text-muted-foreground">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="p-3 font-mono text-xs">{log.actorEmail || log.actorId}</td>
                      <td className="p-3 font-semibold text-xs text-primary">{log.action}</td>
                      <td className="p-3 text-xs capitalize">
                        {log.targetType} {log.targetId ? `(${log.targetId.slice(0, 8)})` : ""}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground font-mono">
                        {log.details ? JSON.stringify(log.details) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {isSuperAdmin && (
          <TabsContent value="superadmin" className="mt-5 space-y-5">
            <div className="panel p-6 space-y-4 border-primary/30 bg-primary/5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
                  <ShieldCheck className="size-6" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-foreground">
                    Super Admin Master Controller
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Unrestricted platform administrative permissions and infrastructure monitoring.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 pt-2">
                <div className="p-4 rounded-lg bg-card border border-border space-y-1">
                  <p className="text-xs text-muted-foreground">Super Admin Identity</p>
                  <p className="font-semibold text-sm">aminpatwekar@gmail.com</p>
                  <p className="text-[11px] font-mono text-muted-foreground">
                    UID: {superAdminUid || user?.id || "Verified"}
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-card border border-border space-y-1">
                  <p className="text-xs text-muted-foreground">Platform Security Status</p>
                  <p className="font-semibold text-sm text-success flex items-center gap-1">
                    <ShieldCheck className="size-4" /> Hardened ABAC & Rules Active
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Zero-trust protection & Super Admin locked
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-border/60 bg-background/50 p-4 space-y-2 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground">Platform Protection Rules:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>No other platform administrator can demote or delete the Super Admin.</li>
                  <li>
                    Super Admin role is derived securely from Firestore <code>system/config</code>{" "}
                    via UID.
                  </li>
                  <li>Only Super Admin can manage system settings, budget thresholds and privileged credentials.</li>
                </ul>
              </div>
            </div>

            {/* Firestore Usage & Billing Budget Monitor */}
            <div className="panel p-6 space-y-6 border-border">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-accent text-accent-foreground">
                    <Database className="size-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold">Firestore Usage & Billing Budget Monitor</h2>
                      {billingData.data?.metrics?.status === "critical" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-semibold text-destructive">
                          <AlertTriangle className="size-3" /> Critical Budget
                        </span>
                      )}
                      {billingData.data?.metrics?.status === "warning" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2.5 py-0.5 text-xs font-semibold text-warning">
                          <AlertTriangle className="size-3" /> Nearing Budget
                        </span>
                      )}
                      {billingData.data?.metrics?.status === "healthy" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-semibold text-success">
                          <CheckCircle2 className="size-3" /> Within Budget
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Cloud Function and automated server notifications triggered when approaching monthly limits.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => sendTestEmailMutation.mutate()}
                    disabled={sendTestEmailMutation.isPending}
                    className="text-xs gap-1.5"
                  >
                    <Mail className="size-3.5" />
                    {sendTestEmailMutation.isPending ? "Sending Test..." : "Send Test Alert Email"}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => runBillingCheckMutation.mutate()}
                    disabled={runBillingCheckMutation.isPending || billingData.isLoading}
                    className="text-xs gap-1.5"
                  >
                    <RefreshCw className={`size-3.5 ${runBillingCheckMutation.isPending ? "animate-spin" : ""}`} />
                    {runBillingCheckMutation.isPending ? "Checking Usage..." : "Run Usage Check Now"}
                  </Button>
                </div>
              </div>

              {/* Progress & Quick Stats */}
              {billingData.isLoading ? (
                <Skeleton className="h-32 w-full rounded-xl" />
              ) : (
                <div className="space-y-4">
                  {/* Visual Progress Bar */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-medium">
                      <span>
                        Budget Consumed:{" "}
                        <strong className="text-foreground">
                          {billingData.data?.metrics?.usagePercent ?? 0}%
                        </strong>{" "}
                        of ${billingData.data?.metrics?.budgetUSD?.toFixed(2) ?? "10.00"}
                      </span>
                      <span className="text-muted-foreground">
                        Warning Threshold: {billingData.data?.config?.alertThresholdPercent ?? 80}%
                      </span>
                    </div>
                    <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 rounded-full ${
                          (billingData.data?.metrics?.usagePercent ?? 0) >= 95
                            ? "bg-destructive"
                            : (billingData.data?.metrics?.usagePercent ?? 0) >=
                                (billingData.data?.config?.alertThresholdPercent ?? 80)
                              ? "bg-warning"
                              : "bg-success"
                        }`}
                        style={{
                          width: `${Math.min(100, Math.max(2, billingData.data?.metrics?.usagePercent ?? 0))}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Metric Cards */}
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-xl border border-border p-4 bg-card space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Est. Monthly Cost</span>
                        <DollarSign className="size-4 text-primary" />
                      </div>
                      <p className="text-2xl font-bold tabular-nums">
                        ${billingData.data?.metrics?.estimatedMonthlyCostUSD?.toFixed(2) ?? "0.00"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Budget Limit: ${billingData.data?.metrics?.budgetUSD?.toFixed(2) ?? "10.00"}
                      </p>
                    </div>

                    <div className="rounded-xl border border-border p-4 bg-card space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Total Documents</span>
                        <Database className="size-4 text-info" />
                      </div>
                      <p className="text-2xl font-bold tabular-nums">
                        {billingData.data?.metrics?.totalDocuments?.toLocaleString() ?? 0}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Across {Object.keys(billingData.data?.metrics?.collectionBreakdown || {}).length} collections
                      </p>
                    </div>

                    <div className="rounded-xl border border-border p-4 bg-card space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Estimated Storage</span>
                        <HardDrive className="size-4 text-warning" />
                      </div>
                      <p className="text-2xl font-bold tabular-nums">
                        {billingData.data?.metrics?.estimatedStorageMB ?? 0} MB
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Free tier: 1,024 MB (1 GiB)
                      </p>
                    </div>

                    <div className="rounded-xl border border-border p-4 bg-card space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Alert Recipient</span>
                        <Mail className="size-4 text-secondary-foreground" />
                      </div>
                      <p className="text-sm font-semibold truncate">
                        {billingData.data?.config?.alertEmail || "aminpatwekar@gmail.com"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Last Alert:{" "}
                        {billingData.data?.config?.lastAlertSentAt
                          ? new Date(billingData.data.config.lastAlertSentAt).toLocaleDateString()
                          : "None"}
                      </p>
                    </div>
                  </div>

                  {/* Collections Breakdown Chips */}
                  {billingData.data?.metrics?.collectionBreakdown && (
                    <div className="rounded-lg border border-border/80 bg-background/50 p-4 space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Monitored Collections Breakdown
                      </p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {Object.entries(billingData.data.metrics.collectionBreakdown).map(
                          ([colName, count]) => (
                            <span
                              key={colName}
                              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs"
                            >
                              <span className="font-mono text-muted-foreground">{colName}:</span>
                              <strong className="font-semibold text-foreground">{count}</strong>
                            </span>
                          ),
                        )}
                      </div>
                    </div>
                  )}

                  {/* Configuration Form */}
                  <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                    <div className="flex items-center gap-2">
                      <Sliders className="size-4 text-primary" />
                      <h3 className="text-sm font-semibold">Budget & Alert Threshold Settings</h3>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">
                          Monthly Budget ($ USD)
                        </label>
                        <Input
                          type="number"
                          step="0.5"
                          min="1"
                          max="5000"
                          value={budgetInput}
                          onChange={(e) => setBudgetInput(e.target.value)}
                          placeholder="10.00"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">
                          Warning Alert Threshold (%)
                        </label>
                        <Select value={thresholdInput} onValueChange={setThresholdInput}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select percentage" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="50">50% of budget</SelectItem>
                            <SelectItem value="70">70% of budget</SelectItem>
                            <SelectItem value="75">75% of budget</SelectItem>
                            <SelectItem value="80">80% of budget (Recommended)</SelectItem>
                            <SelectItem value="85">85% of budget</SelectItem>
                            <SelectItem value="90">90% of budget</SelectItem>
                            <SelectItem value="95">95% of budget</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">
                          Notification Email
                        </label>
                        <Input
                          type="email"
                          value={emailInput}
                          onChange={(e) => setEmailInput(e.target.value)}
                          placeholder="admin@onyx.education"
                        />
                      </div>

                      <div className="flex flex-col justify-end space-y-2">
                        <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                          <input
                            type="checkbox"
                            checked={autoAlertInput}
                            onChange={(e) => setAutoAlertInput(e.target.checked)}
                            className="size-4 rounded border-border"
                          />
                          <span>Enable automated email alerts</span>
                        </label>
                        <Button
                          size="sm"
                          onClick={() => updateBillingMutation.mutate()}
                          disabled={updateBillingMutation.isPending}
                        >
                          {updateBillingMutation.isPending ? "Saving..." : "Save Budget Settings"}
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Cloud Function Architecture Details */}
                  <div className="rounded-lg border border-border/60 bg-muted/30 p-4 space-y-2 text-xs text-muted-foreground">
                    <p className="font-semibold text-foreground flex items-center gap-1.5">
                      <ShieldCheck className="size-4 text-primary" /> Cloud Function Deployment Architecture:
                    </p>
                    <ul className="list-disc pl-4 space-y-1">
                      <li>
                        <strong>Scheduled Function:</strong> <code>monitorFirestoreBillingUsage</code> in <code>functions/src/index.ts</code> runs daily at 08:00 UTC via Google Cloud Scheduler.
                      </li>
                      <li>
                        <strong>HTTP Webhook Endpoint:</strong> <code>monitorFirestoreBillingUsageHttp</code> supports on-demand calls from external schedulers or CI/CD pipelines.
                      </li>
                      <li>
                        <strong>Rate Limiting & Throttling:</strong> Alerts are throttled to a maximum of 1 email per 24 hours to prevent inbox flooding unless usage jumps to critical (&gt;=95%).
                      </li>
                    </ul>
                  </div>

                  {/* Recent Billing Alerts Table */}
                  {billingData.data?.recentAlerts && billingData.data.recentAlerts.length > 0 && (
                    <div className="space-y-2 pt-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Recent Billing Alerts Log
                      </h3>
                      <div className="panel overflow-hidden border border-border">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-muted/50 border-b border-border">
                            <tr>
                              <th className="p-2.5">Date & Time</th>
                              <th className="p-2.5">Recipient</th>
                              <th className="p-2.5">Usage</th>
                              <th className="p-2.5">Est. Cost</th>
                              <th className="p-2.5">Budget</th>
                              <th className="p-2.5">Status</th>
                              <th className="p-2.5">Reason</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {billingData.data.recentAlerts.map((alert: BillingAlertRecord) => (
                              <tr key={alert.id} className="hover:bg-muted/20">
                                <td className="p-2.5 text-muted-foreground whitespace-nowrap">
                                  {new Date(alert.timestamp).toLocaleString()}
                                </td>
                                <td className="p-2.5 font-mono">{alert.recipient}</td>
                                <td className="p-2.5 font-semibold">{alert.usagePercent}%</td>
                                <td className="p-2.5">${alert.estimatedCostUSD?.toFixed(2)}</td>
                                <td className="p-2.5 text-muted-foreground">${alert.budgetUSD?.toFixed(2)}</td>
                                <td className="p-2.5">
                                  <span
                                    className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                                      alert.status === "sent"
                                        ? "bg-success/15 text-success"
                                        : alert.status === "simulated"
                                          ? "bg-info/15 text-info"
                                          : "bg-destructive/15 text-destructive"
                                    }`}
                                  >
                                    {alert.status}
                                  </span>
                                </td>
                                <td className="p-2.5 max-w-xs truncate text-muted-foreground">
                                  {alert.reason}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </TabsContent>
        )}
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
