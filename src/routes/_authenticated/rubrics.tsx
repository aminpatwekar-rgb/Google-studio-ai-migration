import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  collection,
  doc,
  getDocs,
  setDoc,
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
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/rubrics")({
  head: () => ({ meta: [{ title: "Rubrics — ONYX" }] }),
  component: Page,
});

type Criterion = {
  title: string;
  description: string;
  max_points: number;
  levels: { label: string; description: string; points: number }[];
};

export type RubricDoc = {
  id: string;
  title: string;
  description: string;
  owner_id: string;
  criteria: Criterion[];
  created_at: string;
};

function Page() {
  const { user } = useAuth();
  const { effectiveRole } = useViewRole();
  const allowed = effectiveRole === "teacher" || effectiveRole === "admin";
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [criteria, setCriteria] = useState(
    "Technical accuracy | 4 | Excellent:4 | Good:3 | Needs improvement:2 | Poor:1\nPresentation | 4 | Excellent:4 | Good:3 | Needs improvement:2 | Poor:1",
  );

  const q = useQuery({
    queryKey: ["rubrics"],
    enabled: allowed,
    queryFn: async (): Promise<RubricDoc[]> => {
      try {
        const snap = await getDocs(
          query(collection(db, "rubrics"), orderBy("created_at", "desc")),
        );
        return snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as RubricDoc[];
      } catch {
        return [];
      }
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("Rubric title is required.");
      if (!user) throw new Error("Sign in to create a rubric.");

      const rows: Criterion[] = criteria
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [head, ...parts] = line.split("|").map((x) => x.trim());
          const [name, max] = head!.split("::").map((x) => x.trim());
          const levels = parts.map((p) => {
            const [label, points, ...desc] = p.split(":");
            return {
              label: label?.trim() || "Level",
              points: Number(points) || 0,
              description: desc.join(":").trim(),
            };
          });
          return {
            title: name || "Criterion",
            description: "",
            max_points: Number(max) || Math.max(...levels.map((x) => x.points), 1),
            levels,
          };
        });

      const ref = doc(collection(db, "rubrics"));
      await setDoc(ref, {
        id: ref.id,
        owner_id: user.id,
        title: title.trim(),
        description: description.trim() || "",
        criteria: rows,
        created_at: new Date().toISOString(),
      });
    },
    onSuccess: async () => {
      setOpen(false);
      setTitle("");
      setDescription("");
      await qc.invalidateQueries({ queryKey: ["rubrics"] });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await deleteDoc(doc(db, "rubrics", id));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rubrics"] }),
  });

  if (!allowed)
    return (
      <div className="panel p-10 text-center">
        Rubrics are available to teachers and administrators.
      </div>
    );

  return (
    <PlanGate feature="rubrics">
      <div className="space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Grading Rubrics</h1>
            <p className="text-sm text-muted-foreground">
              Build reusable scoring guides for standardized evaluation.
            </p>
          </div>
          <Button onClick={() => setOpen(true)} className="gap-2">
            <Plus className="size-4" /> New Rubric
          </Button>
        </header>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(q.data ?? []).map((r) => (
            <div key={r.id} className="panel p-5 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold">{r.title}</h3>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => remove.mutate(r.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              {r.description && <p className="text-xs text-muted-foreground">{r.description}</p>}
              <p className="text-xs text-muted-foreground">
                {r.criteria?.length || 0} criteria defined
              </p>
            </div>
          ))}
          {(q.data ?? []).length === 0 && (
            <p className="col-span-full panel p-8 text-center text-sm text-muted-foreground">
              No rubrics yet. Create your first rubric to guide grading consistency.
            </p>
          )}
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>New Rubric</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Input
                  placeholder="Rubric title (e.g. Lab Report Scoring)"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Input
                  placeholder="Description (optional)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">
                  Criteria (one per line): Title | Max | Level:Points ...
                </p>
                <Textarea
                  rows={4}
                  value={criteria}
                  onChange={(e) => setCriteria(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                Create Rubric
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PlanGate>
  );
}
