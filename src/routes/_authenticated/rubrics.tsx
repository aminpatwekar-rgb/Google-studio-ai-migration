import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Edit,
  Copy,
  Sparkles,
  ChevronDown,
  ChevronUp,
  BookOpen,
  CheckCircle2,
  Layers,
  ArrowUp,
  ArrowDown,
  Wand2,
  Loader2,
  Table,
  FileText,
  HelpCircle,
} from "lucide-react";
import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/lib/auth";
import { useViewRole } from "@/lib/viewRole";
import { Button } from "@/components/ui/button";
import { PlanGate } from "@/components/PlanGate";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  generateRubricWithAi,
  STANDARD_TEMPLATES,
  type RubricCriterion,
  type RubricLevel,
} from "@/lib/rubrics.functions";

export const Route = createFileRoute("/_authenticated/rubrics")({
  head: () => ({ meta: [{ title: "Grading Rubrics — ONYX" }] }),
  component: RubricsPage,
});

export type RubricDoc = {
  id: string;
  title: string;
  description: string;
  owner_id: string;
  criteria: RubricCriterion[];
  created_at: string;
  updated_at?: string;
};

function defaultLevels(max = 4): RubricLevel[] {
  return [
    {
      id: `l_${Date.now()}_1`,
      label: "Exemplary",
      points: max,
      description: "Demonstrates comprehensive understanding and high quality.",
    },
    {
      id: `l_${Date.now()}_2`,
      label: "Proficient",
      points: Math.max(1, max - 1),
      description: "Meets expected standards with minor areas for improvement.",
    },
    {
      id: `l_${Date.now()}_3`,
      label: "Developing",
      points: Math.max(1, Math.floor(max / 2)),
      description: "Approaching standards but requires further refinement.",
    },
    {
      id: `l_${Date.now()}_4`,
      label: "Beginning",
      points: 1,
      description: "Demonstrates minimal understanding of the criterion.",
    },
  ];
}

function defaultBlankCriterion(idx: number): RubricCriterion {
  return {
    id: `crit_${Date.now()}_${idx}`,
    title: "",
    description: "",
    max_points: 4,
    levels: defaultLevels(4),
  };
}

export function RubricsPage() {
  const { user } = useAuth();
  const { effectiveRole } = useViewRole();
  const allowed = effectiveRole === "teacher" || effectiveRole === "admin";
  const qc = useQueryClient();

  // Dialog states
  const [editorOpen, setEditorOpen] = useState(false);
  const [aiGeneratorOpen, setAiGeneratorOpen] = useState(false);
  const [expandedRubricId, setExpandedRubricId] = useState<string | null>(null);

  // Editor form state
  const [editingRubricId, setEditingRubricId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [criteria, setCriteria] = useState<RubricCriterion[]>([]);

  // AI Generator form state
  const [aiTopic, setAiTopic] = useState("");
  const [aiGradeLevel, setAiGradeLevel] = useState("University / High School");
  const [aiScale, setAiScale] = useState<"4_level" | "3_level" | "5_level">("4_level");
  const [aiMaxPoints, setAiMaxPoints] = useState("4");
  const [aiCriteriaCount, setAiCriteriaCount] = useState("4");
  const [aiGuidelines, setAiGuidelines] = useState("");

  const generateFn = useServerFn(generateRubricWithAi);

  const rubricsQuery = useQuery({
    queryKey: ["rubrics"],
    enabled: allowed,
    queryFn: async (): Promise<RubricDoc[]> => {
      try {
        const snap = await getDocs(query(collection(db, "rubrics"), orderBy("created_at", "desc")));
        return snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as RubricDoc[];
      } catch {
        return [];
      }
    },
  });

  const openNewRubricModal = (template?: (typeof STANDARD_TEMPLATES)[0]) => {
    setEditingRubricId(null);
    if (template) {
      setTitle(template.title);
      setDescription(template.description);
      setCriteria(JSON.parse(JSON.stringify(template.criteria)));
    } else {
      setTitle("");
      setDescription("");
      setCriteria([defaultBlankCriterion(1), defaultBlankCriterion(2)]);
    }
    setEditorOpen(true);
  };

  const openEditRubricModal = (rubric: RubricDoc) => {
    setEditingRubricId(rubric.id);
    setTitle(rubric.title);
    setDescription(rubric.description || "");
    setCriteria(JSON.parse(JSON.stringify(rubric.criteria || [])));
    setEditorOpen(true);
  };

  const duplicateRubric = async (rubric: RubricDoc) => {
    if (!user) return;
    try {
      const ref = doc(collection(db, "rubrics"));
      await setDoc(ref, {
        id: ref.id,
        owner_id: user.id,
        title: `${rubric.title} (Copy)`,
        description: rubric.description || "",
        criteria: rubric.criteria || [],
        created_at: new Date().toISOString(),
      });
      toast.success("Rubric duplicated!");
      void qc.invalidateQueries({ queryKey: ["rubrics"] });
    } catch (err) {
      toast.error("Could not duplicate rubric.");
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("Rubric title is required.");
      if (!user) throw new Error("Sign in to save rubric.");
      if (!criteria.length) throw new Error("Please add at least one criterion.");

      // Clean & validate criteria
      const sanitizedCriteria = criteria.map((c, cIdx) => {
        const maxPts =
          Number(c.max_points) ||
          Math.max(...(c.levels || []).map((l) => Number(l.points) || 0), 1);
        return {
          id: c.id || `c_${Date.now()}_${cIdx}`,
          title: c.title.trim() || `Criterion ${cIdx + 1}`,
          description: c.description?.trim() || "",
          max_points: maxPts,
          levels: (c.levels || []).map((lvl, lIdx) => ({
            id: lvl.id || `l_${Date.now()}_${lIdx}`,
            label: lvl.label.trim() || `Level ${lIdx + 1}`,
            points: Number.isFinite(Number(lvl.points)) ? Number(lvl.points) : 0,
            description: lvl.description?.trim() || "",
          })),
        };
      });

      if (editingRubricId) {
        await updateDoc(doc(db, "rubrics", editingRubricId), {
          title: title.trim(),
          description: description.trim(),
          criteria: sanitizedCriteria,
          updated_at: new Date().toISOString(),
        });
      } else {
        const ref = doc(collection(db, "rubrics"));
        await setDoc(ref, {
          id: ref.id,
          owner_id: user.id,
          title: title.trim(),
          description: description.trim(),
          criteria: sanitizedCriteria,
          created_at: new Date().toISOString(),
        });
      }
    },
    onSuccess: async () => {
      toast.success(
        editingRubricId ? "Rubric updated successfully!" : "Rubric created successfully!",
      );
      setEditorOpen(false);
      setEditingRubricId(null);
      await qc.invalidateQueries({ queryKey: ["rubrics"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await deleteDoc(doc(db, "rubrics", id));
    },
    onSuccess: () => {
      toast.success("Rubric deleted.");
      void qc.invalidateQueries({ queryKey: ["rubrics"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const generateAiMutation = useMutation({
    mutationFn: async () => {
      if (!aiTopic.trim()) throw new Error("Topic or assignment prompt is required.");
      const res = await generateFn({
        data: {
          topic: aiTopic.trim(),
          gradeLevel: aiGradeLevel,
          scaleType: aiScale,
          maxScorePerCriterion: parseInt(aiMaxPoints, 10) || 4,
          criteriaCount: parseInt(aiCriteriaCount, 10) || 4,
          additionalGuidelines: aiGuidelines.trim() || undefined,
        },
      });
      return res;
    },
    onSuccess: (data) => {
      setTitle(data.title);
      setDescription(data.description);
      setCriteria(data.criteria);
      setAiGeneratorOpen(false);
      setEditorOpen(true);
      toast.success("AI generated rubric! Review and edit before saving.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Criteria manipulation helpers
  const addCriterion = () => {
    setCriteria((prev) => [...prev, defaultBlankCriterion(prev.length + 1)]);
  };

  const removeCriterion = (index: number) => {
    setCriteria((prev) => prev.filter((_, i) => i !== index));
  };

  const moveCriterion = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= criteria.length) return;
    setCriteria((prev) => {
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      if (moved) next.splice(target, 0, moved);
      return next;
    });
  };

  const updateCriterion = (index: number, patch: Partial<RubricCriterion>) => {
    setCriteria((prev) => {
      const next = [...prev];
      if (next[index]) {
        next[index] = { ...next[index], ...patch };
      }
      return next;
    });
  };

  const addLevel = (critIdx: number) => {
    setCriteria((prev) => {
      const next = [...prev];
      const c = next[critIdx];
      if (!c) return prev;
      const minPoints = Math.min(...(c.levels || []).map((l) => l.points), 1);
      const newLvl: RubricLevel = {
        id: `l_${Date.now()}_${c.levels.length + 1}`,
        label: `Level ${c.levels.length + 1}`,
        points: Math.max(0, minPoints - 1),
        description: "",
      };
      next[critIdx] = { ...c, levels: [...c.levels, newLvl] };
      return next;
    });
  };

  const removeLevel = (critIdx: number, lvlIdx: number) => {
    setCriteria((prev) => {
      const next = [...prev];
      const c = next[critIdx];
      if (!c || c.levels.length <= 1) return prev;
      next[critIdx] = { ...c, levels: c.levels.filter((_, i) => i !== lvlIdx) };
      return next;
    });
  };

  const updateLevel = (critIdx: number, lvlIdx: number, patch: Partial<RubricLevel>) => {
    setCriteria((prev) => {
      const next = [...prev];
      const c = next[critIdx];
      if (!c || !c.levels[lvlIdx]) return prev;
      const updatedLevels = [...c.levels];
      updatedLevels[lvlIdx] = { ...updatedLevels[lvlIdx], ...patch };
      next[critIdx] = { ...c, levels: updatedLevels };
      return next;
    });
  };

  const totalPoints = criteria.reduce((sum, c) => sum + (Number(c.max_points) || 0), 0);

  if (!allowed) {
    return (
      <div className="panel p-10 text-center">
        Rubrics are available to teachers and administrators.
      </div>
    );
  }

  const rubricsList = rubricsQuery.data ?? [];

  return (
    <PlanGate feature="rubrics">
      <div className="space-y-6">
        {/* Header matching ONYX design language */}
        <header className="flex flex-col gap-4 border-b border-border/70 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Grading Rubrics
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Build reusable scoring guides for standardized evaluation and transparent student
              feedback.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="default"
              onClick={() => setAiGeneratorOpen(true)}
              className="gap-1.5 press bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-medium text-xs shadow-xs"
            >
              <Sparkles className="size-3.5" /> AI Rubric Generator
            </Button>

            <Button
              size="sm"
              onClick={() => openNewRubricModal()}
              className="gap-1.5 press bg-primary text-primary-foreground font-medium text-xs"
            >
              <Plus className="size-4" /> New Rubric
            </Button>
          </div>
        </header>

        {/* Quick Starter Templates */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="size-3.5" /> Standard Templates
            </h2>
          </div>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {STANDARD_TEMPLATES.map((tmpl) => (
              <div
                key={tmpl.id}
                onClick={() => openNewRubricModal(tmpl)}
                className="panel p-4 bg-card border-border/80 hover:border-primary/50 hover:bg-secondary/20 transition-all cursor-pointer space-y-2 group rounded-xl shadow-xs"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                    {tmpl.title}
                  </h3>
                  <span className="text-[11px] font-mono font-medium text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                    {tmpl.criteria.length} criteria
                  </span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                  {tmpl.description}
                </p>
                <div className="pt-1 flex items-center text-xs font-medium text-primary gap-1">
                  <span>Use Template</span>
                  <Plus className="size-3" />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Rubrics List */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-foreground">
              My Rubrics ({rubricsList.length})
            </h2>
          </div>

          {rubricsQuery.isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="panel h-48 animate-pulse bg-muted/40 rounded-xl" />
              ))}
            </div>
          ) : rubricsList.length === 0 ? (
            <div className="panel p-12 text-center border-dashed rounded-xl bg-card space-y-3">
              <div className="size-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
                <Table className="size-6" />
              </div>
              <h3 className="text-base font-semibold text-foreground">No rubrics created yet</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Create structured scoring rubrics with performance levels or generate one with AI in
                seconds.
              </p>
              <div className="pt-2 flex flex-wrap justify-center gap-2">
                <Button size="sm" onClick={() => openNewRubricModal()} className="gap-1.5 text-xs">
                  <Plus className="size-4" /> Create First Rubric
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAiGeneratorOpen(true)}
                  className="gap-1.5 text-xs text-amber-600 dark:text-amber-400 border-amber-500/30"
                >
                  <Sparkles className="size-4" /> Generate with AI
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rubricsList.map((r) => {
                const isExpanded = expandedRubricId === r.id;
                const rTotalPts = (r.criteria || []).reduce(
                  (sum, c) => sum + (Number(c.max_points) || 0),
                  0,
                );

                return (
                  <div
                    key={r.id}
                    className={`panel p-5 bg-card border-border transition-all rounded-xl shadow-xs space-y-4 flex flex-col justify-between ${
                      isExpanded ? "col-span-full ring-1 ring-primary/40" : ""
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-bold text-foreground text-base tracking-tight leading-snug">
                          {r.title}
                        </h3>
                        <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20 shrink-0">
                          {rTotalPts} pts
                        </span>
                      </div>

                      {r.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                          {r.description}
                        </p>
                      )}

                      <div className="flex items-center gap-3 text-xs text-muted-foreground font-medium pt-1">
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="size-3.5 text-primary" />
                          {r.criteria?.length || 0} criteria
                        </span>
                        <span>•</span>
                        <span>
                          {new Date(r.created_at).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                      </div>

                      {/* Expandable Rubric Matrix Preview */}
                      {isExpanded && (
                        <div className="pt-4 space-y-3 border-t border-border mt-3 animate-in fade-in-50">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            Rubric Criteria & Levels Matrix
                          </h4>
                          <div className="overflow-x-auto border border-border rounded-lg bg-secondary/10">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead>
                                <tr className="border-b border-border bg-secondary/40">
                                  <th className="p-2.5 font-semibold text-foreground w-1/4">
                                    Criterion
                                  </th>
                                  <th className="p-2.5 font-semibold text-foreground">
                                    Performance Levels & Descriptors
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border/60">
                                {(r.criteria || []).map((c, i) => (
                                  <tr key={i} className="hover:bg-secondary/20">
                                    <td className="p-2.5 align-top">
                                      <p className="font-semibold text-foreground">{c.title}</p>
                                      {c.description && (
                                        <p className="text-[11px] text-muted-foreground mt-0.5">
                                          {c.description}
                                        </p>
                                      )}
                                      <span className="mt-1 inline-block font-mono text-[10px] text-primary font-bold bg-primary/10 px-1.5 py-0.2 rounded">
                                        Max {c.max_points} pts
                                      </span>
                                    </td>
                                    <td className="p-2.5 align-top">
                                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                        {(c.levels || []).map((lvl, lIdx) => (
                                          <div
                                            key={lIdx}
                                            className="p-2 rounded bg-card border border-border/80 space-y-1"
                                          >
                                            <div className="flex items-center justify-between font-bold text-[11px]">
                                              <span>{lvl.label}</span>
                                              <span className="text-primary font-mono">
                                                {lvl.points}p
                                              </span>
                                            </div>
                                            <p className="text-[10px] text-muted-foreground leading-tight line-clamp-3">
                                              {lvl.description || "No descriptor"}
                                            </p>
                                          </div>
                                        ))}
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Action Toolbar */}
                    <div className="pt-3 border-t border-border flex items-center justify-between gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpandedRubricId(isExpanded ? null : r.id)}
                        className="text-xs gap-1 text-muted-foreground hover:text-foreground h-8 px-2"
                      >
                        {isExpanded ? (
                          <>
                            <ChevronUp className="size-3.5" /> Collapse
                          </>
                        ) : (
                          <>
                            <ChevronDown className="size-3.5" /> Preview Matrix
                          </>
                        )}
                      </Button>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void duplicateRubric(r)}
                          title="Duplicate rubric"
                          className="h-8 px-2 text-xs gap-1"
                        >
                          <Copy className="size-3.5" /> Copy
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditRubricModal(r)}
                          className="h-8 px-2.5 text-xs gap-1 font-medium"
                        >
                          <Edit className="size-3.5 text-primary" /> Edit
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            if (confirm(`Delete rubric "${r.title}"?`)) {
                              deleteMutation.mutate(r.id);
                            }
                          }}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* FULL INTERACTIVE RUBRIC BUILDER / EDITOR MODAL */}
        <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-card border-border p-6 space-y-5">
            <DialogHeader className="space-y-1 border-b border-border pb-3">
              <div className="flex items-center justify-between">
                <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
                  {editingRubricId ? "Edit Rubric" : "Create New Rubric"}
                </DialogTitle>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-muted-foreground">Total Weight:</span>
                  <span className="font-mono text-sm font-bold text-primary bg-primary/10 border border-primary/20 px-2.5 py-0.5 rounded-lg">
                    {totalPoints} Total Points
                  </span>
                </div>
              </div>
              <DialogDescription className="text-xs text-muted-foreground">
                Define transparent criteria and performance descriptors for students and grading.
              </DialogDescription>
            </DialogHeader>

            {/* Basic Info */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="rubric-title" className="text-xs font-semibold text-foreground">
                  Rubric Title
                </Label>
                <Input
                  id="rubric-title"
                  placeholder="e.g. Literary Essay Analysis"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="bg-card text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rubric-desc" className="text-xs font-semibold text-foreground">
                  Description / Purpose (optional)
                </Label>
                <Input
                  id="rubric-desc"
                  placeholder="e.g. Used for end-of-unit capstone papers"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="bg-card text-sm"
                />
              </div>
            </div>

            {/* CRITERIA BUILDER */}
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-foreground">
                  Assessment Criteria ({criteria.length})
                </h3>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={addCriterion}
                  className="h-8 text-xs gap-1.5"
                >
                  <Plus className="size-3.5" /> Add Criterion
                </Button>
              </div>

              <div className="space-y-4">
                {criteria.map((crit, cIdx) => (
                  <div
                    key={crit.id || cIdx}
                    className="p-4 rounded-xl border border-border bg-secondary/15 space-y-4 shadow-2xs"
                  >
                    {/* Criterion Header Row */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-secondary font-bold text-xs">
                        {cIdx + 1}
                      </span>

                      <div className="flex-1 min-w-[200px]">
                        <Input
                          placeholder="Criterion Name (e.g. Critical Thinking & Argument)"
                          value={crit.title}
                          onChange={(e) => updateCriterion(cIdx, { title: e.target.value })}
                          className="h-8 bg-card font-semibold text-xs"
                        />
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Label className="text-[11px] text-muted-foreground font-semibold">
                          Max Pts:
                        </Label>
                        <Input
                          type="number"
                          min={1}
                          max={100}
                          value={crit.max_points}
                          onChange={(e) =>
                            updateCriterion(cIdx, {
                              max_points: Number(e.target.value) || 1,
                            })
                          }
                          className="h-8 w-16 bg-card text-xs text-center font-mono font-bold"
                        />
                      </div>

                      <div className="flex items-center gap-0.5 ml-auto">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground"
                          onClick={() => moveCriterion(cIdx, -1)}
                          disabled={cIdx === 0}
                        >
                          <ArrowUp className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground"
                          onClick={() => moveCriterion(cIdx, 1)}
                          disabled={cIdx === criteria.length - 1}
                        >
                          <ArrowDown className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-7 text-destructive hover:bg-destructive/10"
                          onClick={() => removeCriterion(cIdx)}
                          disabled={criteria.length <= 1}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Criterion Subdescription */}
                    <Input
                      placeholder="Guidance for what this criterion evaluates (optional)..."
                      value={crit.description}
                      onChange={(e) => updateCriterion(cIdx, { description: e.target.value })}
                      className="h-7 bg-card text-xs text-muted-foreground"
                    />

                    {/* Performance Levels Columns */}
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                          Performance Levels ({crit.levels.length})
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => addLevel(cIdx)}
                          className="h-6 text-[11px] gap-1 text-primary hover:bg-primary/10 px-2"
                        >
                          <Plus className="size-3" /> Add Level
                        </Button>
                      </div>

                      <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                        {crit.levels.map((lvl, lIdx) => (
                          <div
                            key={lvl.id || lIdx}
                            className="p-3 rounded-lg border border-border/90 bg-card space-y-2 relative group"
                          >
                            <div className="flex items-center gap-1.5">
                              <Input
                                value={lvl.label}
                                onChange={(e) =>
                                  updateLevel(cIdx, lIdx, {
                                    label: e.target.value,
                                  })
                                }
                                placeholder="Label (e.g. Good)"
                                className="h-7 text-xs font-semibold bg-secondary/30 flex-1 px-1.5"
                              />
                              <Input
                                type="number"
                                min={0}
                                max={100}
                                value={lvl.points}
                                onChange={(e) =>
                                  updateLevel(cIdx, lIdx, {
                                    points: Number(e.target.value) || 0,
                                  })
                                }
                                className="h-7 w-12 text-xs font-mono font-bold text-center bg-secondary/30 px-1"
                              />
                              {crit.levels.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeLevel(cIdx, lIdx)}
                                  className="text-muted-foreground hover:text-destructive opacity-50 group-hover:opacity-100 transition-opacity p-0.5"
                                  title="Delete level"
                                >
                                  <Trash2 className="size-3" />
                                </button>
                              )}
                            </div>

                            <Textarea
                              value={lvl.description}
                              onChange={(e) =>
                                updateLevel(cIdx, lIdx, {
                                  description: e.target.value,
                                })
                              }
                              placeholder="Descriptor of what student work looks like at this level..."
                              rows={3}
                              className="text-[11px] bg-secondary/15 resize-none leading-tight"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={addCriterion}
                className="w-full py-5 border-dashed border-border hover:border-primary text-xs font-semibold gap-1.5"
              >
                <Plus className="size-4" /> Add Another Criterion
              </Button>
            </div>

            <DialogFooter className="pt-3 border-t border-border flex flex-row items-center justify-between sm:justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditorOpen(false)}
                className="text-xs"
              >
                Cancel
              </Button>

              <Button
                size="sm"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !title.trim()}
                className="bg-primary text-primary-foreground font-medium text-xs px-5 shadow-xs"
              >
                {saveMutation.isPending ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin mr-1.5" /> Saving...
                  </>
                ) : editingRubricId ? (
                  "Save Changes"
                ) : (
                  "Create Rubric"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* AI RUBRIC GENERATOR MODAL */}
        <Dialog open={aiGeneratorOpen} onOpenChange={setAiGeneratorOpen}>
          <DialogContent className="max-w-lg bg-card border-border p-6 space-y-4">
            <DialogHeader className="space-y-1">
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <Sparkles className="size-5" />
                <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
                  AI Rubric Generator
                </DialogTitle>
              </div>
              <DialogDescription className="text-xs text-muted-foreground">
                Describe the assignment or prompt, and Gemini will generate a customized rubric with
                criteria and performance descriptors.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-1">
              <div className="space-y-1.5">
                <Label htmlFor="ai-topic" className="text-xs font-semibold text-foreground">
                  Assignment Subject / Topic Focus
                </Label>
                <Input
                  id="ai-topic"
                  placeholder="e.g. CRISPR Cas9 Lab Experiment or Shakespeare Sonnet Analysis"
                  value={aiTopic}
                  onChange={(e) => setAiTopic(e.target.value)}
                  className="bg-card text-sm"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">Target Level</Label>
                  <Input
                    value={aiGradeLevel}
                    onChange={(e) => setAiGradeLevel(e.target.value)}
                    placeholder="e.g. AP High School / College"
                    className="bg-card text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">Scale</Label>
                  <Select
                    value={aiScale}
                    onValueChange={(val: "4_level" | "3_level" | "5_level") => setAiScale(val)}
                  >
                    <SelectTrigger className="bg-card text-xs">
                      <SelectValue placeholder="Scale" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="4_level">4-Level (Exemplary to Beginning)</SelectItem>
                      <SelectItem value="3_level">3-Level (Exceeds, Meets, Below)</SelectItem>
                      <SelectItem value="5_level">5-Level (Detailed Gradient)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">
                    Number of Criteria
                  </Label>
                  <Select value={aiCriteriaCount} onValueChange={setAiCriteriaCount}>
                    <SelectTrigger className="bg-card text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3">3 Criteria</SelectItem>
                      <SelectItem value="4">4 Criteria (Recommended)</SelectItem>
                      <SelectItem value="5">5 Criteria</SelectItem>
                      <SelectItem value="6">6 Criteria</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">
                    Points Per Criterion
                  </Label>
                  <Select value={aiMaxPoints} onValueChange={setAiMaxPoints}>
                    <SelectTrigger className="bg-card text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="4">4 Points</SelectItem>
                      <SelectItem value="5">5 Points</SelectItem>
                      <SelectItem value="10">10 Points</SelectItem>
                      <SelectItem value="20">20 Points</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ai-guidelines" className="text-xs font-semibold text-foreground">
                  Special Guidelines or Emphasis (optional)
                </Label>
                <Textarea
                  id="ai-guidelines"
                  placeholder="e.g. Heavy emphasis on error analysis, citing at least 3 peer-reviewed sources..."
                  value={aiGuidelines}
                  onChange={(e) => setAiGuidelines(e.target.value)}
                  rows={2}
                  className="bg-card text-xs resize-none"
                />
              </div>
            </div>

            <DialogFooter className="pt-2 flex items-center justify-between sm:justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAiGeneratorOpen(false)}
                className="text-xs"
              >
                Cancel
              </Button>

              <Button
                size="sm"
                onClick={() => generateAiMutation.mutate()}
                disabled={generateAiMutation.isPending || !aiTopic.trim()}
                className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-medium text-xs shadow-xs"
              >
                {generateAiMutation.isPending ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin mr-1.5" />
                    Generating with Gemini...
                  </>
                ) : (
                  <>
                    <Sparkles className="size-3.5 mr-1.5" /> Generate Rubric
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PlanGate>
  );
}
