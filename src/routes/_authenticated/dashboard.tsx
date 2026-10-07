import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Clock,
  GraduationCap,
  Users,
  FileClock,
  ArrowRight,
  Sparkles,
  Inbox,
  Calendar,
  Layers,
  ClipboardList,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useViewRole } from "@/lib/viewRole";
import { StatusBadge } from "@/components/StatusBadge";
import { CountdownTimer } from "@/components/CountdownTimer";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { formatDue, type SubmissionStatus } from "@/lib/assignments";
import {
  getTeacherClasses,
  getAllClasses,
  getStudentClasses,
  getAssignmentsByClass,
  getTeacherGradingQueue,
  getStudentSubmissions,
} from "@/lib/firebase/firestore";
import type { Assignment, ClassRoom, Submission } from "@/lib/firebase/models";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — ONYX Workspace" },
      {
        name: "description",
        content: "Your assignments, deadlines, submissions and completion progress at a glance.",
      },
      { property: "og:title", content: "Dashboard — ONYX Workspace" },
      { property: "og:description", content: "Track upcoming, overdue and completed work." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Dashboard,
});

function Stat({
  icon: Icon,
  label,
  value,
  tone = "text-primary bg-primary/10 border-primary/20",
  to,
  search,
}: {
  icon: typeof GraduationCap;
  label: string;
  value: number | string;
  tone?: string;
  to?: string;
  search?: Record<string, string>;
}) {
  const content = (
    <div className="flex items-center justify-between">
      <div className="space-y-0.5">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
          {label}
        </span>
        <p className="text-xl font-bold tracking-tight text-foreground tabular-nums">{value}</p>
      </div>
      <div className={`rounded-lg border p-2 shrink-0 ${tone}`}>
        <Icon className="size-4" />
      </div>
    </div>
  );

  if (!to) {
    return (
      <div className="panel relative overflow-hidden bg-card p-3.5 rounded-xl shadow-2xs">
        {content}
      </div>
    );
  }

  return (
    <Link
      to={to as never}
      search={search as never}
      className="panel relative block overflow-hidden bg-card p-3.5 rounded-xl shadow-2xs transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary group"
      aria-label={`${label}: ${value}`}
    >
      {content}
    </Link>
  );
}

function Dashboard() {
  const { profile, user } = useAuth();
  const { effectiveRole } = useViewRole();

  const isTeacherView = effectiveRole === "teacher" || effectiveRole === "admin";

  const teacher = useQuery({
    enabled: isTeacherView && Boolean(user?.id),
    queryKey: ["teacher-dash", user?.id, effectiveRole],
    queryFn: async () => {
      let classes: ClassRoom[] = [];
      try {
        classes =
          effectiveRole === "admin" ? await getAllClasses() : await getTeacherClasses(user!.id);
      } catch (e) {
        console.warn("Failed fetching teacher classes:", e);
        classes = [];
      }

      const classIds = classes.map((c) => c.id);
      let totalStudents = 0;
      classes.forEach((c) => {
        totalStudents += (c.studentIds || []).length;
      });

      let allAssignments: Assignment[] = [];
      for (const cid of classIds) {
        try {
          const assignList = await getAssignmentsByClass(cid);
          allAssignments = allAssignments.concat(assignList);
        } catch {
          // Ignore individual class assignment query errors
        }
      }

      let pendingSubs: Submission[] = [];
      try {
        pendingSubs = await getTeacherGradingQueue(classIds);
      } catch {
        pendingSubs = [];
      }
      const pendingCount = pendingSubs.filter((s) => s.status === "submitted").length;

      return {
        classes: classes.length,
        students: totalStudents,
        assignments: allAssignments,
        pending: pendingCount,
      };
    },
  });

  const student = useQuery({
    enabled: effectiveRole === "student" && Boolean(user?.id),
    queryKey: ["student-dash", user?.id],
    queryFn: async () => {
      let classes: ClassRoom[] = [];
      try {
        classes = await getStudentClasses(user!.id);
      } catch (e) {
        console.warn("Failed fetching student classes:", e);
        classes = [];
      }
      const classIds = classes.map((c) => c.id);

      let allAssignments: Assignment[] = [];
      for (const cid of classIds) {
        try {
          const aList = await getAssignmentsByClass(cid);
          allAssignments = allAssignments.concat(aList);
        } catch {
          // Ignore individual class assignment query errors
        }
      }

      let subs: Submission[] = [];
      try {
        subs = await getStudentSubmissions(user!.id);
      } catch {
        subs = [];
      }
      const byAssignment = new Map(subs.map((s) => [s.refId, s]));

      return {
        classes: classes.length,
        assignments: allAssignments,
        byAssignment,
      };
    },
  });

  if (isTeacherView && teacher.isError) {
    return (
      <div className="panel p-6 text-sm text-destructive">
        Couldn't load your dashboard. {(teacher.error as Error).message}
      </div>
    );
  }

  if (!isTeacherView && student.isError) {
    return (
      <div className="panel p-6 text-sm text-destructive">
        Couldn't load your dashboard. {(student.error as Error).message}
      </div>
    );
  }

  const firstName = profile?.name?.trim().split(" ")[0] || "there";

  if (isTeacherView) {
    const d = teacher.data;
    return (
      <div className="space-y-4">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border/60 pb-3">
          <div className="space-y-0.5">
            <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-primary uppercase tracking-wider">
              <Sparkles className="size-3" />
              Teacher Workspace
            </div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Welcome back, {firstName}
            </h1>
            <p className="text-xs text-muted-foreground">
              Active classes, assignments, and student grading queue overview.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm" className="h-7 text-xs px-2.5">
              <Link to="/classes">Manage Classes</Link>
            </Button>
            <Button asChild size="sm" className="h-7 text-xs gap-1.5 px-2.5">
              <Link to="/assignments">
                View Assignments <ArrowRight className="size-3" />
              </Link>
            </Button>
          </div>
        </header>

        {teacher.isLoading ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              icon={GraduationCap}
              label="Active Classes"
              value={d?.classes ?? 0}
              tone="text-primary bg-primary/10 border-primary/20"
              to="/classes"
            />
            <Stat
              icon={Users}
              label="Enrolled Students"
              value={d?.students ?? 0}
              tone="text-info bg-info/10 border-info/20"
              to="/classes"
            />
            <Stat
              icon={BookOpen}
              label="Assignments"
              value={d?.assignments.length ?? 0}
              tone="text-success bg-success/10 border-success/20"
              to="/assignments"
              search={{ tab: "all" }}
            />
            <Stat
              icon={FileClock}
              label="To Review"
              value={d?.pending ?? 0}
              tone="text-warning bg-warning/10 border-warning/20"
              to="/assignments"
              search={{ tab: "to-review" }}
            />
          </div>
        )}

        <section className="space-y-2.5 pt-1">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold tracking-tight text-foreground flex items-center gap-1.5 uppercase tracking-wider text-muted-foreground">
              <Layers className="size-3.5 text-primary" /> Recent Assignments
            </h2>
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground hover:text-foreground h-6 px-1.5"
            >
              <Link to="/assignments">
                All assignments <ArrowRight className="ml-1 size-3" />
              </Link>
            </Button>
          </div>

          {(d?.assignments ?? []).length === 0 ? (
            <div className="panel p-6 text-center border-dashed border-border/80 rounded-xl bg-card">
              <div className="mx-auto flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Inbox className="size-4" />
              </div>
              <h3 className="mt-2 text-xs font-semibold text-foreground">No assignments yet</h3>
              <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
                Create a class and post your first assignment to start collecting and grading
                student work.
              </p>
              <div className="mt-3">
                <Button asChild size="sm" className="h-7 text-xs">
                  <Link to="/classes">Get Started with Classes</Link>
                </Button>
              </div>
            </div>
          ) : (
            <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              <AnimatePresence mode="popLayout">
                {(d?.assignments ?? []).slice(0, 6).map((a, i) => (
                  <motion.li
                    key={a.id}
                    className={i >= 4 ? "hidden sm:block" : undefined}
                    layout
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{
                      delay: Math.min(i * 0.02, 0.15),
                      duration: 0.15,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                  >
                    <Link
                      to="/assignments/$assignmentId"
                      params={{ assignmentId: a.id }}
                      className="panel p-3 block transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xs hover:border-primary/40 bg-card group rounded-xl shadow-2xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-xs text-foreground line-clamp-1 group-hover:text-primary transition-colors">
                          {a.title}
                        </p>
                      </div>
                      <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px]">
                        <div className="flex items-center gap-1 text-muted-foreground truncate">
                          <Calendar className="size-3 text-muted-foreground/70 shrink-0" />
                          <span className="truncate">{formatDue(a.dueDate)}</span>
                        </div>
                        <CountdownTimer dueDate={a.dueDate} size="sm" />
                      </div>
                    </Link>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </section>
      </div>
    );
  }

  const list = student.data?.assignments ?? [];
  const done = list.filter((a) => {
    const s = student.data?.byAssignment.get(a.id);
    return s && ["submitted", "graded"].includes(s.status);
  }).length;
  const overdue = list.filter((a) => {
    const s = student.data?.byAssignment.get(a.id);
    return a.dueDate && new Date(a.dueDate) < new Date() && (!s || s.status !== "graded");
  }).length;
  const pct = list.length ? Math.round((done / list.length) * 100) : 0;

  return (
    <div className="space-y-4">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border/60 pb-3">
        <div className="space-y-0.5">
          <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-primary uppercase tracking-wider">
            <Sparkles className="size-3" />
            Student Dashboard
          </div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Welcome back, {firstName}
          </h1>
          <p className="text-xs text-muted-foreground">
            Track tasks, upcoming deadlines, and study progress.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="h-7 text-xs px-2.5">
            <Link to="/classes">Join Class</Link>
          </Button>
          <Button asChild size="sm" className="h-7 text-xs gap-1.5 px-2.5">
            <Link to="/assignments">
              Assignments <ArrowRight className="size-3" />
            </Link>
          </Button>
        </div>
      </header>

      {student.isLoading ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-16 rounded-xl" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              icon={Clock}
              label="Upcoming"
              value={list.length - done}
              tone="text-warning bg-warning/10 border-warning/20"
              to="/assignments"
              search={{ tab: "upcoming" }}
            />
            <Stat
              icon={AlertTriangle}
              label="Overdue"
              value={overdue}
              tone="text-destructive bg-destructive/10 border-destructive/20"
              to="/assignments"
              search={{ tab: "overdue" }}
            />
            <Stat
              icon={CheckCircle2}
              label="Submitted"
              value={done}
              tone="text-success bg-success/10 border-success/20"
              to="/assignments"
              search={{ tab: "submitted" }}
            />
            <Stat
              icon={GraduationCap}
              label="Classes"
              value={student.data?.classes ?? 0}
              tone="text-info bg-info/10 border-info/20"
              to="/classes"
            />
          </div>

          <div className="panel bg-card p-3.5 rounded-xl shadow-2xs">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-foreground">Overall Completion</span>
                <span className="text-muted-foreground text-[11px]">
                  ({done} of {list.length} completed)
                </span>
              </div>
              <span className="font-bold text-primary tabular-nums text-xs">{pct}%</span>
            </div>
            <Progress value={pct} className="mt-2 h-1.5 bg-secondary" />
          </div>

          {/* Priority Deadline Banner */}
          {(() => {
            const nextTask = list.find((a) => {
              const s = student.data?.byAssignment.get(a.id);
              return a.dueDate && (!s || !["submitted", "graded"].includes(s.status));
            });
            if (!nextTask) return null;
            const sub = student.data?.byAssignment.get(nextTask.id);
            return (
              <div className="panel p-3.5 rounded-xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-primary uppercase tracking-wider">
                    <Clock className="size-3.5 shrink-0" /> Priority Deadline
                  </div>
                  <Link
                    to="/assignments/$assignmentId"
                    params={{ assignmentId: nextTask.id }}
                    className="font-bold text-sm text-foreground hover:text-primary transition-colors line-clamp-1 block"
                  >
                    {nextTask.title}
                  </Link>
                  <p className="text-xs text-muted-foreground truncate">
                    Due {formatDue(nextTask.dueDate)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <CountdownTimer
                    dueDate={nextTask.dueDate}
                    submitted={Boolean(sub && ["submitted", "graded"].includes(sub.status))}
                    size="md"
                  />
                  <Button asChild size="sm" className="h-8 text-xs gap-1 font-semibold">
                    <Link to="/assignments/$assignmentId" params={{ assignmentId: nextTask.id }}>
                      Open Task <ArrowRight className="size-3.5" />
                    </Link>
                  </Button>
                </div>
              </div>
            );
          })()}

          <section className="space-y-2.5 pt-1">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold tracking-tight text-foreground flex items-center gap-1.5 uppercase tracking-wider text-muted-foreground">
                <ClipboardList className="size-3.5 text-primary" /> Your Assignments
              </h2>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground hover:text-foreground h-6 px-1.5"
              >
                <Link to="/assignments">
                  All assignments <ArrowRight className="ml-1 size-3" />
                </Link>
              </Button>
            </div>

            {list.length === 0 ? (
              <div className="panel p-6 text-center border-dashed border-border/80 rounded-xl bg-card">
                <div className="mx-auto flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Inbox className="size-4" />
                </div>
                <h3 className="mt-2 text-xs font-semibold text-foreground">No work assigned yet</h3>
                <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
                  Join a class using a code from your teacher to see your assignments here.
                </p>
                <div className="mt-3">
                  <Button asChild size="sm" className="h-7 text-xs">
                    <Link to="/classes">Join a Class</Link>
                  </Button>
                </div>
              </div>
            ) : (
              <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                <AnimatePresence mode="popLayout">
                  {list.slice(0, 6).map((a, i) => {
                    const sub = student.data?.byAssignment.get(a.id);
                    const status: SubmissionStatus = sub
                      ? sub.status === "graded"
                        ? "completed"
                        : "submitted"
                      : "not_started";

                    return (
                      <motion.li
                        key={a.id}
                        className={i >= 4 ? "hidden sm:block" : undefined}
                        layout
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96 }}
                        transition={{
                          delay: Math.min(i * 0.02, 0.15),
                          duration: 0.15,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                      >
                        <Link
                          to="/assignments/$assignmentId"
                          params={{ assignmentId: a.id }}
                          className="panel p-3 block transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xs hover:border-primary/40 bg-card group rounded-xl shadow-2xs"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-semibold text-xs text-foreground line-clamp-1 group-hover:text-primary transition-colors">
                              {a.title}
                            </p>
                            <StatusBadge status={status} />
                          </div>
                          <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px]">
                            <div className="flex items-center gap-1 text-muted-foreground truncate">
                              <Calendar className="size-3 text-muted-foreground/70 shrink-0" />
                              <span className="truncate">{formatDue(a.dueDate)}</span>
                            </div>
                            <CountdownTimer
                              dueDate={a.dueDate}
                              submitted={Boolean(
                                sub && ["submitted", "graded"].includes(sub.status),
                              )}
                              size="sm"
                            />
                          </div>
                        </Link>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
