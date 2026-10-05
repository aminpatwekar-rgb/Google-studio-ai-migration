import { useQuery } from "@tanstack/react-query";
import { Download, FileText, Loader2 } from "lucide-react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/config";

type Attachment = {
  id: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  url: string;
};

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AssignmentAttachments({ assignmentId }: { assignmentId: string }) {
  const q = useQuery({
    queryKey: ["assignment-attachments", assignmentId],
    queryFn: async () => {
      try {
        const snap = await getDocs(collection(db, "assignments", assignmentId, "attachments"));
        return snap.docs.map((d) => ({
          id: d.id,
          file_name: d.data().fileName || d.data().file_name || "Attachment",
          mime_type: d.data().mimeType || d.data().mime_type || null,
          size_bytes: d.data().sizeBytes || d.data().size_bytes || null,
          url: d.data().url || "",
        })) as Attachment[];
      } catch {
        return [];
      }
    },
  });

  if (q.isLoading) {
    return (
      <div className="panel flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading attachments…
      </div>
    );
  }

  const files = q.data ?? [];
  if (!files.length) return null;

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">Attachments</h2>
      <div className="panel divide-y divide-border">
        {files.map((file) => (
          <a
            key={file.id}
            href={file.url || undefined}
            target="_blank"
            rel="noreferrer"
            download={file.file_name}
            className="flex items-center gap-3 p-3 transition-colors hover:bg-muted/40"
          >
            <FileText className="size-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{file.file_name}</p>
              <p className="text-xs text-muted-foreground">
                {file.mime_type || "File"}
                {file.size_bytes ? ` · ${formatSize(file.size_bytes)}` : ""}
              </p>
            </div>
            <Download className="size-4 shrink-0 text-muted-foreground" />
          </a>
        ))}
      </div>
    </section>
  );
}
