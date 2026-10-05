import { ArrowDown, ArrowUp, Library, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DIFFICULTIES,
  QUESTION_TYPES,
  isAutoGraded,
  type Difficulty,
  type QuestionDraft,
  type QuestionType,
} from "@/lib/quiz/types";

type Props = {
  index: number;
  question: QuestionDraft;
  onChange: (q: QuestionDraft) => void;
  onDelete: () => void;
  onMove?: (dir: -1 | 1) => void;
  onRegenerate?: () => void;
  onSaveToBank?: () => void;
  regenerating?: boolean;
  saving?: boolean;
};

/** Editable card for one question — used by the builder and the question bank. */
export function QuestionEditor({
  index,
  question,
  onChange,
  onDelete,
  onMove,
  onRegenerate,
  onSaveToBank,
  regenerating,
  saving,
}: Props) {
  const q = question;
  const set = (patch: Partial<QuestionDraft>) => onChange({ ...q, ...patch });

  function changeType(type: QuestionType) {
    if (type === "true_false") {
      set({ type, options: ["True", "False"], correct: ["True"] });
    } else if (type === "mcq" || type === "multi_select") {
      set({ type, options: q.options.length >= 2 ? q.options : ["", "", "", ""], correct: [] });
    } else {
      set({ type, options: [], correct: type === "essay" ? [] : q.correct });
    }
  }

  function setOption(i: number, value: string) {
    const prev = q.options[i] ?? "";
    const options = q.options.map((o, j) => (j === i ? value : o));
    set({ options, correct: q.correct.map((c) => (c === prev ? value : c)) });
  }

  function toggleCorrect(value: string) {
    if (!value) return;
    if (q.type === "multi_select") {
      set({
        correct: q.correct.includes(value)
          ? q.correct.filter((c) => c !== value)
          : [...q.correct, value],
      });
    } else {
      set({ correct: [value] });
    }
  }

  const choice = q.type === "mcq" || q.type === "multi_select" || q.type === "true_false";

  return (
    <div className="panel space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold">
          {index + 1}
        </span>

        <Select value={q.type} onValueChange={(v) => changeType(v as QuestionType)}>
          <SelectTrigger className="h-8 w-[11rem]" aria-label="Question type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {QUESTION_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={q.difficulty} onValueChange={(v) => set({ difficulty: v as Difficulty })}>
          <SelectTrigger className="h-8 w-[7.5rem] capitalize" aria-label="Difficulty">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DIFFICULTIES.map((d) => (
              <SelectItem key={d} value={d} className="capitalize">
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1.5">
          <Label htmlFor={`pts-${q.id}`} className="text-xs text-muted-foreground">
            Marks
          </Label>
          <Input
            id={`pts-${q.id}`}
            type="number"
            min={0}
            step={0.5}
            value={q.points}
            onChange={(e) => set({ points: Number(e.target.value) || 0 })}
            className="h-8 w-20"
          />
        </div>

        <div className="ml-auto flex gap-1">
          {onMove && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label="Move up"
                onClick={() => onMove(-1)}
              >
                <ArrowUp className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label="Move down"
                onClick={() => onMove(1)}
              >
                <ArrowDown className="size-4" />
              </Button>
            </>
          )}
          {onRegenerate && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label="Regenerate question"
              disabled={regenerating}
              onClick={onRegenerate}
            >
              <RefreshCw className={regenerating ? "size-4 animate-spin" : "size-4"} />
            </Button>
          )}
          {onSaveToBank && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label="Save to question bank"
              disabled={saving}
              onClick={onSaveToBank}
            >
              <Library className="size-4" />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Delete question"
            onClick={onDelete}
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>
      </div>

      <Textarea
        value={q.prompt}
        onChange={(e) => set({ prompt: e.target.value })}
        placeholder={
          q.type === "fill_blank"
            ? "Water boils at ____ °C at sea level."
            : "Write the question here"
        }
        className="min-h-20"
      />

      {choice && (
        <div className="space-y-2">
          {q.options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <Checkbox
                checked={q.correct.includes(opt) && opt !== ""}
                onCheckedChange={() => toggleCorrect(opt)}
                aria-label={`Mark option ${i + 1} correct`}
              />
              <Input
                value={opt}
                readOnly={q.type === "true_false"}
                onChange={(e) => setOption(i, e.target.value)}
                placeholder={`Option ${i + 1}`}
              />
              {q.type !== "true_false" && q.options.length > 2 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  aria-label={`Remove option ${i + 1}`}
                  onClick={() =>
                    set({
                      options: q.options.filter((_, j) => j !== i),
                      correct: q.correct.filter((c) => c !== opt),
                    })
                  }
                >
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </div>
          ))}
          {q.type !== "true_false" && q.options.length < 6 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => set({ options: [...q.options, ""] })}
            >
              Add option
            </Button>
          )}
        </div>
      )}

      {(q.type === "fill_blank" || q.type === "short_answer") && (
        <div className="space-y-1.5">
          <Label htmlFor={`key-${q.id}`}>Accepted answers (comma separated)</Label>
          <Input
            id={`key-${q.id}`}
            value={q.correct.join(", ")}
            onChange={(e) =>
              set({
                correct: e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
            placeholder="100, one hundred"
          />
        </div>
      )}

      {!isAutoGraded(q.type) && (
        <p className="text-xs text-muted-foreground">
          {q.type === "essay"
            ? "Essays are always graded manually."
            : "Graded automatically when accepted answers are set, otherwise manually."}
        </p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor={`exp-${q.id}`}>Explanation (shown after grading)</Label>
        <Textarea
          id={`exp-${q.id}`}
          value={q.explanation}
          onChange={(e) => set({ explanation: e.target.value })}
          className="min-h-16"
        />
      </div>
    </div>
  );
}
