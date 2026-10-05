import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth";
import { useViewRole } from "@/lib/viewRole";
import { formatDue, type SubmissionStatus } from "@/lib/assignments";
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
import { Calendar, ChevronRight, Inbox } from "lucide-react";

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
  const tab = search.tab ?? "all";
  const isTeacher = effectiveRole === "teacher" || effectiveRole === "admin";

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

      const classMap = new Map(classes.map((c) => [c.id, c.name]));
      let list: (Assignment & { className?: string })[] = [];

      for (const c of classes) {
        const aList = await getAssignmentsByClass(c.id);
        list = list.concat(aList.map((a) => ({ ...a, className: c.name })));
      }

      let byAssignment = new Map<string, Submission>();
      if (!isTeacher) {
        const subs = await getStudentSubmissions(user!.id);
        byAssignment = new Map(subs.map((s) => [s.refId, s]));
      }

      return { list, byAssignment, classMap };
    },
  });

  const reviewQueue = useQuery({
    enabled: isTeacher && Boolean(user),
    queryKey: ["teacher-review-queue", user?.id],
    queryFn: async () => {
      const classes =
        effectiveRole === "admin"
          ? await getAllClasses()
          : await getTeacherClasses(user!.id);
      const classIds = classes.map((c) => c.id);
      const subs = await getTeacherGradingQueue(classIds);
      return subs.filter((s) => s.status === "submitted");
    },
  });

  const list = q.data?.list ?? [];
  const byAssignment = q.data?.byAssignment ?? new Map();

  const filterByTab = (t: AssignmentTab) => {
    if (t === "all") return list;
    if (t === "done") {
      return list.filter((a) => {
        const s = byAssignment.get(a.id);
        return s && ["submitted", "graded"].includes(s.status);
      });
    }
    if (t === "overdue") {
      return list.filter((a) => {
        const s = byAssignment.get(a.id);
        return (
          a.dueDate &&
          new Date(a.dueDate) < new Date() &&
          (!s || s.status !== "graded")
        );
      });
    }
    if (t === "upcoming") {
      return list.filter((a) => {
        const s = byAssignment.get(a.id);
        return (!a.dueDate || new Date(a.dueDate) >= new Date()) && (!s || s.status !== "graded");
      });
    }
    return list;
  };

  const displayed = filterByTab(tab);

  return (
    <div className="space-y-6">
      <header className="border-b border-border/60 pb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Assignments</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isTeacher
            ? "View and manage assignments created for your classes."
            : "Keep track of active, upcoming, and completed tasks."}
        </p>
      </header>

      <Tabs
        value={tab}
        onValueChange={(v) => navigate({ search: { tab: v as AssignmentTab } })}
        className="space-y-4"
      >
        <TabsList>
          <TabsTrigger value="all">All ({list.length})</TabsTrigger>
          {!isTeacher && (
            <>
              <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
              <TabsTrigger value="overdue">Overdue</TabsTrigger>
              <TabsTrigger value="done">Completed</TabsTrigger>
            </>
          )}
          {isTeacher && (
            <TabsTrigger value="review">Needs Grading ({(reviewQueue.data || []).length})</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value={tab} className="space-y-3">
          {tab === "review" && isTeacher ? (
            (reviewQueue.data || []).length === 0 ? (
              <div className="panel p-12 text-center border-dashed">
                <Inbox className="mx-auto size-10 text-muted-foreground/60" />
                <h3 className="mt-3 text-base font-semibold">Inbox Zero!</h3>
                <p className="mt-1 text-xs text-muted-foreground">No submissions waiting for review.</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {(reviewQueue.data || []).map((sub) => (
                  <Link
                    key={sub.id}
                    to="/grading"
                    className="panel p-4 flex items-center justify-between bg-card hover:border-primary/40 transition-all hover:shadow-sm"
                  >
                    <div className="space-y-1">
                      <p className="font-semibold text-sm text-foreground">
                        {sub.studentName || "Student"} — Submission
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Submitted: {new Date(sub.submittedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <span className="text-xs font-medium text-warning bg-warning/10 px-2 py-0.5 rounded">
                      Needs Grading
                    </span>
                  </Link>
                ))}
              </div>
            )
          ) : q.isLoading ? (
            <div className="grid gap-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
          ) : displayed.length === 0 ? (
            <div className="panel p-12 text-center border-dashed">
              <Inbox className="mx-auto size-10 text-muted-foreground/60" />
              <h3 className="mt-3 text-base font-semibold">No assignments found</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {isTeacher
                  ? "Open a class to post an assignment."
                  : "No assignments match this filter."}
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              {displayed.map((a) => {
                const sub = byAssignment.get(a.id);
                const status: SubmissionStatus = sub
                  ? sub.status === "graded"
                    ? "completed"
                    : "submitted"
                  : "not_started";

                return (
                  <Link
                    key={a.id}
                    to="/assignments/$assignmentId"
                    params={{ assignmentId: a.id }}
                    className="panel p-4 flex items-center justify-between bg-card hover:border-primary/40 transition-all hover:shadow-sm"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm text-foreground hover:text-primary transition-colors">
                          {a.title}
                        </p>
                        {a.className && (
                          <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded">
                            {a.className}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="size-3" /> Due {formatDue(a.dueDate)}
                        </span>
                        <span>•</span>
                        <span>{a.maxPoints} points</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {!isTeacher && <StatusBadge status={status} />}
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
