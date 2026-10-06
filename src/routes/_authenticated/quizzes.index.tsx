import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { ClipboardList, Lock, Plus, Timer, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useViewRole } from "@/lib/viewRole";
import { KIND_LABEL, percent, type QuizKind } from "@/lib/quiz/types";
import { DeleteQuizButton } from "@/components/DeleteQuizButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createQuiz,
  deleteQuiz,
  getAllClasses,
  getClassSubmissions,
  getQuizzesByClass,
  getStudentClasses,
  getStudentSubmissions,
  getTeacherClasses,
  updateQuiz,
} from "@/lib/firebase/firestore";
import type { Quiz, Submission } from "@/lib/firebase/models";

export const Route = createFileRoute("/_authenticated/quizzes/")({
  head: () => ({
    meta: [
      { title: "Quizzes & Exams — ONYX" },
      {
        name: "description",
        content:
          "Create AI-generated quizzes, run secure exams and track attempts across your ONYX classes.",
      },
      { property: "og:title", content: "Quizzes & Exams — ONYX" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: QuizzesPage,
});

type QuizRow = Quiz & { className: string };

// Quizzes created before drafts existed have no flag and are already visible to students.
const isLive = (q: Quiz) => q.published !== false;

function QuizzesPage() {
  const { role } = useAuth();
  const { effectiveRole } = useViewRole();
  if (!role) return <ListSkeleton />;
  return effectiveRole === "student" ? <StudentQuizzes /> : <TeacherQuizzes />;
}

function ListSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-9 w-52" />
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-24 w-full rounded-xl" />
      ))}
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="panel flex flex-col items-center gap-2 p-10 text-center">
      <ClipboardList className="size-6 text-muted-foreground" aria-hidden />
      <p className="font-medium">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

/* ------------------------------ create dialog ---------------------------- */

function CreateQuizDialog() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [classId, setClassId] = useState("");
  const [kind, setKind] = useState<QuizKind>("practice");

  const classes = useQuery({
    enabled: open && Boolean(user),
    queryKey: ["quiz-create-classes", user?.id, role],
    queryFn: () => (role === "admin" ? getAllClasses() : getTeacherClasses(user!.id)),
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Please sign in again.");
      return createQuiz(
        {
          classId,
          title: title.trim(),
          questions: [],
          kind,
          timeLimit: kind === "practice" ? 0 : 30,
          maxAttempts: 1,
          passingMarks: 0,
          lockdownEnabled: kind === "exam",
          randomizeQuestions: false,
          randomizeChoices: false,
          showResults: true,
          startAt: null,
          endAt: null,
          // New quizzes start as drafts: students only see them after Publish.
          published: false,
          archived: false,
          createdBy: user.id,
          createdAt: new Date().toISOString(),
        },
        {},
      );
    },
    onSuccess: (id) => {
      toast.success("Quiz created");
      setOpen(false);
      setTitle("");
      setClassId("");
      void qc.invalidateQueries({ queryKey: ["teacher-quizzes"] });
      void navigate({ to: "/quizzes/$quizId/edit", params: { quizId: id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 size-4" /> New quiz
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a quiz</DialogTitle>
          <DialogDescription>
            Pick the class and style. You'll add questions next — by hand or with AI.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="quiz-title">Title</Label>
            <Input
              id="quiz-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Chapter 4 check-in"
              maxLength={120}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quiz-class">Class</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger id="quiz-class">
                <SelectValue placeholder="Choose a class" />
              </SelectTrigger>
              <SelectContent>
                {(classes.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {classes.isSuccess && !classes.data?.length && (
              <p className="text-xs text-muted-foreground">Create a class first.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quiz-kind">Type</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as QuizKind)}>
              <SelectTrigger id="quiz-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(KIND_LABEL) as QuizKind[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {KIND_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={!title.trim() || !classId || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? "Creating…" : "Create & add questions"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------- teacher -------------------------------- */

function TeacherQuizzes() {
  const { user, role } = useAuth();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["teacher-quizzes", user?.id, role],
    enabled: Boolean(user),
    queryFn: async () => {
      const classes = role === "admin" ? await getAllClasses() : await getTeacherClasses(user!.id);
      const perClass = await Promise.all(
        classes.map(async (c) => {
          const [quizzes, subs] = await Promise.all([
            getQuizzesByClass(c.id),
            getClassSubmissions(c.id),
          ]);
          return { c, quizzes, subs };
        }),
      );
      const rows: QuizRow[] = [];
      const attempts = new Map<string, number>();
      for (const { c, quizzes, subs } of perClass) {
        for (const quiz of quizzes) rows.push({ ...quiz, className: c.name });
        for (const s of subs as Submission[]) {
          if (s.type === "quiz") attempts.set(s.refId, (attempts.get(s.refId) ?? 0) + 1);
        }
      }
      rows.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
      return { rows, attempts };
    },
  });

  const patch = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Quiz>; label: string }) =>
      updateQuiz(id, data),
    onSuccess: (_d, v) => {
      toast.success(v.label);
      void qc.invalidateQueries({ queryKey: ["teacher-quizzes"] });
      void qc.invalidateQueries({ queryKey: ["class-quizzes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeQuiz = useMutation({
    mutationFn: (id: string) => deleteQuiz(id),
    onSuccess: () => {
      toast.success("Quiz deleted");
      void qc.invalidateQueries({ queryKey: ["teacher-quizzes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) return <ListSkeleton />;
  if (q.isError)
    return (
      <div className="panel p-6 text-sm text-destructive">
        Couldn't load quizzes. {(q.error as Error).message}
      </div>
    );

  const attempts = q.data?.attempts ?? new Map<string, number>();
  const live = (q.data?.rows ?? []).filter((x) => !x.archived);
  const archived = (q.data?.rows ?? []).filter((x) => x.archived);

  const row = (x: QuizRow, index: number) => {
    const questions = (x.questions ?? []).length;
    const published = isLive(x);
    return (
      <motion.div
        key={x.id}
        layout
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ delay: Math.min(index * 0.035, 0.3), duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="panel flex flex-wrap items-center gap-3 p-4"
      >
        <div className="min-w-0 flex-1">
          <Link
            to="/quizzes/$quizId"
            params={{ quizId: x.id }}
            className="font-medium hover:underline"
          >
            {x.title}
          </Link>
          <p className="truncate text-sm text-muted-foreground">
            {x.className} · {KIND_LABEL[(x.kind ?? (x.timeLimit ? "timed" : "practice")) as QuizKind]} ·{" "}
            {questions} question{questions === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {x.lockdownEnabled && (
            <Badge variant="outline" className="gap-1">
              <Lock className="size-3" /> Lockdown
            </Badge>
          )}
          {x.timeLimit ? (
            <Badge variant="outline" className="gap-1">
              <Timer className="size-3" /> {x.timeLimit}m
            </Badge>
          ) : null}
          <Badge variant="outline" className="gap-1">
            <Users className="size-3" /> {attempts.get(x.id) ?? 0}
          </Badge>
          <Badge variant={published ? "default" : "secondary"}>
            {published ? "Published" : "Draft"}
          </Badge>
          <Button asChild variant="outline" size="sm">
            <Link to="/quizzes/$quizId/edit" params={{ quizId: x.id }}>
              Edit
            </Link>
          </Button>
          <Button
            size="sm"
            variant={published ? "ghost" : "default"}
            disabled={patch.isPending || questions === 0}
            onClick={() =>
              patch.mutate({
                id: x.id,
                data: { published: !published },
                label: published ? "Quiz unpublished" : "Quiz published",
              })
            }
          >
            {published ? "Unpublish" : "Publish"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={patch.isPending}
            onClick={() =>
              patch.mutate({
                id: x.id,
                data: { archived: !x.archived },
                label: x.archived ? "Quiz restored" : "Quiz archived",
              })
            }
          >
            {x.archived ? "Restore" : "Archive"}
          </Button>
          <DeleteQuizButton
            title={x.title}
            pending={removeQuiz.isPending}
            onConfirm={() => removeQuiz.mutate(x.id)}
          />
        </div>
      </motion.div>
    );
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Quizzes & exams</h1>
          <p className="text-sm text-muted-foreground">
            Generate questions with AI, run secure exams, and track every attempt.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/question-bank" search={{ quizId: undefined }}>Question bank</Link>
          </Button>
          <CreateQuizDialog />
        </div>
      </header>

      <Tabs defaultValue="live">
        <TabsList>
          <TabsTrigger value="live">Active ({live.length})</TabsTrigger>
          <TabsTrigger value="archived">Archived ({archived.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="live" className="mt-4 space-y-3">
          {live.length ? (
            <AnimatePresence mode="popLayout">{live.map(row)}</AnimatePresence>
          ) : (
            <EmptyState
              title="No quizzes yet"
              body="Create your first quiz and let AI draft the questions from your notes."
            />
          )}
        </TabsContent>
        <TabsContent value="archived" className="mt-4 space-y-3">
          {archived.length ? (
            <AnimatePresence mode="popLayout">{archived.map(row)}</AnimatePresence>
          ) : (
            <EmptyState title="Nothing archived" body="Archived quizzes will appear here." />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* -------------------------------- student -------------------------------- */

function StudentQuizzes() {
  const { user } = useAuth();

  const q = useQuery({
    queryKey: ["student-quizzes", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const classes = await getStudentClasses(user!.id);
      const perClass = await Promise.all(
        classes.map(async (c) =>
          (await getQuizzesByClass(c.id)).map((quiz): QuizRow => ({ ...quiz, className: c.name })),
        ),
      );
      const quizzes = perClass
        .flat()
        .filter((x) => isLive(x) && !x.archived)
        .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
      const subs = (await getStudentSubmissions(user!.id)).filter((s) => s.type === "quiz");
      return { quizzes, subs };
    },
  });

  if (q.isLoading) return <ListSkeleton />;
  if (q.isError)
    return (
      <div className="panel p-6 text-sm text-destructive">
        Couldn't load quizzes. {(q.error as Error).message}
      </div>
    );

  const subs = q.data?.subs ?? [];
  // Latest attempt per quiz drives the badge; the count drives "attempts left".
  const latest = new Map<string, Submission>();
  for (const s of [...subs].sort((a, b) => (a.attemptNo ?? 1) - (b.attemptNo ?? 1))) {
    latest.set(s.refId, s);
  }

  const all = q.data?.quizzes ?? [];
  const done = all.filter((x) => latest.has(x.id));
  const available = all.filter((x) => !latest.has(x.id));

  const card = (x: QuizRow, index: number) => {
    const a = latest.get(x.id);
    const count = (x.questions ?? []).length;
    const used = subs.filter((t) => t.refId === x.id).length;
    const exhausted = used >= (x.maxAttempts ?? 1);
    const notOpen = x.startAt ? new Date(x.startAt) > new Date() : false;
    const closed = x.endAt ? new Date(x.endAt) < new Date() : false;
    const total = x.totalMarks || (x.questions ?? []).reduce((n, qu) => n + (Number(qu.points) || 0), 0);

    return (
      <motion.div
        key={x.id}
        layout
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ delay: Math.min(index * 0.035, 0.3), duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="panel flex flex-wrap items-center gap-3 p-4"
      >
        <div className="min-w-0 flex-1">
          <Link
            to="/quizzes/$quizId"
            params={{ quizId: x.id }}
            className="font-medium hover:underline"
          >
            {x.title}
          </Link>
          <p className="truncate text-sm text-muted-foreground">
            {x.className} · {count} question{count === 1 ? "" : "s"}
            {x.timeLimit ? ` · ${x.timeLimit} min` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {x.lockdownEnabled && (
            <Badge variant="outline" className="gap-1">
              <Lock className="size-3" /> Lockdown
            </Badge>
          )}
          {a?.status === "graded" && x.showResults !== false ? (
            <Badge>{percent(a.score ?? 0, a.maxScore || total || 100)}%</Badge>
          ) : a?.status === "submitted" ? (
            <Badge variant="secondary">Awaiting grading</Badge>
          ) : null}
          <Button asChild size="sm" variant={a ? "outline" : "default"} disabled={count === 0}>
            <Link to="/quizzes/$quizId" params={{ quizId: x.id }}>
              {notOpen
                ? "Not open yet"
                : closed
                  ? "Closed"
                  : exhausted
                    ? "View result"
                    : a
                      ? "Retake"
                      : "Start"}
            </Link>
          </Button>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Quizzes</h1>
          <p className="text-sm text-muted-foreground">
            Practise, take timed tests and see where you stand.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/leaderboard">Leaderboard</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/achievements">Achievements</Link>
          </Button>
        </div>
      </header>

      <Tabs defaultValue="available">
        <TabsList>
          <TabsTrigger value="available">To do ({available.length})</TabsTrigger>
          <TabsTrigger value="done">Completed ({done.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="available" className="mt-4 space-y-3">
          {available.length ? (
            <AnimatePresence mode="popLayout">{available.map(card)}</AnimatePresence>
          ) : (
            <EmptyState
              title="Nothing to take right now"
              body="New quizzes from your teachers will show up here."
            />
          )}
        </TabsContent>
        <TabsContent value="done" className="mt-4 space-y-3">
          {done.length ? (
            <AnimatePresence mode="popLayout">{done.map(card)}</AnimatePresence>
          ) : (
            <EmptyState title="No attempts yet" body="Your completed quizzes will be listed here." />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
