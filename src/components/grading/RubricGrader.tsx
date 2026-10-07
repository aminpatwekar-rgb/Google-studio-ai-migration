import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { type RubricCriterion, type RubricLevel } from "@/lib/rubrics.functions";

export function RubricGrader({
  submissionId,
  rubricId,
  onTotalChange,
}: {
  submissionId: string;
  rubricId: string;
  onTotalChange?: (value: number) => void;
}) {
  const [selectedLevels, setSelectedLevels] = useState<Record<string, RubricLevel>>({});

  const q = useQuery({
    queryKey: ["rubric-grade", submissionId, rubricId],
    enabled: Boolean(rubricId),
    queryFn: async () => {
      try {
        const snap = await getDoc(doc(db, "rubrics", rubricId));
        if (!snap.exists()) return null;
        return snap.data();
      } catch {
        return null;
      }
    },
  });

  const rubric = q.data;
  const criteria: RubricCriterion[] = (rubric?.criteria as any) || [];

  const handleSelectLevel = (critId: string, level: RubricLevel) => {
    setSelectedLevels((prev) => {
      const next = { ...prev, [critId]: level };
      const total = Object.values(next).reduce((sum, lvl) => sum + (Number(lvl.points) || 0), 0);
      onTotalChange?.(total);
      return next;
    });
  };

  const totalSelected = Object.values(selectedLevels).reduce(
    (sum, lvl) => sum + (Number(lvl.points) || 0),
    0,
  );
  const totalMax = criteria.reduce((sum, c) => sum + (Number(c.max_points) || 0), 0);

  if (!rubricId) return null;

  return (
    <div className="panel p-4 bg-card border-border space-y-3 rounded-xl">
      <div className="flex items-center justify-between border-b border-border/70 pb-2">
        <div>
          <h3 className="font-bold text-xs uppercase tracking-wider text-muted-foreground">
            Rubric Evaluation
          </h3>
          <p className="text-sm font-bold text-foreground">{rubric?.title || "Grading Rubric"}</p>
        </div>
        <div className="text-right">
          <span className="font-mono text-sm font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
            {totalSelected} / {totalMax} pts
          </span>
        </div>
      </div>

      <div className="space-y-3">
        {criteria.map((c, i) => {
          const selected = selectedLevels[c.id || String(i)];

          return (
            <div
              key={c.id || i}
              className="rounded-lg border border-border p-3 text-xs space-y-2 bg-secondary/10"
            >
              <div className="flex justify-between font-semibold">
                <span className="text-foreground">{c.title}</span>
                <span className="text-muted-foreground font-mono">Max {c.max_points} pts</span>
              </div>
              {c.description && (
                <p className="text-muted-foreground text-[11px]">{c.description}</p>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1">
                {(c.levels || []).map((lvl, lIdx) => {
                  const isChosen =
                    selected?.id === lvl.id ||
                    (selected?.label === lvl.label && selected?.points === lvl.points);

                  return (
                    <button
                      key={lvl.id || lIdx}
                      type="button"
                      onClick={() => handleSelectLevel(c.id || String(i), lvl)}
                      className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                        isChosen
                          ? "border-primary bg-primary/15 text-foreground shadow-2xs font-semibold"
                          : "border-border/80 bg-card hover:bg-secondary/30 text-muted-foreground"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold">{lvl.label}</span>
                        <span className="font-mono text-[11px] text-primary">{lvl.points}p</span>
                      </div>
                      {lvl.description && (
                        <p className="text-[10px] mt-1 text-muted-foreground line-clamp-2 leading-tight">
                          {lvl.description}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
