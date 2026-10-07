import { useState } from "react";
import { ShieldAlert, Sparkles, Loader2 } from "lucide-react";
import { RenderMathText } from "@/components/math/RenderMathText";
import { formatDue } from "@/lib/assignments";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { performHandwritingOcr } from "@/lib/ai/ocr.functions";

export type ViewerFile = {
  id: string;
  kind: string;
  url: string;
  file_name: string;
  caption: string | null;
};

export type ViewerViolation = { id: string; kind: string; occurred_at: string };

/** The student's work: photographed pages, typed answer with equations, and paste warnings. */
export function SubmissionViewer({
  files,
  typedContent,
  violations,
  violationCount,
}: {
  files: ViewerFile[];
  typedContent: string | null;
  violations: ViewerViolation[];
  violationCount: number;
}) {
  const pages = files.filter((f) => f.kind === "page");
  const inline = files.filter((f) => f.kind === "inline_image");
  const hasWork = pages.length > 0 || Boolean(typedContent);

  return (
    <div className="space-y-5">
      {violationCount > 0 && (
        <div className="panel border-destructive/40 bg-destructive/5 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-destructive">
            <ShieldAlert className="size-4" />
            {violationCount} blocked copy/paste attempt{violationCount === 1 ? "" : "s"}
          </p>
          {violations.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {violations.slice(0, 5).map((v) => (
                <li key={v.id}>
                  {v.kind} · {formatDue(v.occurred_at)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!hasWork && (
        <div className="panel p-8 text-center text-sm text-muted-foreground">
          This submission has no pages or typed answer.
        </div>
      )}

      {pages.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Pages ({pages.length})
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {pages.map((p, i) => (
              <PageWithOcr key={p.id} page={p} index={i} />
            ))}
          </div>
        </section>
      )}

      {typedContent && (
        <section className="panel p-5 sm:p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Typed answer
          </h2>
          <RenderMathText text={typedContent} className="mt-3 text-[15px] leading-7" />
          {inline.length > 0 && (
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {inline.map((f) => (
                <figure key={f.id}>
                  <img
                    src={f.url}
                    alt={f.caption || "Student illustration"}
                    loading="lazy"
                    className="w-full rounded-md border border-border object-cover"
                  />
                  {f.caption && (
                    <figcaption className="mt-1 text-xs text-muted-foreground">
                      {f.caption}
                    </figcaption>
                  )}
                </figure>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function PageWithOcr({ page, index }: { page: ViewerFile; index: number }) {
  const [ocrText, setOcrText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editableText, setEditableText] = useState("");

  const handleOcr = async () => {
    setLoading(true);
    try {
      // Fetch image and convert to data URL for OCR
      const resp = await fetch(page.url);
      const blob = await resp.blob();
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const res = await performHandwritingOcr({
        data: { imageDataUrl: dataUrl, mode: "math" },
      });

      setOcrText(res.text);
      setEditableText(res.text);
      toast.success("Handwriting successfully digitized!");
    } catch (err: any) {
      toast.error(err.message || "Could not digitize page");
    } finally {
      setLoading(false);
    }
  };

  return (
    <figure className="panel overflow-hidden p-0 flex flex-col justify-between">
      <a href={page.url} target="_blank" rel="noreferrer" aria-label={`Open page ${index + 1}`}>
        <img
          src={page.url}
          alt={`Page ${index + 1}`}
          loading="lazy"
          className="w-full bg-muted/30 object-contain max-h-80"
        />
      </a>
      <div className="p-3 border-t border-border space-y-2 bg-card">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Page {index + 1} · {page.file_name}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1.5"
            onClick={handleOcr}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="size-3 animate-spin" />
                Digitizing...
              </>
            ) : (
              <>
                <Sparkles className="size-3 text-primary" />
                Convert to Digital
              </>
            )}
          </Button>
        </div>

        {ocrText && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-primary flex items-center gap-1">
                <Sparkles className="size-3" /> Digitized Transcription (LaTeX Math)
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-[11px] px-2"
                onClick={() => setEditing(!editing)}
              >
                {editing ? "Preview" : "Edit"}
              </Button>
            </div>
            {editing ? (
              <Textarea
                value={editableText}
                onChange={(e) => setEditableText(e.target.value)}
                className="font-mono text-xs min-h-24 bg-background"
              />
            ) : (
              <div className="bg-background/80 p-2.5 rounded border border-border/60">
                <RenderMathText text={editableText || ocrText} />
              </div>
            )}
          </div>
        )}
      </div>
    </figure>
  );
}
