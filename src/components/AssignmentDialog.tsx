import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createAssignment, updateAssignment } from "@/lib/firebase/firestore";
import type { Assignment } from "@/lib/firebase/models";

export type AssignmentDraft = {
  id: string;
  classId: string;
  title: string;
  description: string;
  dueDate: string;
  maxPoints: number;
};

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AssignmentDialog({
  open,
  onOpenChange,
  classId,
  teacherId,
  assignment,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId: string;
  teacherId: string;
  assignment?: Assignment | null;
  onSaved?: (id: string) => void;
}) {
  const qc = useQueryClient();
  const editing = Boolean(assignment);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [maxPoints, setMaxPoints] = useState("100");

  useEffect(() => {
    if (!open) return;
    if (assignment) {
      setTitle(assignment.title || "");
      setDescription(assignment.description || "");
      setDueDate(toLocalInput(assignment.dueDate || null));
      setMaxPoints(String(assignment.maxPoints || 100));
    } else {
      setTitle("");
      setDescription("");
      const defaultDue = new Date(Date.now() + 7 * 86400000);
      setDueDate(toLocalInput(defaultDue.toISOString()));
      setMaxPoints("100");
    }
  }, [open, assignment]);

  const save = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("Title is required");
      const dueIso = dueDate ? new Date(dueDate).toISOString() : new Date().toISOString();
      const points = parseInt(maxPoints, 10) || 100;

      if (editing && assignment) {
        await updateAssignment(assignment.id, {
          title: title.trim(),
          description: description.trim(),
          dueDate: dueIso,
          maxPoints: points,
        });
        return assignment.id;
      } else {
        const id = await createAssignment({
          classId,
          title: title.trim(),
          description: description.trim(),
          dueDate: dueIso,
          maxPoints: points,
          createdBy: teacherId,
          createdAt: new Date().toISOString(),
        });
        return id;
      }
    },
    onSuccess: (id) => {
      toast.success(editing ? "Assignment updated" : "Assignment created");
      onOpenChange(false);
      void qc.invalidateQueries({ queryKey: ["class-assignments"] });
      void qc.invalidateQueries({ queryKey: ["assignment", id] });
      void qc.invalidateQueries({ queryKey: ["all-assignments"] });
      void qc.invalidateQueries({ queryKey: ["teacher-dash"] });
      onSaved?.(id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Assignment" : "New Assignment"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="a-title">Title</Label>
            <Input
              id="a-title"
              maxLength={160}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Chapter 4 Problem Set"
              required
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="a-marks">Max Points</Label>
              <Input
                id="a-marks"
                type="number"
                min={1}
                max={1000}
                value={maxPoints}
                onChange={(e) => setMaxPoints(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="a-due">Due Date</Label>
              <Input
                id="a-due"
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="a-desc">Instructions & Description</Label>
            <Textarea
              id="a-desc"
              rows={4}
              placeholder="Detail expectations, formulas, or guidelines for student submissions..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            {editing ? "Save Changes" : "Post Assignment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
