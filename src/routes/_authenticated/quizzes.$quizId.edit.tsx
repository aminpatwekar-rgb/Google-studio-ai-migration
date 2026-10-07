import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronRight,
  Eye,
  FileText,
  FileUp,
  ImagePlus,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  X,
  Sigma,
  ShieldAlert,
  Calendar,
  Clock,
  Lock,
  Timer,
  CheckSquare,
  BookOpen,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getQuiz,
  updateQuiz,
  getClass,
  getSubmissionsByRef,
  deleteQuiz,
} from "@/lib/firebase/firestore";
import { getDocs, query, collection, where } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import type { QuizQuestion, QuizKind } from "@/lib/firebase/models";
import { generateQuizQuestions } from "@/lib/quiz/ai.functions";
import { extractMaterial } from "@/lib/quiz/extract";
import { RenderMathText } from "@/components/math/RenderMathText";
import { MathEditor } from "@/components/math/MathEditor";
import { uploadQuizImage } from "@/lib/firebase/storage";
import { validateFile } from "@/lib/uploadConfig";
import { UploadProgressBar, type UploadProgressInfo } from "@/components/ui/upload-progress";

export const Route = createFileRoute("/_authenticated/quizzes/$quizId/edit")({
  head: () => ({
    meta: [
      { title: "Edit Quiz — ONYX" },
      { name: "description", content: "Build and edit questions in ONYX." },
      { property: "og:title", content: "Edit Quiz — ONYX" },
    ],
  }),
  component: EditQuizPage,
});

type QuestionItem = {
  id: string;
  type: "mcq" | "multi_select" | "true_false" | "fill_blank" | "short_answer" | "essay";
  difficulty: "easy" | "medium" | "hard";
  prompt: string;
  options: string[];
  correct: string[];
  explanation: string;
  points: number;
  imageUrl?: string;
};

function formatTypeToQuizQuestion(q: QuestionItem): QuizQuestion {
  return {
    id: q.id,
    type:
      q.type === "mcq" || q.type === "true_false"
        ? "single_choice"
        : q.type === "multi_select"
          ? "multiple_choice"
          : "text",
    text: q.prompt,
    options: q.options,
    points: q.points,
    imageUrl: q.imageUrl,
  };
}

export function EditQuizPage() {
  const { quizId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState("questions");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<QuizKind>("practice");
  const [timeLimit, setTimeLimit] = useState("20");
  const [scheduledStart, setScheduledStart] = useState("");
  const [scheduledEnd, setScheduledEnd] = useState("");
  const [lockdown, setLockdown] = useState(false);
  const [published, setPublished] = useState(true);
  const [questions, setQuestions] = useState<QuestionItem[]>([]);

  // AI Generator local states
  const [studyMaterial, setStudyMaterial] = useState("");
  const [aiCount, setAiCount] = useState<number | string>(8);
  const [aiDifficulty, setAiDifficulty] = useState<"easy" | "medium" | "hard" | "mixed">("mixed");
  const [aiTopic, setAiTopic] = useState("");
  const [aiTypes, setAiTypes] = useState<string[]>(["mcq", "true_false", "short_answer"]);
  const [withExplanations, setWithExplanations] = useState(true);
  const [readingFiles, setReadingFiles] = useState(false);
  const [mathHelperOpen, setMathHelperOpen] = useState<number | null>(null);
  const [mathFormula, setMathFormula] = useState("");
  const [uploadingQuestionIdx, setUploadingQuestionIdx] = useState<number | null>(null);
  const [questionUploadProgress, setQuestionUploadProgress] = useState<UploadProgressInfo | null>(
    null,
  );
  const questionFileInputRef = useRef<HTMLInputElement>(null);
  const [targetQuestionUploadIdx, setTargetQuestionUploadIdx] = useState<number | null>(null);

  // Reviewing generated questions
  const [reviewQuestions, setReviewingGenerated] = useState<QuestionItem[] | null>(null);
  const [selectedReviewIds, setSelectedReviewIds] = useState<Set<string>>(new Set());

  // Question Bank import
  const [bankOpen, setBankOpen] = useState(false);
  const [selectedBankIds, setSelectedBankIds] = useState<Set<string>>(new Set());

  const handleQuestionImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || targetQuestionUploadIdx === null || !user) return;
    const targetIdx = targetQuestionUploadIdx;
    try {
      validateFile(file);
      if (!file.type.startsWith("image/")) {
        toast.error("Please upload an image diagram (JPEG, PNG, WebP)");
        return;
      }
      setUploadingQuestionIdx(targetIdx);
      const uploaded = await uploadQuizImage(quizId, file, user.id, (info) => {
        setQuestionUploadProgress({
          state: info.state,
          progressPercent: info.progressPercent,
          fileName: info.fileName,
          originalSize: info.originalSize,
          compressedSize: info.compressedSize,
          savingsLabel: info.savingsLabel,
          error: info.state === "error" ? info.message : undefined,
        });
      });
      updateQuestion(targetIdx, { imageUrl: uploaded.url });
      toast.success("Question diagram uploaded and compressed!");
    } catch (err: any) {
      toast.error(err.message || "Failed to upload question diagram");
    } finally {
      setTimeout(() => {
        setUploadingQuestionIdx(null);
        setQuestionUploadProgress(null);
      }, 2000);
      e.target.value = "";
      setTargetQuestionUploadIdx(null);
    }
  };

  const generateFn = useServerFn(generateQuizQuestions);

  const quizQuery = useQuery({
    queryKey: ["quiz-edit", quizId],
    queryFn: async () => {
      const res = await getQuiz(quizId, true);
      if (!res) throw new Error("Quiz not found");
      return res;
    },
  });

  const classQuery = useQuery({
    queryKey: ["quiz-class", quizQuery.data?.quiz.classId],
    enabled: Boolean(quizQuery.data?.quiz.classId),
    queryFn: async () => {
      if (!quizQuery.data?.quiz.classId) return null;
      return await getClass(quizQuery.data.quiz.classId);
    },
  });

  const attemptsQuery = useQuery({
    queryKey: ["quiz-attempts", quizId],
    queryFn: async () => {
      return await getSubmissionsByRef(quizId);
    },
  });

  useEffect(() => {
    if (quizQuery.data) {
      const { quiz, answerKey } = quizQuery.data;
      setTitle(quiz.title || "");
      setKind(quiz.kind || "practice");
      setTimeLimit(String(quiz.timeLimit || 20));
      setScheduledStart(quiz.scheduledStart || "");
      setScheduledEnd(quiz.scheduledEnd || "");
      setLockdown(quiz.kind === "exam" || Boolean(quiz.lockdown));

      const rawAnswers = answerKey?.answers || {};
      const converted: QuestionItem[] = (quiz.questions || []).map((q, idx) => {
        const rawType = q.type as string;
        const mappedType: QuestionItem["type"] =
          rawType === "single_choice"
            ? "mcq"
            : rawType === "multiple_choice"
              ? "multi_select"
              : rawType === "math_equation"
                ? "short_answer"
                : "mcq";

        const correctVal = rawAnswers[q.id] || (q.options && q.options[0]) || "";
        const correctArray = Array.isArray(correctVal)
          ? correctVal.map(String)
          : [String(correctVal)];

        return {
          id: q.id || `q_${Date.now()}_${idx}`,
          type: mappedType,
          difficulty: "easy",
          prompt: q.text || "",
          options:
            q.options ||
            (mappedType === "mcq" || mappedType === "multi_select" ? ["", "", "", ""] : []),
          correct: correctArray.filter(Boolean),
          explanation: (q as any).explanation || "",
          points: q.points || 1,
          imageUrl: q.imageUrl,
        };
      });

      setQuestions(converted);
    }
  }, [quizQuery.data]);

  const totalMarks = questions.reduce((sum, q) => sum + (Number(q.points) || 1), 0);

  const addBlankQuestion = () => {
    const newQ: QuestionItem = {
      id: `q_${Date.now()}`,
      type: "mcq",
      difficulty: "easy",
      prompt: "",
      options: ["", "", "", ""],
      correct: [],
      explanation: "",
      points: 1,
    };
    setQuestions((prev) => [...prev, newQ]);
  };

  const removeQuestion = (index: number) => {
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  };

  const moveQuestion = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= questions.length) return;
    setQuestions((prev) => {
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      if (moved) next.splice(target, 0, moved);
      return next;
    });
  };

  const updateQuestion = (index: number, patch: Partial<QuestionItem>) => {
    setQuestions((prev) => {
      const next = [...prev];
      if (next[index]) {
        next[index] = { ...next[index], ...patch };
      }
      return next;
    });
  };

  const toggleTypeCheckbox = (t: string) => {
    setAiTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setReadingFiles(true);
    let addedText = "";
    for (const file of Array.from(files)) {
      try {
        validateFile(file);
        const text = await extractMaterial(file);
        if (text) {
          addedText += `\n\n--- ${file.name} ---\n${text}`;
        }
      } catch (err: any) {
        toast.error(err.message || `Could not parse ${file.name}`);
      }
    }
    setReadingFiles(false);
    if (addedText) {
      setStudyMaterial((prev) => (prev + addedText).trim());
      toast.success("File content extracted to study material!");
    }
    // No ID on the input, but we can clear it via the event if we passed it,
    // or just leave it for now as it's less critical here than in multi-step flows.
  };

  const generateAiQuestionsMutation = useMutation({
    mutationFn: async () => {
      if (!studyMaterial.trim() && !aiTopic.trim()) {
        throw new Error("Please provide study material or a topic focus.");
      }
      const res = await generateFn({
        data: {
          material: studyMaterial.trim() || `Topic: ${aiTopic}`,
          count: typeof aiCount === "string" ? parseInt(aiCount, 10) || 5 : aiCount,
          difficulty: aiDifficulty,
          types: aiTypes,
          withExplanations,
          topic: aiTopic.trim() || undefined,
        },
      });
      return res.questions;
    },
    onSuccess: (newQs) => {
      const formatted: QuestionItem[] = newQs.map((q, idx) => ({
        id: `q_ai_${Date.now()}_${idx}`,
        type: q.type as any,
        difficulty: (q.difficulty as any) || "easy",
        prompt: q.prompt,
        options: q.options || [],
        correct: q.correct || [],
        explanation: q.explanation || "",
        points: q.points || 1,
      }));

      setReviewingGenerated(formatted);
      setSelectedReviewIds(new Set(formatted.map((q) => q.id)));
      toast.success(`AI generated ${formatted.length} questions for review!`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const confirmGeneratedQuestions = () => {
    if (!reviewQuestions) return;
    const selected = reviewQuestions.filter((q) => selectedReviewIds.has(q.id));
    setQuestions((prev) => [...prev, ...selected]);
    toast.success(`Added ${selected.length} questions to the quiz!`);
    setReviewingGenerated(null);
    setActiveTab("questions");
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("Quiz title is required");

      const rawQuestions = questions.map(formatTypeToQuizQuestion);
      const answerKeyObj: Record<string, string | number> = {};
      questions.forEach((q) => {
        answerKeyObj[q.id] = q.correct[0] || (q.options && q.options[0]) || "";
      });

      await updateQuiz(
        quizId,
        {
          title: title.trim(),
          kind,
          timeLimit: kind === "practice" ? 0 : parseInt(timeLimit, 10) || 20,
          scheduledStart: kind === "scheduled" || kind === "exam" ? scheduledStart || null : null,
          scheduledEnd: kind === "scheduled" || kind === "exam" ? scheduledEnd || null : null,
          lockdown: kind === "exam" || lockdown,
          questions: rawQuestions,
        },
        answerKeyObj,
      );
    },
    onSuccess: () => {
      toast.success("Quiz saved successfully!");
      void qc.invalidateQueries({ queryKey: ["quiz-edit", quizId] });
      void qc.invalidateQueries({ queryKey: ["quiz", quizId] });
      void qc.invalidateQueries({ queryKey: ["all-quizzes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteQuizMutation = useMutation({
    mutationFn: async () => {
      await deleteQuiz(quizId);
    },
    onSuccess: () => {
      toast.success("Quiz deleted");
      void qc.invalidateQueries({ queryKey: ["all-quizzes"] });
      void navigate({ to: "/quizzes" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (quizQuery.isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (quizQuery.isError) {
    return (
      <div className="panel p-8 text-center text-sm">
        <p className="text-destructive font-semibold">Couldn't load quiz</p>
        <Button asChild size="sm" variant="outline" className="mt-4">
          <Link to="/quizzes">Back to Quizzes</Link>
        </Button>
      </div>
    );
  }

  const className = classQuery.data?.name || "Class";
  const wordCount = studyMaterial.trim() ? studyMaterial.trim().split(/\s+/).length : 0;

  return (
    <div className="space-y-6">
      {/* Back Navigation */}
      <div>
        <Link
          to="/quizzes"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-3.5" /> Quizzes
        </Link>
      </div>

      {/* Header matching Screenshot 3 */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {title || "Untitled Quiz"}
          </h1>
          <div className="flex flex-wrap items-center gap-2 mt-1 font-medium text-xs">
            <span className="text-muted-foreground">
              {className} · {questions.length} question{questions.length === 1 ? "" : "s"} ·{" "}
              {totalMarks} mark{totalMarks === 1 ? "" : "s"}
            </span>
            <span className="text-muted-foreground">•</span>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                kind === "exam"
                  ? "border-destructive/30 bg-destructive/10 text-destructive"
                  : kind === "scheduled"
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    : kind === "timed"
                      ? "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400"
                      : "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              }`}
            >
              {kind === "exam" && <ShieldAlert className="size-3" />}
              {kind === "scheduled" && <Calendar className="size-3" />}
              {kind === "timed" && <Timer className="size-3" />}
              {kind === "practice" && <CheckCircle2 className="size-3" />}
              {kind === "exam"
                ? "Final Exam (Locked Proctored)"
                : kind === "scheduled"
                  ? "Scheduled Quiz"
                  : kind === "timed"
                    ? "Timed Quiz"
                    : "Practice Quiz"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="text-xs">
            <Link to="/quizzes/$quizId/analytics" params={{ quizId }}>
              Overview
            </Link>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setPublished((p) => !p);
              toast.success(published ? "Quiz set to unpublish" : "Quiz set to published");
            }}
            className="text-xs"
          >
            {published ? "Unpublish" : "Publish"}
          </Button>

          <Button
            size="sm"
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="gap-1.5 bg-primary text-primary-foreground font-medium"
          >
            {save.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Save
          </Button>
        </div>
      </header>

      {/* Subtabs matching Screenshot 3 & 4 */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-card/70 border border-border/80 p-1 flex flex-wrap h-auto gap-1">
          <TabsTrigger value="questions" className="rounded-md text-xs font-medium">
            Questions ({questions.length})
          </TabsTrigger>
          <TabsTrigger value="attempts" className="rounded-md text-xs font-medium">
            Attempts
          </TabsTrigger>
          <TabsTrigger value="ai_generator" className="rounded-md text-xs font-medium">
            AI generator
          </TabsTrigger>
          <TabsTrigger value="settings" className="rounded-md text-xs font-medium">
            Settings
          </TabsTrigger>
        </TabsList>

        {/* QUESTIONS TAB matching Screenshot 3 */}
        <TabsContent value="questions" className="space-y-4">
          <div className="space-y-4">
            {questions.length === 0 ? (
              <div className="panel p-12 text-center border-dashed space-y-3 rounded-xl bg-card">
                <div className="size-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
                  <Plus className="size-6" />
                </div>
                <h3 className="text-base font-semibold text-foreground">No questions added yet</h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Start fresh by adding your first blank question manually or generate assessment
                  questions using AI from your study notes.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                  <Button size="sm" onClick={addBlankQuestion} className="gap-1.5 text-xs">
                    <Plus className="size-4" /> Add Blank Question
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setActiveTab("ai_generator")}
                    className="gap-1.5 text-xs text-amber-600 dark:text-amber-400 border-amber-500/30"
                  >
                    <Sparkles className="size-4" /> Generate with AI
                  </Button>
                </div>
              </div>
            ) : (
              questions.map((q, idx) => (
                <div
                  key={q.id || idx}
                  className="panel p-5 bg-card border-border/90 space-y-4 rounded-xl shadow-xs"
                >
                  {/* Header Row: Number, Type, Difficulty, Marks, Actions */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-secondary font-bold text-xs">
                      {idx + 1}
                    </span>

                    <Select
                      value={q.type}
                      onValueChange={(val: QuestionItem["type"]) => {
                        let opts = q.options;
                        if (val === "true_false") opts = ["True", "False"];
                        if ((val === "mcq" || val === "multi_select") && opts.length < 2) {
                          opts = ["Option 1", "Option 2", "Option 3", "Option 4"];
                        }
                        updateQuestion(idx, { type: val, options: opts, correct: [opts[0] || ""] });
                      }}
                    >
                      <SelectTrigger className="h-8 w-[9.5rem] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mcq">Multiple choice</SelectItem>
                        <SelectItem value="multi_select">Multiple correct</SelectItem>
                        <SelectItem value="true_false">True / False</SelectItem>
                        <SelectItem value="fill_blank">Fill in the blank</SelectItem>
                        <SelectItem value="short_answer">Short answer</SelectItem>
                        <SelectItem value="essay">Essay</SelectItem>
                      </SelectContent>
                    </Select>

                    <Select
                      value={q.difficulty}
                      onValueChange={(val: "easy" | "medium" | "hard") =>
                        updateQuestion(idx, { difficulty: val })
                      }
                    >
                      <SelectTrigger className="h-8 w-[7rem] text-xs capitalize">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="easy">Easy</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="hard">Hard</SelectItem>
                      </SelectContent>
                    </Select>

                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground font-medium">Marks</span>
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        value={q.points}
                        onChange={(e) =>
                          updateQuestion(idx, { points: Number(e.target.value) || 1 })
                        }
                        className="h-8 w-16 text-xs text-center"
                      />
                    </div>

                    <div className="ml-auto flex items-center gap-1 text-muted-foreground">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 hover:text-foreground"
                        title="Move up"
                        onClick={() => moveQuestion(idx, -1)}
                        disabled={idx === 0}
                      >
                        <ArrowUp className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 hover:text-foreground"
                        title="Move down"
                        onClick={() => moveQuestion(idx, 1)}
                        disabled={idx === questions.length - 1}
                      >
                        <ArrowDown className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 hover:text-foreground"
                        title="Insert math formula"
                        onClick={() => setMathHelperOpen(mathHelperOpen === idx ? null : idx)}
                      >
                        <Sigma className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 hover:text-foreground"
                        title="Attach diagram image"
                        onClick={() => {
                          setTargetQuestionUploadIdx(idx);
                          questionFileInputRef.current?.click();
                        }}
                        disabled={uploadingQuestionIdx === idx}
                      >
                        <ImagePlus className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-destructive hover:bg-destructive/10"
                        title="Delete question"
                        onClick={() => removeQuestion(idx)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Math helper drawer if open */}
                  {mathHelperOpen === idx && (
                    <div className="p-3 bg-secondary/30 rounded-lg border border-border/80 space-y-2">
                      <p className="text-xs font-semibold text-foreground">LaTeX Math Helper</p>
                      <MathEditor value={mathFormula} onChange={setMathFormula} />
                      <div className="flex gap-2 pt-1">
                        <Button
                          size="sm"
                          type="button"
                          onClick={() => {
                            if (mathFormula.trim()) {
                              updateQuestion(idx, {
                                prompt: `${q.prompt} $${mathFormula.trim()}$`,
                              });
                              setMathFormula("");
                              setMathHelperOpen(null);
                              toast.success("Formula inserted into question prompt!");
                            }
                          }}
                        >
                          Insert Formula
                        </Button>
                        <Button
                          size="sm"
                          type="button"
                          variant="ghost"
                          onClick={() => setMathHelperOpen(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Question Prompt */}
                  <div className="w-full min-w-0 space-y-1.5">
                    <Textarea
                      autoResize
                      value={q.prompt}
                      onChange={(e) => updateQuestion(idx, { prompt: e.target.value })}
                      placeholder="Enter question text or formula here..."
                      className="bg-card text-sm w-full leading-relaxed break-words"
                    />
                    {q.prompt.includes("$") && (
                      <div className="p-3 bg-secondary/30 rounded-lg border border-border/70 text-sm overflow-visible">
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                          Math Preview
                        </span>
                        <RenderMathText text={q.prompt} />
                      </div>
                    )}

                    {uploadingQuestionIdx === idx && (
                      <UploadProgressBar info={questionUploadProgress} className="my-2" />
                    )}

                    {q.imageUrl && (
                      <div className="relative my-2 inline-flex items-center gap-3 rounded-lg border border-border/80 bg-secondary/30 p-2">
                        <img
                          src={q.imageUrl}
                          alt="Question diagram"
                          className="h-20 w-auto rounded object-contain border border-border bg-card"
                        />
                        <div className="text-xs space-y-1">
                          <p className="font-semibold text-foreground">Attached Diagram</p>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() => updateQuestion(idx, { imageUrl: undefined })}
                          >
                            <Trash2 className="size-3" /> Remove diagram
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Question Options */}
                  {(q.type === "mcq" || q.type === "multi_select" || q.type === "true_false") && (
                    <div className="space-y-2">
                      {q.options.map((opt, optIdx) => {
                        const isChecked = q.correct.includes(opt);
                        return (
                          <div
                            key={optIdx}
                            className="flex items-center gap-3 p-2 rounded-lg border border-border/70 bg-secondary/20 hover:bg-secondary/40 transition-colors"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                if (q.type === "multi_select") {
                                  const nextCorrect = isChecked
                                    ? q.correct.filter((c) => c !== opt)
                                    : [...q.correct, opt];
                                  updateQuestion(idx, { correct: nextCorrect });
                                } else {
                                  updateQuestion(idx, { correct: [opt] });
                                }
                              }}
                              className={`size-5 rounded-full border flex items-center justify-center transition-all cursor-pointer ${
                                isChecked
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-muted-foreground/40 bg-transparent"
                              }`}
                            >
                              {isChecked && <Check className="size-3 stroke-[3]" />}
                            </button>

                            <Input
                              value={opt}
                              readOnly={q.type === "true_false"}
                              onChange={(e) => {
                                const newOpts = [...q.options];
                                newOpts[optIdx] = e.target.value;
                                const newCorrect = isChecked
                                  ? q.correct.map((c) => (c === opt ? e.target.value : c))
                                  : q.correct;
                                updateQuestion(idx, { options: newOpts, correct: newCorrect });
                              }}
                              placeholder={`Option ${optIdx + 1}`}
                              className="h-8 flex-1 bg-transparent border-none focus-visible:ring-0 px-1 text-sm font-medium"
                            />

                            {q.type !== "true_false" && q.options.length > 2 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-7 text-muted-foreground hover:text-destructive"
                                onClick={() => {
                                  const newOpts = q.options.filter((_, i) => i !== optIdx);
                                  const newCorrect = q.correct.filter((c) => c !== opt);
                                  updateQuestion(idx, { options: newOpts, correct: newCorrect });
                                }}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            )}
                          </div>
                        );
                      })}

                      {q.type !== "true_false" && q.options.length < 6 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            updateQuestion(idx, {
                              options: [...q.options, `Option ${q.options.length + 1}`],
                            })
                          }
                          className="text-xs mt-1"
                        >
                          Add option
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Explanation text matching screenshot 3 */}
                  <div className="space-y-1.5 pt-2">
                    <Label className="text-xs text-muted-foreground">
                      Explanation (shown after grading)
                    </Label>
                    <Textarea
                      autoResize
                      value={q.explanation}
                      onChange={(e) => updateQuestion(idx, { explanation: e.target.value })}
                      placeholder="Optional explanation for students after grading..."
                      className="bg-card text-xs overflow-hidden"
                    />
                  </div>
                </div>
              ))
            )}
            <input
              ref={questionFileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleQuestionImageUpload}
            />
          </div>

          <div className="pt-2 flex justify-between items-center pb-12">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={addBlankQuestion} className="gap-1.5">
                <Plus className="size-4" /> Add Question
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBankOpen(true)}
                className="gap-1.5"
              >
                <BookOpen className="size-4" /> Import from Bank
              </Button>
            </div>

            <Button
              size="sm"
              onClick={() => save.mutate()}
              disabled={save.isPending || uploadingQuestionIdx !== null}
              className="gap-1.5 bg-primary text-primary-foreground font-medium"
            >
              {save.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Save All Changes
            </Button>
          </div>
        </TabsContent>

        {/* AI GENERATOR TAB matching Screenshot 4 */}
        <TabsContent value="ai_generator" className="space-y-5">
          <div className="panel p-6 bg-card border-border space-y-5 rounded-xl">
            {/* File Dropzone */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void handleFileUpload(e.dataTransfer.files);
              }}
              className="rounded-xl border-2 border-dashed border-border/80 bg-secondary/10 p-8 text-center flex flex-col items-center justify-center space-y-2"
            >
              <FileUp className="size-8 text-muted-foreground mb-1" />
              <p className="text-sm font-semibold text-foreground">Drop notes here or upload</p>
              <p className="text-xs text-muted-foreground">
                PDF, DOCX, PPTX or TXT — up to 20 MB each
              </p>
              <label className="mt-2 inline-flex items-center justify-center px-4 py-1.5 rounded-lg border border-border bg-card text-xs font-semibold hover:bg-secondary cursor-pointer transition-colors">
                <span>{readingFiles ? "Reading files..." : "Choose files"}</span>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.docx,.pptx,.txt"
                  className="hidden"
                  onChange={(e) => void handleFileUpload(e.target.files)}
                />
              </label>
            </div>

            {/* Study material textarea */}
            <div className="space-y-1.5">
              <Label htmlFor="studyMaterial">Study material</Label>
              <Textarea
                id="studyMaterial"
                rows={5}
                value={studyMaterial}
                onChange={(e) => setStudyMaterial(e.target.value)}
                placeholder="Paste the chapter, notes or syllabus text the questions should come from."
                className="bg-card text-sm"
              />
              <p className="text-xs text-muted-foreground">{wordCount} words</p>
            </div>

            {/* Row: Questions, Difficulty, Topic focus */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="qCountInput" className="text-xs font-semibold">
                  Number of questions (1-30)
                </Label>
                <Input
                  id="qCountInput"
                  type="number"
                  placeholder="e.g. 10"
                  value={aiCount}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "") {
                      setAiCount("");
                    } else {
                      const num = parseInt(val, 10);
                      if (!isNaN(num)) setAiCount(num);
                    }
                  }}
                  className="bg-card text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Difficulty</Label>
                <Select
                  value={aiDifficulty}
                  onValueChange={(v: "easy" | "medium" | "hard" | "mixed") => setAiDifficulty(v)}
                >
                  <SelectTrigger className="capitalize">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mixed">Mixed</SelectItem>
                    <SelectItem value="easy">Easy</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="hard">Hard</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="topicFocus">Topic focus (optional)</Label>
                <Input
                  id="topicFocus"
                  value={aiTopic}
                  onChange={(e) => setAiTopic(e.target.value)}
                  placeholder="Photosynthesis"
                />
              </div>
            </div>

            {/* Question types checkboxes */}
            <div className="space-y-2 pt-2">
              <Label className="text-xs font-semibold">Question types</Label>
              <div className="flex flex-wrap items-center gap-4 text-xs font-medium">
                {[
                  { id: "mcq", label: "Multiple choice" },
                  { id: "multi_select", label: "Multiple correct" },
                  { id: "true_false", label: "True / False" },
                  { id: "fill_blank", label: "Fill in the blank" },
                  { id: "short_answer", label: "Short answer" },
                  { id: "essay", label: "Essay" },
                ].map((item) => (
                  <label key={item.id} className="flex items-center gap-1.5 cursor-pointer">
                    <Checkbox
                      checked={aiTypes.includes(item.id)}
                      onCheckedChange={() => toggleTypeCheckbox(item.id)}
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Include answer explanations checkbox */}
            <div className="pt-1">
              <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                <Checkbox
                  checked={withExplanations}
                  onCheckedChange={(c) => setWithExplanations(Boolean(c))}
                />
                <span>Include answer explanations</span>
              </label>
            </div>

            {/* Full width Amber / Gold Generate Button */}
            <Button
              onClick={() => generateAiQuestionsMutation.mutate()}
              disabled={
                generateAiQuestionsMutation.isPending || (!studyMaterial.trim() && !aiTopic.trim())
              }
              className="w-full py-6 text-sm font-semibold bg-amber-600 hover:bg-amber-700 text-white shadow-md cursor-pointer"
            >
              {generateAiQuestionsMutation.isPending ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" />
                  <span>Generating assessment questions with Gemini...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4" />
                  <span>Generate {aiCount} questions</span>
                </div>
              )}
            </Button>
          </div>
        </TabsContent>

        {/* ATTEMPTS TAB */}
        <TabsContent value="attempts" className="space-y-4">
          {attemptsQuery.isLoading ? (
            <Skeleton className="h-40 w-full rounded-xl" />
          ) : (attemptsQuery.data || []).length === 0 ? (
            <div className="panel p-8 text-center border-dashed">
              <p className="text-sm font-semibold text-foreground">
                No student attempts recorded yet.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                When enrolled students take this quiz, their submissions and scores will appear
                here.
              </p>
            </div>
          ) : (
            <div className="panel divide-y divide-border bg-card">
              {(attemptsQuery.data || []).map((att) => (
                <div key={att.id} className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {att.studentName || "Student"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Submitted on {new Date(att.submittedAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-bold text-primary">
                      {att.score != null ? `${att.score} pts` : "Pending grade"}
                    </span>
                    <Button asChild variant="outline" size="sm">
                      <Link
                        to="/grading/quiz/$quizId"
                        params={{ quizId }}
                        search={{ s: undefined }}
                      >
                        Review
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* SETTINGS TAB */}
        <TabsContent value="settings" className="space-y-4">
          <div className="panel p-6 bg-card border-border space-y-5 max-w-xl">
            <div className="space-y-1.5">
              <Label htmlFor="settingsTitle">Quiz Title</Label>
              <Input id="settingsTitle" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="settingsKind">Quiz Type</Label>
              <Select
                value={kind}
                onValueChange={(val: QuizKind) => {
                  setKind(val);
                  if (val === "exam") setLockdown(true);
                }}
              >
                <SelectTrigger id="settingsKind" className="bg-card">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="practice">
                    🎯 Practice Quiz (Self-paced, unlimited review)
                  </SelectItem>
                  <SelectItem value="timed">⏱️ Timed Quiz (Enforced timer countdown)</SelectItem>
                  <SelectItem value="scheduled">
                    📅 Scheduled Quiz (Time window start & end)
                  </SelectItem>
                  <SelectItem value="exam">
                    🛡️ Final Exam (Strict anti-cheat proctoring & tab-lockout)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(kind === "timed" || kind === "exam" || kind === "scheduled") && (
              <div className="space-y-1.5">
                <Label htmlFor="settingsTimeLimit">Time Limit (minutes)</Label>
                <Input
                  id="settingsTimeLimit"
                  type="number"
                  min={1}
                  max={300}
                  value={timeLimit}
                  onChange={(e) => setTimeLimit(e.target.value)}
                  className="bg-card"
                />
              </div>
            )}

            {(kind === "scheduled" || kind === "exam") && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="scheduledStart" className="text-xs">
                    Start Window
                  </Label>
                  <Input
                    id="scheduledStart"
                    type="datetime-local"
                    value={scheduledStart}
                    onChange={(e) => setScheduledStart(e.target.value)}
                    className="bg-card text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="scheduledEnd" className="text-xs">
                    End Window
                  </Label>
                  <Input
                    id="scheduledEnd"
                    type="datetime-local"
                    value={scheduledEnd}
                    onChange={(e) => setScheduledEnd(e.target.value)}
                    className="bg-card text-xs"
                  />
                </div>
              </div>
            )}

            {kind === "exam" && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3.5 space-y-1.5 text-xs text-foreground">
                <div className="flex items-center gap-1.5 font-bold text-destructive">
                  <ShieldAlert className="size-4" /> Final Exam Lockdown Active
                </div>
                <p className="text-muted-foreground leading-relaxed">
                  When a student takes this exam, switching tabs, minimizing the browser window, or
                  losing window focus is detected immediately. The exam will instantly lock the
                  student out, submit their attempt, and record the violation for teacher review.
                </p>
              </div>
            )}

            <div className="pt-4 border-t flex justify-between items-center">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (confirm("Are you sure you want to delete this quiz?")) {
                    deleteQuizMutation.mutate();
                  }
                }}
                disabled={deleteQuizMutation.isPending}
              >
                <Trash2 className="size-4 mr-1.5" /> Delete Quiz
              </Button>

              <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? <Loader2 className="size-4 animate-spin mr-1.5" /> : null}
                Save Settings
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
      <GeneratedQuestionsReviewDialog
        questions={reviewQuestions || []}
        selectedIds={selectedReviewIds}
        onToggle={(id) => {
          const next = new Set(selectedReviewIds);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          setSelectedReviewIds(next);
        }}
        onSelectAll={() => setSelectedReviewIds(new Set(reviewQuestions?.map((q) => q.id)))}
        onDeselectAll={() => setSelectedReviewIds(new Set())}
        onConfirm={confirmGeneratedQuestions}
        onCancel={() => setReviewingGenerated(null)}
      />

      <QuestionBankImportDialog
        open={bankOpen}
        onOpenChange={setBankOpen}
        userId={user?.id || ""}
        selectedIds={selectedBankIds}
        onToggle={(id) => {
          const next = new Set(selectedBankIds);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          setSelectedBankIds(next);
        }}
        onConfirm={(selectedQuestions) => {
          setQuestions((prev) => [...prev, ...selectedQuestions]);
          setBankOpen(false);
          setSelectedBankIds(new Set());
          toast.success(`Imported ${selectedQuestions.length} questions from bank!`);
        }}
      />
    </div>
  );
}

// Question Bank Import Dialog
function QuestionBankImportDialog({
  open,
  onOpenChange,
  userId,
  selectedIds,
  onToggle,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onConfirm: (questions: QuestionItem[]) => void;
}) {
  const bankQuery = useQuery({
    queryKey: ["question-bank-import", userId],
    enabled: open && Boolean(userId),
    queryFn: async () => {
      const snap = await getDocs(
        query(collection(db, "question_bank"), where("owner_id", "==", userId)),
      );
      return snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
    },
  });

  const handleConfirm = () => {
    const selected = (bankQuery.data || [])
      .filter((q) => selectedIds.has(q.id))
      .map((q) => ({
        id: `q_bank_${Date.now()}_${q.id}`,
        type: q.type,
        difficulty: q.difficulty,
        prompt: q.prompt,
        options: q.options || [],
        correct: q.correct || [],
        explanation: q.explanation || "",
        points: q.points || 1,
      }));
    onConfirm(selected);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import from Question Bank</DialogTitle>
          <DialogDescription>
            Select questions from your repository to add to this quiz.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {bankQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : (bankQuery.data || []).length === 0 ? (
            <div className="panel p-8 text-center border-dashed">
              <p className="text-sm text-muted-foreground">Your question bank is empty.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {bankQuery.data?.map((q) => (
                <div
                  key={q.id}
                  className={`p-4 rounded-xl border transition-all cursor-pointer ${
                    selectedIds.has(q.id)
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                      : "border-border bg-card hover:bg-secondary/20"
                  }`}
                  onClick={() => onToggle(q.id)}
                >
                  <div className="flex items-start gap-3">
                    <div className="pt-1">
                      <div
                        className={`size-4 rounded-md border flex items-center justify-center transition-all ${
                          selectedIds.has(q.id)
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted-foreground/30 bg-background"
                        }`}
                      >
                        {selectedIds.has(q.id) && <CheckSquare className="size-3" />}
                      </div>
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          {q.type.replace("_", " ")} · {q.difficulty}
                        </span>
                        <span className="text-[10px] font-bold text-primary">{q.points} pts</span>
                      </div>
                      <p className="text-sm font-medium leading-relaxed">
                        <RenderMathText text={q.prompt} />
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="bg-card border-t pt-4 sticky bottom-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={selectedIds.size === 0} className="gap-2">
            Import {selectedIds.size} Questions
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Manual Selection Review Dialog
function GeneratedQuestionsReviewDialog({
  questions,
  selectedIds,
  onToggle,
  onSelectAll,
  onDeselectAll,
  onConfirm,
  onCancel,
}: {
  questions: QuestionItem[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={questions.length > 0} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review Generated Questions</DialogTitle>
          <DialogDescription>
            AI has generated these questions. Manually select which ones you want to include in your
            quiz.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-center justify-between border-b pb-2">
            <span className="text-xs font-semibold text-muted-foreground">
              {selectedIds.size} of {questions?.length} selected
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={onSelectAll}>
                Select All
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={onDeselectAll}>
                Deselect All
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {questions?.map((q) => (
              <div
                key={q.id}
                className={`p-4 rounded-xl border transition-all cursor-pointer ${
                  selectedIds.has(q.id)
                    ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                    : "border-border bg-card opacity-60 grayscale-[0.5]"
                }`}
                onClick={() => onToggle(q.id)}
              >
                <div className="flex items-start gap-3">
                  <div className="pt-1">
                    <div
                      className={`size-4 rounded-md border flex items-center justify-center transition-all ${
                        selectedIds.has(q.id)
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/30 bg-background"
                      }`}
                    >
                      {selectedIds.has(q.id) && <CheckSquare className="size-3" />}
                    </div>
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        {q.type.replace("_", " ")} · {q.difficulty}
                      </span>
                      <span className="text-[10px] font-bold text-primary">{q.points} pts</span>
                    </div>
                    <p className="text-sm font-medium leading-relaxed">
                      <RenderMathText text={q.prompt} />
                    </p>
                    {q.options.length > 0 && (
                      <div className="grid grid-cols-2 gap-1.5 pt-1">
                        {q.options.map((opt, i) => (
                          <div
                            key={i}
                            className="text-[11px] bg-secondary/30 px-2 py-1 rounded border border-border/50 truncate"
                          >
                            <RenderMathText text={opt} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="bg-card border-t pt-4 sticky bottom-0">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={selectedIds.size === 0} className="gap-2">
            Add {selectedIds.size} Selected Questions
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
