import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type ChangeEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, CheckCircle2, Upload } from "lucide-react";
import { importStudentsFromCsv } from "@/lib/onyx.features.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/classes/$classId/import")({
  head: () => ({ meta: [{ title: "Import Students — ONYX" }] }),
  component: Page,
});

function Page() {
  const { classId } = Route.useParams();
  const importer = useServerFn(importStudentsFromCsv);
  const [csv, setCsv] = useState("");
  const [name, setName] = useState("");
  const run = useMutation({ mutationFn: () => importer({ data: { classId, csv } }) });
  async function file(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setName(f.name);
    setCsv(await f.text());
  }
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        to="/classes/$classId"
        params={{ classId }}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to class
      </Link>
      <header>
        <h1 className="text-2xl font-semibold">Import Students</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Import existing ONYX student accounts using email, full_name and optional Roll/ER/Sr
          identifiers.
        </p>
      </header>
      <div className="panel space-y-5 p-5">
        <input type="file" accept=".csv,text/csv" onChange={file} />
        {name && <p className="text-xs text-muted-foreground">{name}</p>}
        <Textarea
          className="min-h-64 font-mono text-xs"
          placeholder={
            "email,full_name,roll_no,er_no,sr_no\nstudent@example.com,Student Name,12,ER123,SR123"
          }
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
        />
        <Button onClick={() => run.mutate()} disabled={!csv.trim() || run.isPending}>
          <Upload className="mr-2 size-4" />
          {run.isPending ? "Importing…" : "Validate & import"}
        </Button>
      </div>
      {run.data && (
        <div className="panel space-y-3 p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="size-5 text-success" />
            Import complete
          </h2>
          <p className="text-sm">
            {run.data.imported} imported · {run.data.skipped} skipped · {run.data.total} rows
            processed.
          </p>
          {run.data.skippedRows.length > 0 && (
            <div className="rounded-lg border border-border p-3 text-xs">
              <p className="font-medium">Skipped rows</p>
              {run.data.skippedRows.map((x: any) => (
                <p key={x.line}>
                  Line {x.line}: {x.reason}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
      {run.isError && (
        <div className="panel p-5 text-sm text-destructive">{(run.error as Error).message}</div>
      )}
    </div>
  );
}
