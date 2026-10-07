import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Paperclip, X } from "lucide-react";
import { collection, deleteDoc, doc, getDocs, orderBy, query } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
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
import { db } from "@/lib/firebase/config";
import { createAssignment, updateAssignment } from "@/lib/firebase/firestore";
import { removeStorageFile, uploadAssignmentAttachment } from "@/lib/firebase/storage";
import { validateFile } from "@/lib/uploadConfig";
import { UploadProgressBar, type UploadProgressInfo } from "@/components/ui/upload-progress";
import type { Assignment, AssignmentAttachment } from "@/lib/firebase/models";

export type AssignmentDraft = Assignment;

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
  const fileRef = useRef<HTMLInputElement>(null);
  const editing = Boolean(assignment);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [maxPoints, setMaxPoints] = useState("100");
  const [submissionType, setSubmissionType] = useState<Assignment["submissionType"]>("either");
  const [autoCorrect, setAutoCorrect] = useState(true);
  const [voiceTyping, setVoiceTyping] = useState(false);
  const [linksAllowed, setLinksAllowed] = useState(false);
  const [imagesAllowed, setImagesAllowed] = useState(false);
  const [filesAllowed, setFilesAllowed] = useState(false);
  const [groupAssignment, setGroupAssignment] = useState(false);
  const [rubricId, setRubricId] = useState("none");
  const [referenceLinks, setReferenceLinks] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<AssignmentAttachment[]>([]);
  const [uploadProgress, setUploadProgress] = useState<UploadProgressInfo | null>(null);

  const rubrics = useQuery({
    queryKey: ["assignment-rubrics", teacherId],
    enabled: open && Boolean(teacherId),
    queryFn: async () => {
      const snap = await getDocs(query(collection(db, "rubrics"), orderBy("created_at", "desc")));
      return snap.docs.map((d) => ({ id: d.id, title: d.data().title || "Rubric" }));
    },
  });

  useEffect(() => {
    if (!open) return;
    if (assignment) {
      setTitle(assignment.title || "");
      setDescription(assignment.description || assignment.instructions || "");
      setDueDate(toLocalInput(assignment.dueDate || null));
      setMaxPoints(String(assignment.maxPoints || 100));
      setSubmissionType(assignment.submissionType || "either");
      setAutoCorrect(assignment.autoCorrect ?? true);
      setVoiceTyping(assignment.voiceTyping ?? false);
      setLinksAllowed(assignment.linksAllowed ?? false);
      setImagesAllowed(assignment.imagesAllowed ?? false);
      setFilesAllowed(assignment.filesAllowed ?? false);
      setGroupAssignment(assignment.groupAssignment ?? false);
      setRubricId(assignment.rubricId || "none");
      setReferenceLinks((assignment.referenceLinks || []).join("\n"));
      setFiles([]);
      void loadAttachments(assignment.id);
    } else {
      setTitle("");
      setDescription("");
      setDueDate(toLocalInput(new Date(Date.now() + 7 * 86400000).toISOString()));
      setMaxPoints("100");
      setSubmissionType("either");
      setAutoCorrect(true);
      setVoiceTyping(false);
      setLinksAllowed(false);
      setImagesAllowed(false);
      setFilesAllowed(false);
      setGroupAssignment(false);
      setRubricId("none");
      setReferenceLinks("");
      setFiles([]);
      setExistingAttachments([]);
    }
  }, [open, assignment]);

  async function loadAttachments(assignmentId: string) {
    try {
      const snap = await getDocs(collection(db, "assignments", assignmentId, "attachments"));
      setExistingAttachments(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AssignmentAttachment, "id">) })),
      );
    } catch {
      setExistingAttachments([]);
    }
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("Title is required");
      if (!teacherId) throw new Error("You must be signed in as a teacher.");
      const dueIso = dueDate ? new Date(dueDate).toISOString() : new Date().toISOString();
      const base = {
        title: title.trim(),
        description: description.trim(),
        dueDate: dueIso,
        maxPoints: Math.max(1, Number.parseInt(maxPoints, 10) || 100),
        submissionType,
        autoCorrect,
        voiceTyping,
        linksAllowed,
        imagesAllowed,
        filesAllowed,
        groupAssignment,
        rubricId: rubricId === "none" ? null : rubricId,
        referenceLinks: linksAllowed
          ? referenceLinks
              .split("\n")
              .map((x) => x.trim())
              .filter(Boolean)
              .slice(0, 20)
          : [],
      };

      let id: string;
      if (editing && assignment) {
        await updateAssignment(assignment.id, base);
        id = assignment.id;
      } else {
        id = await createAssignment({
          classId,
          ...base,
          createdBy: teacherId,
          createdAt: new Date().toISOString(),
        });
      }

      for (const file of files) {
        const uploaded = await uploadAssignmentAttachment(id, file, teacherId, (info) => {
          setUploadProgress({
            state: info.state,
            progressPercent: info.progressPercent,
            fileName: info.fileName,
            originalSize: info.originalSize,
            compressedSize: info.compressedSize,
            savingsLabel: info.savingsLabel,
            error: info.state === "error" ? info.message : undefined,
          });
        });
        const attachmentRef = doc(collection(db, "assignments", id, "attachments"));
        await import("firebase/firestore").then(({ setDoc }) =>
          setDoc(attachmentRef, {
            id: attachmentRef.id,
            assignmentId: id,
            storagePath: uploaded.path,
            fileName: uploaded.fileName,
            mimeType: uploaded.mimeType,
            sizeBytes: uploaded.sizeBytes,
            url: uploaded.url,
            uploadedBy: teacherId,
            createdAt: new Date().toISOString(),
          }),
        );
      }
      return id;
    },
    onSuccess: (id) => {
      toast.success(editing ? "Assignment updated" : "Assignment created");
      setFiles([]);
      setUploadProgress(null);
      onOpenChange(false);
      void qc.invalidateQueries({ queryKey: ["class-assignments"] });
      void qc.invalidateQueries({ queryKey: ["assignment", id] });
      void qc.invalidateQueries({ queryKey: ["assignment-attachments", id] });
      void qc.invalidateQueries({ queryKey: ["all-assignments"] });
      void qc.invalidateQueries({ queryKey: ["teacher-dash"] });
      onSaved?.(id);
    },
    onError: (e: Error) => {
      setUploadProgress(null);
      toast.error(e.message);
    },
  });

  async function removeExisting(file: AssignmentAttachment) {
    try {
      await deleteDoc(doc(db, "assignments", file.assignmentId, "attachments", file.id));
      await removeStorageFile(file.storagePath);
      setExistingAttachments((prev) => prev.filter((x) => x.id !== file.id));
      toast.success("Attachment removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove attachment");
    }
  }

  function setDuePreset(daysOffset: number, setEndOfDay = true) {
    const d = new Date();
    d.setDate(d.getDate() + daysOffset);
    if (setEndOfDay) {
      d.setHours(23, 59, 0, 0);
    }
    setDueDate(toLocalInput(d.toISOString()));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Assignment" : "New Assignment"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="a-title">Title</Label>
            <Input
              id="a-title"
              maxLength={160}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Chapter 4 Problem Set"
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
              <div className="flex items-center justify-between">
                <Label htmlFor="a-due">Due Date & Time</Label>
                {dueDate && (
                  <span className="text-[10px] font-medium text-muted-foreground truncate max-w-[140px]">
                    {new Date(dueDate).toLocaleString([], {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                )}
              </div>
              <Input
                id="a-due"
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="font-mono text-xs"
              />
              <div className="flex flex-wrap gap-1 pt-0.5">
                <button
                  type="button"
                  onClick={() => setDuePreset(0, true)}
                  className="rounded-md border border-border/80 bg-secondary/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer"
                >
                  Today 11:59 PM
                </button>
                <button
                  type="button"
                  onClick={() => setDuePreset(1, true)}
                  className="rounded-md border border-border/80 bg-secondary/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer"
                >
                  Tomorrow 11:59 PM
                </button>
                <button
                  type="button"
                  onClick={() => setDuePreset(3, true)}
                  className="rounded-md border border-border/80 bg-secondary/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer"
                >
                  In 3 Days
                </button>
                <button
                  type="button"
                  onClick={() => setDuePreset(7, true)}
                  className="rounded-md border border-border/80 bg-secondary/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer"
                >
                  In 1 Week
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="a-desc">Instructions & Description</Label>
            <Textarea
              id="a-desc"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detail expectations, formulas, or guidelines..."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Submission type</Label>
              <Select
                value={submissionType}
                onValueChange={(v) => setSubmissionType(v as Assignment["submissionType"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="either">Handwritten or typed</SelectItem>
                  <SelectItem value="handwritten">Handwritten only</SelectItem>
                  <SelectItem value="typed">Typed only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Rubric (optional)</Label>
              <Select value={rubricId} onValueChange={setRubricId}>
                <SelectTrigger>
                  <SelectValue placeholder="No rubric" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No rubric</SelectItem>
                  {(rubrics.data || []).map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["Auto-correct", autoCorrect, setAutoCorrect],
              ["Voice typing", voiceTyping, setVoiceTyping],
              ["Allow links", linksAllowed, setLinksAllowed],
              ["Allow images", imagesAllowed, setImagesAllowed],
              ["Allow file uploads", filesAllowed, setFilesAllowed],
              ["Group assignment", groupAssignment, setGroupAssignment],
            ].map(([label, checked, setter]) => (
              <label
                key={String(label)}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <span className="text-sm">{String(label)}</span>
                <Switch
                  checked={Boolean(checked)}
                  onCheckedChange={setter as (v: boolean) => void}
                />
              </label>
            ))}
          </div>

          {linksAllowed && (
            <div className="space-y-1.5">
              <Label htmlFor="a-links">Reference links</Label>
              <Textarea
                id="a-links"
                rows={3}
                value={referenceLinks}
                onChange={(e) => setReferenceLinks(e.target.value)}
                placeholder="One URL per line"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>
              Attachments <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              ref={fileRef}
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.ppt,.pptx,.txt,.mp4"
              onChange={(e) => {
                const incoming = Array.from(e.target.files || []);
                const valid: File[] = [];
                for (const f of incoming) {
                  try {
                    validateFile(f);
                    valid.push(f);
                  } catch (err: any) {
                    toast.error(err.message || "File validation failed");
                  }
                }
                setFiles((prev) => [...prev, ...valid]);
                e.target.value = "";
              }}
            />
            {files.length > 0 && (
              <p className="text-xs text-muted-foreground">{files.length} new file(s) selected</p>
            )}
            <UploadProgressBar info={uploadProgress} className="mt-2" />
            {existingAttachments.length > 0 && (
              <div className="space-y-1">
                {existingAttachments.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center gap-2 rounded-md bg-muted/40 px-2.5 py-2 text-sm"
                  >
                    <Paperclip className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{file.fileName}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${file.fileName}`}
                      onClick={() => void removeExisting(file)}
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={
              save.isPending ||
              (uploadProgress !== null &&
                (uploadProgress.state === "compressing" || uploadProgress.state === "uploading"))
            }
          >
            {save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            {editing ? "Save Changes" : "Post Assignment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
