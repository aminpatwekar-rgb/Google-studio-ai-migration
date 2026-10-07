import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  FolderKanban,
  Plus,
  Calendar,
  CheckCircle2,
  Clock,
  Users,
  CheckSquare,
  Square,
  Trash2,
  Edit,
  GraduationCap,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useViewRole } from "@/lib/viewRole";
import {
  getTeacherClasses,
  getAllClasses,
  getStudentClasses,
  getProjectsByClass,
  createProject,
  updateProject,
  deleteProject,
  getClassRoster,
} from "@/lib/firebase/firestore";
import type { Project, ProjectTask, ProjectMilestone } from "@/lib/firebase/models";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/projects")({
  head: () => ({
    meta: [
      { title: "Projects — ONYX" },
      { name: "description", content: "Collaborative project management, tasks, and milestones." },
      { property: "og:title", content: "Projects — ONYX" },
    ],
  }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const { user } = useAuth();
  const { effectiveRole } = useViewRole();
  const qc = useQueryClient();

  const isTeacher = effectiveRole === "teacher" || effectiveRole === "admin";
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Project Form State
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [formClassId, setFormClassId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [tasks, setTasks] = useState<
    { id: string; title: string; status: "todo" | "in_progress" | "completed" }[]
  >([]);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [milestones, setMilestones] = useState<
    { id: string; title: string; dueDate: string; completed: boolean }[]
  >([]);
  const [newMilestoneTitle, setNewMilestoneTitle] = useState("");
  const [newMilestoneDate, setNewMilestoneDate] = useState("");

  const classes = useQuery({
    queryKey: ["projects-classes", user?.id, effectiveRole],
    enabled: Boolean(user),
    queryFn: async () => {
      if (effectiveRole === "admin") return await getAllClasses();
      if (isTeacher) return await getTeacherClasses(user!.id);
      return await getStudentClasses(user!.id);
    },
  });

  const projectsQuery = useQuery({
    queryKey: ["all-projects", user?.id, classes.data?.length],
    enabled: Boolean(classes.data?.length),
    queryFn: async () => {
      const cls = classes.data || [];
      const map = new Map(cls.map((c) => [c.id, c.name]));
      let all: (Project & { className?: string })[] = [];

      for (const c of cls) {
        const pList = await getProjectsByClass(c.id);
        all = all.concat(pList.map((p) => ({ ...p, className: c.name })));
      }
      return { list: all, classMap: map };
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("Project title is required");
      if (!formClassId) throw new Error("Please select a class");

      const totalItems = tasks.length + milestones.length;
      const completedItems =
        tasks.filter((t) => t.status === "completed").length +
        milestones.filter((m) => m.completed).length;
      const progressPercent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

      await createProject({
        classId: formClassId,
        title: title.trim(),
        description: description.trim(),
        createdBy: user!.id,
        memberIds: [],
        status: "in_progress",
        tasks: tasks.map((t) => ({ ...t, status: t.status })),
        milestones,
        progressPercent,
        dueDate: dueDate || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      toast.success("Project created successfully!");
      setCreateOpen(false);
      resetForm();
      void qc.invalidateQueries({ queryKey: ["all-projects"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (projectId: string) => {
      await deleteProject(projectId);
    },
    onSuccess: () => {
      toast.success("Project deleted");
      void qc.invalidateQueries({ queryKey: ["all-projects"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleTaskMutation = useMutation({
    mutationFn: async ({ project, taskId }: { project: Project; taskId: string }) => {
      const updatedTasks = project.tasks.map((t) => {
        if (t.id === taskId) {
          const nextStatus: ProjectTask["status"] = t.status === "completed" ? "todo" : "completed";
          return { ...t, status: nextStatus };
        }
        return t;
      });

      const totalItems = updatedTasks.length + project.milestones.length;
      const completedItems =
        updatedTasks.filter((t) => t.status === "completed").length +
        project.milestones.filter((m) => m.completed).length;
      const progressPercent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

      await updateProject(project.id, {
        tasks: updatedTasks,
        progressPercent,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["all-projects"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMilestoneMutation = useMutation({
    mutationFn: async ({ project, milestoneId }: { project: Project; milestoneId: string }) => {
      const updatedMilestones = project.milestones.map((m) => {
        if (m.id === milestoneId) {
          return { ...m, completed: !m.completed };
        }
        return m;
      });

      const totalItems = project.tasks.length + updatedMilestones.length;
      const completedItems =
        project.tasks.filter((t) => t.status === "completed").length +
        updatedMilestones.filter((m) => m.completed).length;
      const progressPercent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

      await updateProject(project.id, {
        milestones: updatedMilestones,
        progressPercent,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["all-projects"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setFormClassId("");
    setDueDate("");
    setTasks([]);
    setMilestones([]);
    setNewTaskTitle("");
    setNewMilestoneTitle("");
    setNewMilestoneDate("");
  };

  const addTask = () => {
    if (!newTaskTitle.trim()) return;
    setTasks((prev) => [
      ...prev,
      { id: `task_${Date.now()}_${prev.length}`, title: newTaskTitle.trim(), status: "todo" },
    ]);
    setNewTaskTitle("");
  };

  const removeTask = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  const addMilestone = () => {
    if (!newMilestoneTitle.trim()) return;
    setMilestones((prev) => [
      ...prev,
      {
        id: `ms_${Date.now()}_${prev.length}`,
        title: newMilestoneTitle.trim(),
        dueDate: newMilestoneDate || new Date().toISOString().split("T")[0]!,
        completed: false,
      },
    ]);
    setNewMilestoneTitle("");
    setNewMilestoneDate("");
  };

  const removeMilestone = (id: string) => {
    setMilestones((prev) => prev.filter((m) => m.id !== id));
  };

  const allProjects = projectsQuery.data?.list || [];
  const filteredProjects = allProjects.filter((p) => {
    const classMatch = selectedClassId === "all" || p.classId === selectedClassId;
    const statusMatch = statusFilter === "all" || p.status === statusFilter;
    return classMatch && statusMatch;
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">
            Plan, collaborate, and track deliverables, milestones and group tasks.
          </p>
        </div>
        {isTeacher && (
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="size-4" /> Create Project
          </Button>
        )}
      </header>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={selectedClassId} onValueChange={setSelectedClassId}>
          <SelectTrigger className="w-48 bg-card text-xs">
            <SelectValue placeholder="All classes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All classes</SelectItem>
            {(classes.data || []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 bg-card text-xs">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="planning">Planning</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="review">Review</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {projectsQuery.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="panel p-10 text-center border-dashed space-y-3">
          <FolderKanban className="mx-auto size-12 text-muted-foreground/50" />
          <h3 className="text-base font-semibold">No projects yet</h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            {isTeacher
              ? "Create structured group assignments, capstones, science lab projects with milestones and tasks."
              : "No projects have been assigned for your enrolled classes yet."}
          </p>
          {isTeacher && (
            <Button size="sm" onClick={() => setCreateOpen(true)} className="mt-2">
              <Plus className="mr-1.5 size-4" /> Create first project
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filteredProjects.map((p) => {
            const isCompleted = p.progressPercent === 100;
            return (
              <div
                key={p.id}
                className="panel p-5 flex flex-col justify-between space-y-4 bg-card hover:border-primary/40 transition-all hover:shadow-md group"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-semibold text-primary">{p.className}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="rounded bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground capitalize">
                        {p.status.replace("_", " ")}
                      </span>
                      {isTeacher && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground hover:text-destructive"
                          onClick={() => deleteMutation.mutate(p.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>

                  <h3 className="text-base font-semibold leading-snug group-hover:text-primary transition-colors">
                    {p.title}
                  </h3>

                  {p.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                      {p.description}
                    </p>
                  )}

                  {/* Progress Bar */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-semibold tabular-nums text-foreground">
                        {p.progressPercent}%
                      </span>
                    </div>
                    <Progress value={p.progressPercent} className="h-1.5" />
                  </div>

                  {/* Milestones Preview */}
                  {p.milestones.length > 0 && (
                    <div className="pt-2 border-t border-border/60 space-y-1.5">
                      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                        Milestones ({p.milestones.filter((m) => m.completed).length}/
                        {p.milestones.length})
                      </p>
                      <ul className="space-y-1">
                        {p.milestones.slice(0, 3).map((m) => (
                          <li
                            key={m.id}
                            className="flex items-center justify-between text-xs gap-2 cursor-pointer hover:text-primary"
                            onClick={() =>
                              toggleMilestoneMutation.mutate({ project: p, milestoneId: m.id })
                            }
                          >
                            <span className="flex items-center gap-1.5 min-w-0 truncate">
                              {m.completed ? (
                                <CheckCircle2 className="size-3.5 text-success shrink-0" />
                              ) : (
                                <Clock className="size-3.5 text-muted-foreground shrink-0" />
                              )}
                              <span
                                className={
                                  m.completed
                                    ? "line-through text-muted-foreground truncate"
                                    : "truncate"
                                }
                              >
                                {m.title}
                              </span>
                            </span>
                            <span className="text-[10px] text-muted-foreground shrink-0">
                              {new Date(m.dueDate).toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Tasks Preview */}
                  {p.tasks.length > 0 && (
                    <div className="pt-2 border-t border-border/60 space-y-1.5">
                      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                        Tasks ({p.tasks.filter((t) => t.status === "completed").length}/
                        {p.tasks.length})
                      </p>
                      <ul className="space-y-1">
                        {p.tasks.slice(0, 3).map((t) => (
                          <li
                            key={t.id}
                            className="flex items-center gap-2 text-xs cursor-pointer hover:text-primary"
                            onClick={() => toggleTaskMutation.mutate({ project: p, taskId: t.id })}
                          >
                            {t.status === "completed" ? (
                              <CheckSquare className="size-3.5 text-primary shrink-0" />
                            ) : (
                              <Square className="size-3.5 text-muted-foreground shrink-0" />
                            )}
                            <span
                              className={
                                t.status === "completed"
                                  ? "line-through text-muted-foreground truncate"
                                  : "truncate"
                              }
                            >
                              {t.title}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {p.dueDate && (
                  <div className="pt-2 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="size-3.5" /> Due:
                    </span>
                    <span className="font-medium text-foreground">
                      {new Date(p.dueDate).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create Project Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
            <DialogDescription>
              Define the project scope, assign it to a class, and break it down into milestones and
              tasks.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Class *</Label>
              <Select value={formClassId} onValueChange={setFormClassId}>
                <SelectTrigger className="bg-card text-xs">
                  <SelectValue placeholder="Select target class" />
                </SelectTrigger>
                <SelectContent>
                  {(classes.data || []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Project Title *</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Thermodynamics Lab Simulation & Research Report"
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Description & Guidelines</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Detail expectations, required deliverables, team structure..."
                className="text-xs min-h-20"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Final Due Date</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="text-xs"
              />
            </div>

            {/* Milestones builder */}
            <div className="rounded-lg border border-border p-3 space-y-2 bg-secondary/20">
              <Label className="text-xs font-semibold">Milestones & Checkpoints</Label>
              <div className="flex gap-2">
                <Input
                  value={newMilestoneTitle}
                  onChange={(e) => setNewMilestoneTitle(e.target.value)}
                  placeholder="e.g. Literature Review Submission"
                  className="text-xs flex-1"
                />
                <Input
                  type="date"
                  value={newMilestoneDate}
                  onChange={(e) => setNewMilestoneDate(e.target.value)}
                  className="text-xs w-36"
                />
                <Button type="button" size="sm" variant="secondary" onClick={addMilestone}>
                  Add
                </Button>
              </div>
              {milestones.length > 0 && (
                <ul className="space-y-1 mt-2">
                  {milestones.map((m) => (
                    <li
                      key={m.id}
                      className="flex items-center justify-between text-xs p-1.5 rounded bg-card border"
                    >
                      <span>
                        {m.title} ({m.dueDate})
                      </span>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-5 text-destructive"
                        onClick={() => removeMilestone(m.id)}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Tasks builder */}
            <div className="rounded-lg border border-border p-3 space-y-2 bg-secondary/20">
              <Label className="text-xs font-semibold">Deliverable Tasks</Label>
              <div className="flex gap-2">
                <Input
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="e.g. Compile experimental datasets into Excel/CSV"
                  className="text-xs flex-1"
                />
                <Button type="button" size="sm" variant="secondary" onClick={addTask}>
                  Add
                </Button>
              </div>
              {tasks.length > 0 && (
                <ul className="space-y-1 mt-2">
                  {tasks.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center justify-between text-xs p-1.5 rounded bg-card border"
                    >
                      <span>{t.title}</span>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-5 text-destructive"
                        onClick={() => removeTask(t.id)}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !title.trim() || !formClassId}
            >
              {createMutation.isPending ? "Creating..." : "Create Project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
