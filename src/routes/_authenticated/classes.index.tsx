import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { ChevronRight, Copy, Plus, Users, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useViewRole } from "@/lib/viewRole";
import { SPRING_PRESS, getPressProps } from "@/lib/motionPresets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  getTeacherClasses,
  getStudentClasses,
  getAllClasses,
  createClass,
  joinClassByCode,
} from "@/lib/firebase/firestore";
import type { ClassRoom } from "@/lib/firebase/models";

export const Route = createFileRoute("/_authenticated/classes/")({
  validateSearch: (search: Record<string, unknown>): { join?: string } => {
    const raw = typeof search["join"] === "string" ? search["join"].trim().toUpperCase() : "";
    return /^[A-Z0-9]{4,12}$/.test(raw) ? { join: raw } : {};
  },
  head: () => ({
    meta: [
      { title: "Classes — ONYX" },
      {
        name: "description",
        content: "Create classes, share join codes, and manage your class rosters.",
      },
      { property: "og:title", content: "Classes — ONYX" },
      { property: "og:description", content: "Your classes and join codes in one place." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Classes,
});

function Classes() {
  const { role, user, profile } = useAuth();
  const { effectiveRole } = useViewRole();
  const { join: inviteCode } = Route.useSearch();
  const shouldReduceMotion = useReducedMotion();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [section, setSection] = useState("");
  const [description, setDescription] = useState("");
  const [code, setCode] = useState("");
  const [studentName, setStudentName] = useState("");
  const [rollNo, setRollNo] = useState("");
  const [erNo, setErNo] = useState("");
  const [srNo, setSrNo] = useState("");

  const isTeacher = effectiveRole === "teacher" || effectiveRole === "admin";

  // Invite links look like /classes?join=ABC123 — open the join dialog with the code filled in.
  useEffect(() => {
    if (!inviteCode) return;
    setCode(inviteCode);
    setJoinOpen(true);
  }, [inviteCode]);

  useEffect(() => {
    if (!joinOpen || isTeacher) return;
    setStudentName(profile?.full_name ?? "");
    setRollNo(profile?.roll_no ?? profile?.rollNo ?? "");
    setErNo(profile?.er_no ?? "");
    setSrNo(profile?.sr_no ?? "");
  }, [joinOpen, isTeacher, profile]);

  const classes = useQuery({
    queryKey: ["classes", user?.id, effectiveRole],
    enabled: Boolean(user && effectiveRole),
    queryFn: async () => {
      if (effectiveRole === "admin") {
        return await getAllClasses();
      }
      if (isTeacher) {
        return await getTeacherClasses(user!.id);
      }
      return await getStudentClasses(user!.id);
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Class name is required");
      await createClass({
        name: name.trim().slice(0, 120),
        subject: subject.trim() || "",
        description: description.trim() || "",
        teacherId: user!.id,
        teacherName: profile?.full_name || profile?.name || "Teacher",
        studentIds: [],
        joinCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
        createdAt: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      toast.success("Class created");
      setOpen(false);
      setName("");
      setSubject("");
      setSection("");
      setDescription("");
      void qc.invalidateQueries({ queryKey: ["classes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const join = useMutation({
    mutationFn: async () => {
      if (!code.trim()) throw new Error("Enter the join code");
      if (effectiveRole === "student") {
        if (!studentName.trim()) throw new Error("Full name is required");
        if (!rollNo.trim() && !erNo.trim() && !srNo.trim()) throw new Error("Enter at least one Roll No, ER No, or SR No.");
      }
      return await joinClassByCode(user!.id, code.trim(), { fullName: studentName, rollNo, erNo, srNo }, effectiveRole ?? "student");
    },
    onSuccess: (res) => {
      toast.success(`Joined ${res.name}!`);
      setJoinOpen(false);
      setCode("");
      void qc.invalidateQueries({ queryKey: ["classes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = classes.data ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 border-b border-border/60 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Classes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isTeacher
              ? "Manage your classrooms, share join codes with students, and review rosters."
              : "Classes you have enrolled in. Submit assignments and view grades."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {(effectiveRole === "student" || effectiveRole === "teacher" || effectiveRole === "admin") && (
            <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5 press">
                  <Plus className="size-4" /> Join Class
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Join a Class</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="code">Class Code</Label>
                    <Input
                      id="code"
                      placeholder="e.g. 6-character code"
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      className="font-mono tracking-widest uppercase"
                      maxLength={12}
                    />
                  </div>
                  {effectiveRole === "student" && <div className="space-y-1.5">
                    <Label htmlFor="studentName">Full Name</Label>
                    <Input id="studentName" value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="Your full name" />
                  </div>}
                  {effectiveRole === "student" && <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5"><Label htmlFor="rollNo">Roll No</Label><Input id="rollNo" value={rollNo} onChange={(e) => setRollNo(e.target.value)} placeholder="Optional" /></div>
                    <div className="space-y-1.5"><Label htmlFor="erNo">ER No</Label><Input id="erNo" value={erNo} onChange={(e) => setErNo(e.target.value)} placeholder="Optional" /></div>
                    <div className="space-y-1.5"><Label htmlFor="srNo">SR No</Label><Input id="srNo" value={srNo} onChange={(e) => setSrNo(e.target.value)} placeholder="Optional" /></div>
                  </div>}
                  {effectiveRole === "student" && <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
                    <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>Enter at least one academic identifier. Classmates see your name and identifier, not your email.</span>
                  </div>}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setJoinOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={() => join.mutate()} disabled={join.isPending}>
                    {join.isPending ? "Joining..." : "Join Class"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {isTeacher && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5 press">
                  <Plus className="size-4" /> Create Class
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create a New Class</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="className">Class Name</Label>
                    <Input
                      id="className"
                      placeholder="e.g. Grade 10 Mathematics"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="subject">Subject</Label>
                    <Input
                      id="subject"
                      placeholder="e.g. Algebra / Geometry"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="desc">Description</Label>
                    <Textarea
                      id="desc"
                      placeholder="Optional notes or details for students"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={() => create.mutate()} disabled={create.isPending}>
                    {create.isPending ? "Creating..." : "Create Class"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </header>

      {classes.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="panel p-12 text-center border-dashed">
          <Users className="mx-auto size-10 text-muted-foreground/60" />
          <h3 className="mt-4 text-base font-semibold">No classes yet</h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-sm mx-auto">
            {isTeacher
              ? "Create your first class to share with your students."
              : "Ask your teacher for a 6-character class code to join."}
          </p>
          <div className="mt-6">
            {isTeacher ? (
              <Button onClick={() => setOpen(true)} size="sm">
                Create Class
              </Button>
            ) : (
              <Button onClick={() => setJoinOpen(true)} size="sm">
                Join Class
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {list.map((c) => (
              <motion.div
                key={c.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="panel flex flex-col justify-between p-5 bg-card hover:border-primary/40 transition-all hover:shadow-md"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      to="/classes/$classId"
                      params={{ classId: c.id }}
                      className="font-semibold text-lg hover:text-primary transition-colors line-clamp-1"
                    >
                      {c.name}
                    </Link>
                  </div>
                  {c.subject && <p className="text-xs text-muted-foreground mt-0.5">{c.subject}</p>}
                  {c.description && (
                    <p className="text-xs text-muted-foreground/80 mt-2 line-clamp-2">
                      {c.description}
                    </p>
                  )}
                </div>

                <div className="mt-5 border-t border-border/50 pt-3 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Users className="size-3.5" />
                    <span>{(c.studentIds || []).length} students</span>
                  </div>

                  {isTeacher && c.joinCode && (
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(c.joinCode);
                        toast.success(`Copied join code: ${c.joinCode}`);
                      }}
                      className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-0.5 font-mono text-xs text-secondary-foreground hover:bg-secondary/80 transition-colors"
                      title="Click to copy join code"
                    >
                      <span>{c.joinCode}</span>
                      <Copy className="size-3" />
                    </button>
                  )}

                  <Link
                    to="/classes/$classId"
                    params={{ classId: c.id }}
                    className="text-xs font-medium text-primary hover:underline flex items-center gap-0.5"
                  >
                    Open <ChevronRight className="size-3.5" />
                  </Link>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
