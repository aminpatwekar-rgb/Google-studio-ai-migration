import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileText, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { collection, doc, getDocs, setDoc, deleteDoc, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

type Resource = {
  id: string;
  class_id: string;
  uploader_id: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  data_url?: string;
  created_at: string;
};

function formatSize(bytes: number | null) {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function ClassResources({ classId, canManage }: { classId: string; canManage: boolean }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const resources = useQuery({
    queryKey: ["class-resources", classId],
    queryFn: async () => {
      try {
        const snap = await getDocs(
          query(collection(db, "classes", classId, "resources"), orderBy("created_at", "desc")),
        );
        return snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as Resource[];
      } catch {
        return [] as Resource[];
      }
    },
  });

  const download = useMutation({
    mutationFn: async (resource: Resource) => {
      if (resource.data_url) {
        const anchor = document.createElement("a");
        anchor.href = resource.data_url;
        anchor.download = resource.file_name;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      } else {
        toast.info("File preview not available directly");
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      if (!user) throw new Error("Sign in to upload resources");
      for (const file of files) {
        let dataUrl: string | undefined = undefined;
        if (file.size < 800_000) {
          dataUrl = await fileToDataUrl(file);
        }
        const ref = doc(collection(db, "classes", classId, "resources"));
        await setDoc(ref, {
          id: ref.id,
          class_id: classId,
          uploader_id: user.id,
          file_name: file.name,
          mime_type: file.type || null,
          size_bytes: file.size,
          data_url: dataUrl || null,
          created_at: new Date().toISOString(),
        });
      }
    },
    onSuccess: () => {
      toast.success("Resources uploaded");
      if (inputRef.current) inputRef.current.value = "";
      void queryClient.invalidateQueries({ queryKey: ["class-resources", classId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: async (resource: Resource) => {
      await deleteDoc(doc(db, "classes", classId, "resources", resource.id));
    },
    onSuccess: () => {
      toast.success("Resource removed");
      void queryClient.invalidateQueries({ queryKey: ["class-resources", classId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-1.5">
            <label htmlFor="class-resources" className="text-sm font-medium">
              Add class files
            </label>
            <Input
              ref={inputRef}
              id="class-resources"
              type="file"
              multiple
              disabled={upload.isPending}
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                if (files.length) upload.mutate(files);
              }}
            />
          </div>
          {upload.isPending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Uploading…
            </div>
          )}
        </div>
      )}

      {resources.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : (resources.data ?? []).length === 0 ? (
        <p className="panel p-6 text-center text-sm text-muted-foreground">
          No resources shared in this class yet.
        </p>
      ) : (
        <div className="panel divide-y divide-border">
          {(resources.data ?? []).map((resource) => (
            <div
              key={resource.id}
              className="flex items-center justify-between gap-3 p-3.5 transition-colors hover:bg-muted/40"
            >
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="size-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{resource.file_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatSize(resource.size_bytes)} ·{" "}
                    {new Date(resource.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {resource.data_url && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => download.mutate(resource)}
                    title="Download"
                  >
                    <Download className="size-4" />
                  </Button>
                )}
                {canManage && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => remove.mutate(resource)}
                    title="Delete"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
