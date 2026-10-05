import { ShieldAlert } from "lucide-react";
import { RenderMathText } from "@/components/math/RenderMathText";
import { formatDue } from "@/lib/assignments";

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
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Pages ({pages.length})
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {pages.map((p, i) => (
              <figure key={p.id} className="panel overflow-hidden p-0">
                <a href={p.url} target="_blank" rel="noreferrer" aria-label={`Open page ${i + 1}`}>
                  <img
                    src={p.url}
                    alt={`Page ${i + 1}`}
                    loading="lazy"
                    className="w-full bg-muted/30 object-contain"
                  />
                </a>
                <figcaption className="px-3 py-2 text-xs text-muted-foreground">
                  Page {i + 1} · {p.file_name}
                </figcaption>
              </figure>
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
