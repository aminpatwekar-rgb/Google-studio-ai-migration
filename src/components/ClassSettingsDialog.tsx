import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Archive,
  ArchiveRestore,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { updateClass, deleteClass } from "@/lib/firebase/firestore";
import { makeJoinCode } from "@/lib/assignments";
import { compressFileWithStats, formatCompressionSavings } from "@/lib/compression";
import { validateFile } from "@/lib/uploadConfig";
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
  const [joinCode, setJoinCode] = useState(klass.join_code);
  const [bannerUrl, setBannerUrl] = useState<string | null>(klass.banner_url);
  const [archived, setArchivedState] = useState(klass.archived);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(klass.name);
    setSubject(klass.subject ?? "");
    setSection(klass.section ?? "");
    setDescription(klass.description ?? "");
    setJoinCode(klass.join_code);
    setBannerUrl(klass.banner_url);
    setArchivedState(klass.archived);
  }, [
    open,
    klass.id,
    klass.name,
    klass.subject,
    klass.section,
    klass.description,
    klass.join_code,
    klass.banner_url,
    klass.archived,
  ]);

  function refresh() {
    void qc.invalidateQueries({ queryKey: ["class", klass.id] });
    void qc.invalidateQueries({ queryKey: ["classes"] });
    void qc.invalidateQueries({ queryKey: ["admin-classes"] });
  }

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      validateFile(file);
      if (!file.type.startsWith("image/")) {
        toast.error("Banner must be an image (JPEG, PNG, WebP)");
        return;
      }
      const stats = await compressFileWithStats(file);
      const compressed = stats.file;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setBannerUrl(dataUrl);
        if (stats.wasCompressed) {
          toast.success(`Banner compressed: ${formatCompressionSavings(stats)}`);
        } else {
          toast.success("Banner image loaded");
        }
      };
      reader.readAsDataURL(compressed);
    } catch (err: any) {
      toast.error(err.message || "Failed to process banner image");
    } finally {
      e.target.value = "";
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Class name is required");
      await updateClass(klass.id, {
        name: name.trim().slice(0, 120),
        subject: subject.trim() || "",
        section: section.trim() || "",
        description: description.trim() || "",
        joinCode: joinCode.trim() || klass.join_code,
        bannerUrl: bannerUrl || null,
        archived,
      });
    },
    onSuccess: () => {
      toast.success("Class updated successfully");
      refresh();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const regenerate = useMutation({
    mutationFn: async () => {
      const newCode = makeJoinCode();
      await updateClass(klass.id, {
        joinCode: newCode,
      });
      setJoinCode(newCode);
    },
    onSuccess: () => {
      toast.success("New join code generated");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleArchive = useMutation({
    mutationFn: async () => {
      const nextArchived = !archived;
      await updateClass(klass.id, {
        archived: nextArchived,
      });
      setArchivedState(nextArchived);
      return nextArchived;
    },
    onSuccess: (nextArchived) => {
      toast.success(nextArchived ? "Class archived" : "Class restored");
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
        <DialogContent className="max-w-md sm:max-w-lg max-h-[85vh] overflow-y-auto p-6 bg-card border-border">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
              Class settings
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Only you and platform admins can change these.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Class name */}
            <div className="space-y-1.5">
              <Label htmlFor="cs-name" className="text-xs font-medium text-foreground">
                Class name
              </Label>
              <Input
                id="cs-name"
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Class name"
                className="bg-card text-sm"
              />
            </div>

            {/* Subject and Section in a 2-column row matching image */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cs-subject" className="text-xs font-medium text-foreground">
                  Subject
                </Label>
                <Input
                  id="cs-subject"
                  maxLength={60}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Subject"
                  className="bg-card text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cs-section" className="text-xs font-medium text-foreground">
                  Section
                </Label>
                <Input
                  id="cs-section"
                  maxLength={30}
                  value={section}
                  onChange={(e) => setSection(e.target.value)}
                  placeholder="Section"
                  className="bg-card text-sm"
                />
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="cs-desc" className="text-xs font-medium text-foreground">
                Description
              </Label>
              <Textarea
                id="cs-desc"
                maxLength={500}
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Class description"
                className="bg-card text-sm resize-y"
              />
            </div>

            {/* Join code card matching screenshot */}
            <div className="space-y-2 rounded-xl border border-border/80 bg-secondary/10 p-4">
              <p className="text-xs font-semibold text-foreground">Join code</p>
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                <div className="rounded-lg border border-border bg-card px-3 py-1.5 font-mono text-sm tracking-wider font-semibold text-foreground">
                  {joinCode}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => regenerate.mutate()}
                  disabled={regenerate.isPending}
                  className="gap-1.5 text-xs h-9"
                >
                  <RefreshCw className={`size-3.5 ${regenerate.isPending ? "animate-spin" : ""}`} />
                  Generate new code
                </Button>
              </div>
              <p className="text-xs text-muted-foreground pt-1">
                Generating a new code invalidates old invitation links.
              </p>
            </div>

            {/* Class banner card matching screenshot */}
            <div className="space-y-2 rounded-xl border border-border/80 bg-secondary/10 p-4">
              <p className="text-xs font-semibold text-foreground">Class banner</p>
              {bannerUrl ? (
                <div className="space-y-2">
                  <div className="relative h-24 w-full rounded-lg overflow-hidden border border-border">
                    <img
                      src={bannerUrl}
                      alt="Class Banner"
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setBannerUrl(null)}
                      className="absolute top-2 right-2 size-6 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileRef.current?.click()}
                    className="gap-1.5 text-xs h-9"
                  >
                    <ImageIcon className="size-3.5" /> Change banner
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                  className="gap-1.5 text-xs h-9"
                >
                  <ImageIcon className="size-3.5" /> Upload banner
                </Button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleBannerUpload}
              />
            </div>
          </div>

          {/* Footer matching screenshot */}
          <DialogFooter className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => toggleArchive.mutate()}
                disabled={toggleArchive.isPending}
                className="gap-1.5 text-xs h-9"
              >
                {archived ? (
                  <>
                    <ArchiveRestore className="size-3.5" /> Restore
                  </>
                ) : (
                  <>
                    <Archive className="size-3.5" /> Archive
                  </>
                )}
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirmDelete(true)}
                className="gap-1.5 text-xs text-destructive hover:bg-destructive/10 h-9"
              >
                <Trash2 className="size-3.5" /> Delete
              </Button>
            </div>

            <Button
              type="button"
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="bg-primary text-primary-foreground font-medium text-xs h-9 px-4"
            >
              {save.isPending ? (
                <div className="flex items-center gap-1.5">
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Saving...</span>
                </div>
              ) : (
                "Save changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{klass.name}"?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              Are you sure you want to delete this class? This action cannot be undone. Every
              assignment, quiz, and submission in it will be removed.
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
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {remove.isPending ? "Deleting..." : "Delete class"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
