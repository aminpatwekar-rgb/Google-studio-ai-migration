import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export function RubricGrader({
  submissionId,
  rubricId,
  onTotalChange,
}: {
  submissionId: string;
  rubricId: string;
  onTotalChange?: (value: number) => void;
}) {
  const [selection, setSelection] = useState<
    Record<string, { levelId: string; points: number; feedback: string }>
  >({});

  const q = useQuery({
    queryKey: ["rubric-grade", submissionId, rubricId],
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
  const criteria = rubric?.criteria || [];

  return (
    <div className="panel p-4 space-y-3">
      <h3 className="font-semibold text-sm">Grading Rubric: {rubric?.title || "Standard"}</h3>
      <div className="space-y-3">
        {criteria.map((c: any, i: number) => (
          <div key={i} className="rounded-lg border p-3 text-xs space-y-1">
            <div className="flex justify-between font-medium">
              <span>{c.title}</span>
              <span className="text-muted-foreground">Max {c.max_points} pts</span>
            </div>
            {c.description && <p className="text-muted-foreground">{c.description}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
