import { Loader2, CheckCircle2, AlertCircle, FileCheck, Sparkles } from "lucide-react";
import { Progress } from "@/components/ui/progress";

export interface UploadProgressInfo {
  state: "idle" | "validating" | "compressing" | "uploading" | "completed" | "error";
  progressPercent: number; // 0 - 100
  fileName?: string;
  originalSize?: number;
  compressedSize?: number;
  savingsLabel?: string;
  error?: string;
}

export function UploadProgressBar({
  info,
  className = "",
}: {
  info: UploadProgressInfo | null;
  className?: string;
}) {
  if (!info || info.state === "idle") return null;

  const isCompressing = info.state === "compressing";
  const isUploading = info.state === "uploading";
  const isCompleted = info.state === "completed";
  const isError = info.state === "error";

  return (
    <div
      className={`rounded-lg border border-border bg-card/90 p-3 shadow-xs space-y-2 text-xs transition-all ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 truncate">
          {isCompressing && <Sparkles className="size-4 animate-pulse text-amber-500 shrink-0" />}
          {isUploading && <Loader2 className="size-4 animate-spin text-primary shrink-0" />}
          {isCompleted && <CheckCircle2 className="size-4 text-success shrink-0" />}
          {isError && <AlertCircle className="size-4 text-destructive shrink-0" />}

          <span className="font-medium text-foreground truncate">
            {isCompressing && "Compressing file…"}
            {isUploading && `Uploading file… (${info.progressPercent}%)`}
            {isCompleted && "Upload complete!"}
            {isError && "Upload failed"}
          </span>

          {info.fileName && (
            <span className="text-muted-foreground truncate hidden sm:inline">
              • {info.fileName}
            </span>
          )}
        </div>

        {info.savingsLabel && (
          <span className="shrink-0 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">
            {info.savingsLabel}
          </span>
        )}
      </div>

      {(isCompressing || isUploading) && (
        <Progress
          value={isCompressing ? 25 : Math.max(25, info.progressPercent)}
          className="h-1.5 w-full"
        />
      )}

      {isError && info.error && (
        <p className="text-destructive text-[11px] font-medium">{info.error}</p>
      )}
    </div>
  );
}
