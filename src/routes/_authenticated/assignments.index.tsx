import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth";
import { useViewRole } from "@/lib/viewRole";
import { formatDue } from "@/lib/assignments";
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
import { Calendar, Inbox } from "lucide-react";
import { CountdownTimer } from "@/components/CountdownTimer";

type AssignmentTab =
  "all" | "upcoming" | "overdue" | "done" | "submitted" | "review" | "to-review" | "archive";

const VALID: AssignmentTab[] = [
  "all",
  "upcoming",
  "overdue",
  "done",
  "submitted",
  "review",
  "to-review",
  "archive",
];

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
  const rawTab = search.tab ?? "upcoming";
  const tab = rawTab === "submitted" ? "done" : rawTab === "to-review" ? "review" : rawTab;
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

      const classMap = new Map(
        classes.map((c) => [c.id, { name: c.name, subject: c.subject || "" }]),
      );
      let list: (Assignment & { className?: string; subject?: string })[] = [];

      for (const c of classes) {
        const aList = await getAssignmentsByClass(c.id);
        list = list.concat(
          aList.map((a) => ({
            ...a,
            className: c.name,
            subject: a.subject || c.subject || "",
          })),
        );
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
        effectiveRole === "admin" ? await getAllClasses() : await getTeacherClasses(user!.id);
      const classIds = classes.map((c) => c.id);
      const subs = await getTeacherGradingQueue(classIds);
      return subs.filter((s) => s.status === "submitted");
    },
  });

  const list = q.data?.list ?? [];
  const byAssignment = q.data?.byAssignment ?? new Map();

  const activeNonArchived = list.filter((a) => !a.archived);
  const upcomingList = activeNonArchived.filter((a) => {
    const s = byAssignment.get(a.id);
    return (!a.dueDate || new Date(a.dueDate) >= new Date()) && (!s || s.status !== "graded");
  });
  const overdueList = activeNonArchived.filter((a) => {
    const s = byAssignment.get(a.id);
    return a.dueDate && new Date(a.dueDate) < new Date() && (!s || s.status !== "graded");
  });
  const doneList = activeNonArchived.filter((a) => {
    const s = byAssignment.get(a.id);
    return s && ["submitted", "graded"].includes(s.status);
  });
  const archiveList = list.filter((a) => a.archived === true);
  const reviewList = reviewQueue.data ?? [];

  const getDisplayed = (t: string) => {
    if (t === "all") return activeNonArchived;
    if (t === "upcoming") return upcomingList;
    if (t === "overdue") return overdueList;
    if (t === "done" || t === "submitted") return doneList;
    if (t === "archive") return archiveList;
    return activeNonArchived;
  };

  const displayed = getDisplayed(tab);

  return (
    <div className="space-y-6">
      {/* Header matching Image 2 */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Assignments
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isTeacher
            ? "Everything you've posted."
            : "Track your tasks, deadlines, and submissions."}
        </p>
      </div>

      {/* Tabs matching Image 2 */}
      <Tabs
        value={tab}
        onValueChange={(v) => navigate({ search: { tab: v as AssignmentTab } })}
        className="space-y-5"
      >
        <TabsList className="bg-card/70 border border-border/80 p-1 flex flex-wrap h-auto gap-1">
          <TabsTrigger value="all" className="rounded-md text-xs font-medium">
            All ({activeNonArchived.length})
          </TabsTrigger>
          <TabsTrigger value="upcoming" className="rounded-md text-xs font-medium">
            Upcoming ({upcomingList.length})
          </TabsTrigger>
          <TabsTrigger value="overdue" className="rounded-md text-xs font-medium">
            Overdue ({overdueList.length})
          </TabsTrigger>
          {isTeacher ? (
            <TabsTrigger value="review" className="rounded-md text-xs font-medium">
              To review ({reviewList.length})
            </TabsTrigger>
          ) : (
            <TabsTrigger value="done" className="rounded-md text-xs font-medium">
              Submitted ({doneList.length})
            </TabsTrigger>
          )}
          <TabsTrigger value="archive" className="rounded-md text-xs font-medium">
            Archive ({archiveList.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="space-y-3">
          {q.isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
          ) : tab === "review" && isTeacher ? (
            reviewList.length === 0 ? (
              <div className="panel p-8 text-center border-dashed">
                <p className="text-sm font-semibold">No submissions waiting for review.</p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {reviewList.map((s) => (
                  <Link
                    key={s.id}
                    to="/grading/assignment/$assignmentId"
                    params={{ assignmentId: s.refId }}
                    search={{ s: undefined }}
                    className="panel p-4 block bg-card hover:border-primary/40 transition-all hover:shadow-sm"
                  >
                    <p className="font-semibold text-sm text-foreground">
                      {s.studentName || "Student"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Submitted for grading</p>
                  </Link>
                ))}
              </div>
            )
          ) : displayed.length === 0 ? (
            <div className="panel p-8 text-center border-dashed border-border/80">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Inbox className="size-6" />
              </div>
              <h3 className="mt-3 text-sm font-semibold text-foreground">No assignments found</h3>
              <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
                {tab === "upcoming"
                  ? "You have no upcoming deadlines right now."
                  : tab === "overdue"
                    ? "No overdue assignments! Great job keeping up."
                    : "No assignments to display in this view."}
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {displayed.map((a, i) => (
                <motion.div
                  key={a.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.2) }}
                >
                  <Link
                    to="/assignments/$assignmentId"
                    params={{ assignmentId: a.id }}
                    className="panel p-4 block bg-card hover:border-primary/40 transition-all hover:shadow-md hover:-translate-y-0.5 group space-y-2"
                  >
                    <p className="font-bold text-base text-foreground group-hover:text-primary transition-colors">
                      {a.title}
                    </p>
                    <p className="text-xs text-muted-foreground font-medium">
                      {a.className || "Class"}
                      {a.subject ? ` · ${a.subject}` : ""}
                    </p>
                    <div className="pt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5 font-medium truncate">
                        <Calendar className="size-3.5 text-muted-foreground/80 shrink-0" />
                        <span className="truncate">Due {formatDue(a.dueDate)}</span>
                      </div>
                      <CountdownTimer
                        dueDate={a.dueDate}
                        submitted={Boolean(
                          byAssignment.get(a.id) &&
                          ["submitted", "graded"].includes(byAssignment.get(a.id)!.status),
                        )}
                        size="sm"
                      />
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
