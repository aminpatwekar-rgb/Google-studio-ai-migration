import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ChevronLeft, ChevronRight, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type QueueTab = { value: string; label: string; count: number };

/**
 * Layout shared by both grading workspaces: student queue on the left (a sheet on phones),
 * the student's work and the marking panel on the right, with previous/next controls.
 */
export function WorkspaceShell({
  title,
  subtitle,
  graded,
  total,
  tabs,
  tab,
  onTab,
  queue,
  position,
  onPrev,
  onNext,
  children,
}: {
  title: string;
  subtitle: string;
  graded: number;
  total: number;
  tabs: QueueTab[];
  tab: string;
  onTab: (v: string) => void;
  queue: ReactNode;
  /** e.g. "3 of 12" */
  position: string | null;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pct = total > 0 ? Math.round((graded / total) * 100) : 0;

  const queuePanel = (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <Tabs value={tab} onValueChange={onTab}>
        <TabsList className="w-full">
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="flex-1 gap-1.5">
              {t.label}
              <span className="rounded-full bg-background/70 px-1.5 text-[11px] tabular-nums">
                {t.count}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">{queue}</div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <Link
          to="/grading"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Grading
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold sm:text-3xl">{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          </div>
          <div className="w-full sm:w-64">
            <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
              <span>Progress</span>
              <span className="tabular-nums">
                {graded} of {total} graded
              </span>
            </div>
            <Progress value={pct} className="h-2" />
          </div>
        </div>
      </div>

      {/* Phone controls: step through students without leaving the page */}
      <div className="panel flex items-center justify-between gap-2 p-2 lg:hidden">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Previous student"
          disabled={!onPrev}
          onClick={() => onPrev?.()}
        >
          <ChevronLeft className="size-5" />
        </Button>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => setOpen(true)}>
          <Users className="size-4" />
          {position ?? "Students"}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Next student"
          disabled={!onNext}
          onClick={() => onNext?.()}
        >
          <ChevronRight className="size-5" />
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="panel hidden max-h-[calc(100vh-12rem)] flex-col p-3 lg:sticky lg:top-6 lg:flex">
          {queuePanel}
        </aside>
        <div className="min-w-0 space-y-5">{children}</div>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="flex w-[min(22rem,90vw)] flex-col gap-3 p-4">
          <SheetHeader className="text-left">
            <SheetTitle>Students</SheetTitle>
          </SheetHeader>
          <div
            className="flex min-h-0 flex-1 flex-col"
            onClick={(e) => {
              if (
                (e.target as HTMLElement).closest("button[aria-selected], li[role=option] button")
              )
                setOpen(false);
            }}
          >
            {queuePanel}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
