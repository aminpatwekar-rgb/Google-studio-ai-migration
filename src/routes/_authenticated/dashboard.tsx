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
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useViewRole } from "@/lib/viewRole";
import { StatusBadge } from "@/components/StatusBadge";
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
import type { Assignment } from "@/lib/firebase/models";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Smart Assignment Hub" },
      {
        name: "description",
        content: "Your assignments, deadlines, submissions and completion progress at a glance.",
      },
      { property: "og:title", content: "Dashboard — Smart Assignment Hub" },
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
    <>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground sm:uppercase sm:tracking-wider">
          {label}
        </span>
        <div className={`hidden rounded-lg border p-2 sm:block ${tone}`}>
          <Icon className="size-4" />
        </div>
      </div>
      <p className="mt-1.5 text-2xl font-bold tracking-tight text-foreground tabular-nums sm:mt-4 sm:text-3xl">
        {value}
      </p>
    </>
  );

  if (!to) {
    return <div className="panel relative overflow-hidden bg-card p-3.5 sm:p-5">{content}</div>;
  }

  return (
    <Link
      to={to as never}
      search={search as never}
      className="panel relative block overflow-hidden bg-card p-3.5 sm:p-5 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      aria-label={`${label}: ${value}`}
    >
      {content}
    </Link>
  );
}

function Dashboard() {
  const { profile, role, user } = useAuth();
  const { effectiveRole } = useViewRole();

  const isTeacherView = effectiveRole === "teacher" || effectiveRole === "admin";

  const teacher = useQuery({
    enabled: isTeacherView && Boolean(user?.id),
    queryKey: ["teacher-dash", user?.id, effectiveRole],
    queryFn: async () => {
      const classes =
        effectiveRole === "admin"
          ? await getAllClasses()
          : await getTeacherClasses(user!.id);

      const classIds = classes.map((c) => c.id);
      let totalStudents = 0;
      classes.forEach((c) => {
        totalStudents += (c.studentIds || []).length;
      });

      let allAssignments: Assignment[] = [];
      for (const cid of classIds) {
        const assignList = await getAssignmentsByClass(cid);
        allAssignments = allAssignments.concat(assignList);
      }

      const pendingSubs = await getTeacherGradingQueue(classIds);
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
      const classes = await getStudentClasses(user!.id);
      const classIds = classes.map((c) => c.id);

      let allAssignments: Assignment[] = [];
      for (const cid of classIds) {
        const aList = await getAssignmentsByClass(cid);
        allAssignments = allAssignments.concat(aList);
      }

      const subs = await getStudentSubmissions(user!.id);
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
      <div className="space-y-5 sm:space-y-8">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/60 pb-4 sm:pb-6">
          <div>
            <div className="mb-1 hidden items-center gap-1.5 text-xs font-medium text-primary sm:inline-flex">
              <Sparkles className="size-3.5" />
              Teacher Workspace
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Welcome back, {firstName}
            </h1>
            <p className="mt-1 hidden text-sm text-muted-foreground sm:block">
              Here is an overview of your active classes, assignments, and student submissions.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm" className="h-9">
              <Link to="/classes">Manage Classes</Link>
            </Button>
            <Button asChild size="sm" className="hidden h-9 gap-1.5 sm:inline-flex">
              <Link to="/assignments">
                View Assignments <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </div>
        </header>

        {teacher.isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
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
            />
            <Stat
              icon={FileClock}
              label="Pending Review"
              value={d?.pending ?? 0}
              tone="text-warning bg-warning/10 border-warning/20"
              to="/grading"
            />
          </div>
        )}

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-foreground">
                Recent Assignments
              </h2>
              <p className="hidden text-xs text-muted-foreground sm:block">
                Quick access to student progress and deadlines
              </p>
            </div>
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              <Link to="/assignments">
                All assignments <ArrowRight className="ml-1 size-3" />
              </Link>
            </Button>
          </div>

          {(d?.assignments ?? []).length === 0 ? (
            <div className="panel p-8 text-center border-dashed border-border/80">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Inbox className="size-6" />
              </div>
              <h3 className="mt-3 text-sm font-semibold text-foreground">No assignments yet</h3>
              <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
                Create a class and post your first assignment to start collecting and grading student work.
              </p>
              <div className="mt-4">
                <Button asChild size="sm">
                  <Link to="/classes">Get Started with Classes</Link>
                </Button>
              </div>
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <AnimatePresence mode="popLayout">
                {(d?.assignments ?? []).slice(0, 6).map((a, i) => (
                  <motion.li
                    key={a.id}
                    className={i >= 4 ? "hidden sm:block" : undefined}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{
                      delay: Math.min(i * 0.035, 0.3),
                      duration: 0.22,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                  >
                    <Link
                      to="/assignments/$assignmentId"
                      params={{ assignmentId: a.id }}
                      className="panel p-4 block transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md hover:border-primary/40 bg-card group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-sm text-foreground line-clamp-1 group-hover:text-primary transition-colors">
                          {a.title}
                        </p>
                      </div>
                      <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Calendar className="size-3.5 text-muted-foreground/70" />
                        <span>Due {formatDue(a.dueDate)}</span>
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
    return (
      a.dueDate &&
      new Date(a.dueDate) < new Date() &&
      (!s || s.status !== "graded")
    );
  }).length;
  const pct = list.length ? Math.round((done / list.length) * 100) : 0;

  return (
    <div className="space-y-5 sm:space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/60 pb-4 sm:pb-6">
        <div>
          <div className="mb-1 hidden items-center gap-1.5 text-xs font-medium text-primary sm:inline-flex">
            <Sparkles className="size-3.5" />
            Student Dashboard
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Welcome back, {firstName}
          </h1>
          <p className="mt-1 hidden text-sm text-muted-foreground sm:block">
            Track your tasks, upcoming deadlines, and study progress.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="h-9">
            <Link to="/classes">Join Class</Link>
          </Button>
          <Button asChild size="sm" className="hidden h-9 gap-1.5 sm:inline-flex">
            <Link to="/assignments">
              Assignments <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      </header>

      {student.isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-24 rounded-xl" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <Stat
              icon={Clock}
              label="Pending Work"
              value={list.length - done}
              tone="text-warning bg-warning/10 border-warning/20"
              to="/assignments"
            />
            <Stat
              icon={AlertTriangle}
              label="Overdue"
              value={overdue}
              tone="text-destructive bg-destructive/10 border-destructive/20"
              to="/assignments"
            />
            <Stat
              icon={CheckCircle2}
              label="Completed"
              value={done}
              tone="text-success bg-success/10 border-success/20"
              to="/assignments"
            />
            <Stat
              icon={GraduationCap}
              label="Enrolled Classes"
              value={student.data?.classes ?? 0}
              tone="text-info bg-info/10 border-info/20"
              to="/classes"
            />
          </div>

          <div className="panel bg-card p-4 sm:p-5">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground">Overall Completion</span>
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  ({done} of {list.length} tasks completed)
                </span>
              </div>
              <span className="font-bold text-primary tabular-nums">{pct}%</span>
            </div>
            <Progress value={pct} className="mt-3.5 h-2.5 bg-secondary" />
          </div>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base sm:text-lg font-semibold text-foreground">
                  Your Assignments
                </h2>
                <p className="hidden text-xs text-muted-foreground sm:block">
                  Stay ahead of due dates and submit work
                </p>
              </div>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                <Link to="/assignments">
                  All assignments <ArrowRight className="ml-1 size-3" />
                </Link>
              </Button>
            </div>

            {list.length === 0 ? (
              <div className="panel p-8 text-center border-dashed border-border/80">
                <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Inbox className="size-6" />
                </div>
                <h3 className="mt-3 text-sm font-semibold text-foreground">No work assigned yet</h3>
                <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
                  Join a class using a code from your teacher to see your assignments here.
                </p>
                <div className="mt-4">
                  <Button asChild size="sm">
                    <Link to="/classes">Join a Class</Link>
                  </Button>
                </div>
              </div>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <AnimatePresence mode="popLayout">
                  {list.slice(0, 6).map((a, i) => {
                    const sub = student.data?.byAssignment.get(a.id);
                    const status: SubmissionStatus = sub ? (sub.status === "graded" ? "completed" : "submitted") : "not_started";

                    return (
                      <motion.li
                        key={a.id}
                        className={i >= 4 ? "hidden sm:block" : undefined}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96 }}
                        transition={{
                          delay: Math.min(i * 0.035, 0.3),
                          duration: 0.22,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                      >
                        <Link
                          to="/assignments/$assignmentId"
                          params={{ assignmentId: a.id }}
                          className="panel p-4 block transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md hover:border-primary/40 bg-card group"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-semibold text-sm text-foreground line-clamp-1 group-hover:text-primary transition-colors">
                              {a.title}
                            </p>
                            <StatusBadge status={status} />
                          </div>
                          <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Calendar className="size-3.5 text-muted-foreground/70" />
                            <span>Due {formatDue(a.dueDate)}</span>
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
