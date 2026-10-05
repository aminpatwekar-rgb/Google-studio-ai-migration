import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Archive, ArchiveRestore, ImageUp, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { updateClass, deleteClass } from "@/lib/firebase/firestore";
import { makeJoinCode } from "@/lib/assignments";
import { Button } from "@/components/ui/button";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type ClassRecord = {
  id: string;
  name: string;
  subject: string | null;
  section: string | null;
  description: string | null;
  join_code: string;
  teacher_id: string;
  archived: boolean;
  banner_url: string | null;
};

export function ClassSettingsDialog({
  open,
  onOpenChange,
  klass,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  klass: ClassRecord;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(klass.name);
  const [subject, setSubject] = useState(klass.subject ?? "");
  const [section, setSection] = useState(klass.section ?? "");
  const [description, setDescription] = useState(klass.description ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(klass.name);
    setSubject(klass.subject ?? "");
    setSection(klass.section ?? "");
    setDescription(klass.description ?? "");
  }, [open, klass.id]);

  function refresh() {
    void qc.invalidateQueries({ queryKey: ["class", klass.id] });
    void qc.invalidateQueries({ queryKey: ["classes"] });
    void qc.invalidateQueries({ queryKey: ["admin-classes"] });
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Class name is required");
      await updateClass(klass.id, {
        name: name.trim().slice(0, 120),
        subject: subject.trim() || "",
        description: description.trim() || "",
      });
    },
    onSuccess: () => {
      toast.success("Class updated");
      refresh();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const regenerate = useMutation({
    mutationFn: async () => {
      await updateClass(klass.id, {
        joinCode: makeJoinCode(),
      });
    },
    onSuccess: () => {
      toast.success("New join code generated");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setArchived = useMutation({
    mutationFn: async (archived: boolean) => {
      await updateClass(klass.id, {
        description: archived
          ? `[ARCHIVED] ${klass.description || ""}`
          : klass.description?.replace("[ARCHIVED] ", "") || "",
      });
    },
    onSuccess: (_d, archived) => {
      toast.success(archived ? "Class archived" : "Class restored");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      await deleteClass(klass.id);
    },
    onSuccess: () => {
      toast.success("Class deleted");
      setConfirmDelete(false);
      onOpenChange(false);
      refresh();
      void navigate({ to: "/classes" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Class settings</DialogTitle>
            <DialogDescription>Only you and platform admins can change these.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cs-name">Class name</Label>
              <Input
                id="cs-name"
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cs-subject">Subject</Label>
                <Input
                  id="cs-subject"
                  maxLength={60}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cs-section">Section</Label>
                <Input
                  id="cs-section"
                  maxLength={30}
                  value={section}
                  onChange={(e) => setSection(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cs-desc">Description</Label>
              <Textarea
                id="cs-desc"
                maxLength={500}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="space-y-2 rounded-lg border border-border p-3">
              <p className="text-sm font-medium">Join code</p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-border px-3 py-2 font-mono text-sm tracking-widest">
                  {klass.join_code}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => regenerate.mutate()}
                  disabled={regenerate.isPending}
                >
                  <RefreshCw className="mr-1.5 size-4" /> Generate new code
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Generating a new code updates invitation access for students.
              </p>
            </div>
          </div>

          <DialogFooter className="flex-wrap gap-2 sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="mr-1.5 size-4" /> Delete
              </Button>
            </div>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{klass.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this class? This action cannot be undone. Every
              assignment and submission in it will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                remove.mutate();
              }}
              disabled={remove.isPending}
            >
              Delete class
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
