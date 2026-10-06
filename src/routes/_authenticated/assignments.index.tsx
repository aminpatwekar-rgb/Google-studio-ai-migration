import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth";
import { useViewRole } from "@/lib/viewRole";
import {
  bucketOf,
  daysLate,
  formatDue,
  isArchived,
  isPublished,
  type SubmissionStatus,
} from "@/lib/assignments";
import { StatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getTeacherClasses,
  getAllClasses,
  getStudentClasses,
  getAssignmentsByClass,
  getStudentSubmissions,
  getTeacherGradingQueue,
} from "@/lib/firebase/firestore";
import type { Assignment, Submission } from "@/lib/firebase/models";

// The tab lives in the URL so dashboard cards can deep-link into a filter.
type AssignmentTab = "all" | "upcoming" | "overdue" | "done" | "review";

const VALID: AssignmentTab[] = ["all", "upcoming", "overdue", "done", "review"];

export const Route = createFileRoute("/_authenticated/assignments/")({
  validateSearch: (search: Record<string, unknown>): { tab?: AssignmentTab } => {
    const tab = search["tab"];
    if (typeof tab === "string" && VALID.includes(tab as AssignmentTab)) {
      return { tab: tab as AssignmentTab };
    }
    return {};
  },
  head: () => ({
    meta: [
      { title: "Assignments — ONYX" },
      {
        name: "description",
        content: "Every assignment across your classes, grouped by upcoming, overdue and done.",
      },
      { property: "og:title", content: "Assignments — ONYX" },
      { property: "og:description", content: "All your assignments in one list." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Assignments,
});

function Assignments() {
  const { user } = useAuth();
  const { effectiveRole } = useViewRole();
  const navigate = useNavigate({ from: "/assignments/" });
  const search = Route.useSearch();
  const isTeacher = effectiveRole === "teacher" || effectiveRole === "admin";
  const tab = search.tab ?? "upcoming";

  const q = useQuery({
    queryKey: ["all-assignments", user?.id, effectiveRole],
    enabled: Boolean(user && effectiveRole),
    queryFn: async () => {
      const classes =
        effectiveRole === "admin"
          ? await getAllClasses()
          : isTeacher
            ? await getTeacherClasses(user!.id)
            : await getStudentClasses(user!.id);

      const perClass = await Promise.all(
        classes.map(async (c) =>
          (await getAssignmentsByClass(c.id)).map((a) => ({ ...a, className: c.name })),
        ),
      );
      let list: (Assignment & { className?: string })[] = perClass.flat();
      // Students never see drafts or archived work.
      if (!isTeacher) list = list.filter((a) => isPublished(a) && !isArchived(a));
      list.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

      let byAssignment = new Map<string, Submission>();
      if (!isTeacher) {
        const subs = await getStudentSubmissions(user!.id);
        byAssignment = new Map(subs.map((s) => [s.refId, s]));
      }
      return { list, byAssignment };
    },
  });

  // Submissions waiting for the teacher — the same rows the dashboard counts.
  const review = useQuery({
    enabled: isTeacher && Boolean(user) && q.isSuccess,
    queryKey: ["teacher-review-queue", user?.id, q.dataUpdatedAt],
    queryFn: async () => {
      const classes =
        effectiveRole === "admin" ? await getAllClasses() : await getTeacherClasses(user!.id);
      const subs = await getTeacherGradingQueue(classes.map((c) => c.id));
      const classNames = new Map(classes.map((c) => [c.id, c.name]));
      const titles = new Map((q.data?.list ?? []).map((a) => [a.id, a.title]));
      return subs
        .filter((s) => s.type === "assignment" && s.status === "submitted")
        .sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime())
        .map((s) => ({
          ...s,
          assignmentTitle: titles.get(s.refId) ?? "Assignment",
          className: classNames.get(s.classId) ?? "",
        }));
    },
  });

  const list = q.data?.list ?? [];
  const statusOf = (id: string): SubmissionStatus => {
    const s = q.data?.byAssignment.get(id);
    if (!s) return "not_started";
    return s.status === "graded" ? "completed" : "submitted";
  };

  const live = list.filter((a) => !isArchived(a));
  const groups = {
    all: live,
    upcoming: live.filter((a) => bucketOf(a.dueDate, statusOf(a.id)) === "upcoming"),
    overdue: live.filter((a) => bucketOf(a.dueDate, statusOf(a.id)) === "overdue"),
    done: isTeacher
      ? list.filter((a) => isArchived(a))
      : live.filter((a) => bucketOf(a.dueDate, statusOf(a.id)) === "done"),
  };

  const current: AssignmentTab = VALID.includes(tab) && (isTeacher || tab !== "all" && tab !== "review")
    ? tab
    : "upcoming";

  function Grid({ items }: { items: typeof list }) {
    if (!items.length)
      return <p className="panel p-6 text-sm text-muted-foreground">Nothing here.</p>;
    return (
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((a, i) => (
          <motion.li
            key={a.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03, duration: 0.28 }}
          >
            <Link
              to="/assignments/$assignmentId"
              params={{ assignmentId: a.id }}
              className="panel lift block h-full p-4 hover:lift-hover"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="truncate font-medium">{a.title}</p>
                {!isTeacher && <StatusBadge status={statusOf(a.id)} />}
                {isTeacher && !isPublished(a) && (
                  <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                    Draft
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {a.className} · {a.subject || "General"}
              </p>
              <p className="mt-3 text-sm text-muted-foreground">Due {formatDue(a.dueDate)}</p>
              {daysLate(a.dueDate) > 0 && !isTeacher && statusOf(a.id) === "not_started" && (
                <p className="mt-1 text-sm font-medium text-destructive">Overdue</p>
              )}
            </Link>
          </motion.li>
        ))}
      </ul>
    );
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl sm:text-3xl font-semibold">Assignments</h1>
        <p className="mt-1 text-muted-foreground">
          {isTeacher ? "Everything you've posted." : "Everything assigned to you."}
        </p>
      </header>

      {q.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : q.isError ? (
        <div className="panel p-6 text-sm text-destructive">
          Couldn't load assignments. {(q.error as Error).message}
        </div>
      ) : (
        <Tabs
          value={current}
          onValueChange={(v) =>
            void navigate({ to: ".", search: { tab: v as AssignmentTab }, replace: true })
          }
        >
          <TabsList>
            {isTeacher && <TabsTrigger value="all">All ({groups.all.length})</TabsTrigger>}
            <TabsTrigger value="upcoming">Upcoming ({groups.upcoming.length})</TabsTrigger>
            <TabsTrigger value="overdue">Overdue ({groups.overdue.length})</TabsTrigger>
            {isTeacher && (
              <TabsTrigger value="review">To review ({review.data?.length ?? 0})</TabsTrigger>
            )}
            <TabsTrigger value="done">
              {isTeacher ? "Archive" : "Submitted"} ({groups.done.length})
            </TabsTrigger>
          </TabsList>
          {isTeacher && (
            <TabsContent value="all" className="mt-5">
              <Grid items={groups.all} />
            </TabsContent>
          )}
          <TabsContent value="upcoming" className="mt-5">
            <Grid items={groups.upcoming} />
          </TabsContent>
          <TabsContent value="overdue" className="mt-5">
            <Grid items={groups.overdue} />
          </TabsContent>
          {isTeacher && (
            <TabsContent value="review" className="mt-5">
              {review.isLoading ? (
                <Skeleton className="h-24 w-full rounded-xl" />
              ) : (review.data ?? []).length === 0 ? (
                <p className="panel p-6 text-sm text-muted-foreground">
                  Nothing waiting for review.
                </p>
              ) : (
                <ul className="panel divide-y divide-border">
                  {(review.data ?? []).map((s) => (
                    <li key={s.id}>
                      <Link
                        to="/submissions/$submissionId"
                        params={{ submissionId: s.id }}
                        className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-muted/40"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {s.assignmentTitle}
                            {s.studentName ? ` — ${s.studentName}` : ""}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {s.className} · {new Date(s.submittedAt).toLocaleString()}
                          </p>
                        </div>
                        <StatusBadge status="submitted" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
          )}
          <TabsContent value="done" className="mt-5">
            <Grid items={groups.done} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
