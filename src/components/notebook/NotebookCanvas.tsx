import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Circle,
  Diamond,
  Download,
  Eraser,
  Highlighter,
  LineChart,
  Minus,
  MoveRight,
  Pen,
  Pencil,
  Plus,
  Redo2,
  Sigma,
  Square,
  Trash2,
  Type,
  Undo2,
  MousePointer2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MathPreview } from "@/components/math/MathPreview";
import { MathEditor } from "@/components/math/MathEditor";
import { cn } from "@/lib/utils";
import {
  PAGE_H,
  PAGE_W,
  blankPage,
  renderPage,
  type Ink,
  type Notebook,
  type NotebookPage,
  type Overlay,
  type Plot,
  type Pt,
  type Shape,
  type Stroke,
} from "@/lib/notebook/engine";
import { exportNotebookPdf } from "@/lib/notebook/pdf";

const LIGHT_INK: Ink = {
  bg: "#ffffff",
  line: "#dbe3ef",
  margin: "#f0b3b3",
  axis: "#64748b",
  text: "#0f172a",
};
const DARK_INK: Ink = {
  bg: "#12141a",
  line: "#262b36",
  margin: "#4a2b33",
  axis: "#94a3b8",
  text: "#e7e9ee",
};

const INK_COLORS = ["#1d4ed8", "#0f172a", "#dc2626", "#15803d", "#a855f7", "#ea580c"];

type Mode = "select" | "text" | "math" | Stroke["tool"] | Shape["kind"];

const PEN_TOOLS: Stroke["tool"][] = ["pen", "pencil", "highlighter", "eraser"];
const SHAPE_TOOLS: Shape["kind"][] = ["line", "arrow", "rect", "ellipse", "diamond"];

function useIsDark() {
  const [dark, setDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    const el = document.documentElement;
    const obs = new MutationObserver(() => setDark(el.classList.contains("dark")));
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

export function NotebookCanvas({
  value,
  onChange,
  readOnly = false,
  title = "Notebook",
}: {
  value: Notebook;
  onChange?: (next: Notebook) => void;
  readOnly?: boolean;
  title?: string;
}) {
  const dark = useIsDark();
  const ink = dark ? DARK_INK : LIGHT_INK;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const drawing = useRef<Stroke | null>(null);
  const shaping = useRef<Shape | null>(null);
  const dragging = useRef<{ id: string; kind: "overlay" | "plot"; dx: number; dy: number } | null>(
    null,
  );

  const [pageIndex, setPageIndex] = useState(0);
  const [mode, setMode] = useState<Mode>("pen");
  const [color, setColor] = useState(INK_COLORS[0]!);
  const [size, setSize] = useState(2.5);
  const [scale, setScale] = useState(1);
  const [past, setPast] = useState<Notebook[]>([]);
  const [future, setFuture] = useState<Notebook[]>([]);
  const [textDraft, setTextDraft] = useState<{
    id?: string;
    x: number;
    y: number;
    value: string;
  } | null>(null);
  const [mathDraft, setMathDraft] = useState<{
    id?: string;
    x: number;
    y: number;
    value: string;
  } | null>(null);
  const [plotDraft, setPlotDraft] = useState<Omit<Plot, "id"> | null>(null);

  const page = value.pages[Math.min(pageIndex, value.pages.length - 1)] ?? blankPage();

  /* ---------------------------------------------------------- persistence */

  const commit = useCallback(
    (mutate: (p: NotebookPage) => NotebookPage, options: { history?: boolean } = {}) => {
      if (!onChange) return;
      if (options.history !== false) {
        setPast((p) => [...p.slice(-40), value]);
        setFuture([]);
      }
      onChange({
        ...value,
        pages: value.pages.map((p, i) => (i === pageIndex ? mutate(p) : p)),
      });
    },
    [onChange, pageIndex, value],
  );

  function undo() {
    const prev = past[past.length - 1];
    if (!prev || !onChange) return;
    setPast((p) => p.slice(0, -1));
    setFuture((f) => [value, ...f].slice(0, 40));
    onChange(prev);
  }

  function redo() {
    const next = future[0];
    if (!next || !onChange) return;
    setFuture((f) => f.slice(1));
    setPast((p) => [...p, value]);
    onChange(next);
  }

  /* -------------------------------------------------------------- drawing */

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);
    canvas.width = PAGE_W * dpr;
    canvas.height = PAGE_H * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderPage(ctx, page, ink);
  }, [page, ink]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / PAGE_W);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  function toPage(e: React.PointerEvent): Pt {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * PAGE_W,
      y: ((e.clientY - rect.top) / rect.height) * PAGE_H,
      p: e.pointerType === "pen" && e.pressure > 0 ? 0.4 + e.pressure * 1.2 : 1,
    };
  }

  function paintLive() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    const live: NotebookPage = {
      ...page,
      strokes: drawing.current ? [...page.strokes, drawing.current] : page.strokes,
      shapes: shaping.current ? [...page.shapes, shaping.current] : page.shapes,
    };
    renderPage(ctx, live, ink);
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (readOnly) return;
    const pt = toPage(e);

    if (mode === "text") {
      setTextDraft({ x: pt.x, y: pt.y, value: "" });
      return;
    }
    if (mode === "math") {
      setMathDraft({ x: pt.x, y: pt.y, value: "" });
      return;
    }
    if (mode === "select") return;

    e.currentTarget.setPointerCapture(e.pointerId);
    if (PEN_TOOLS.includes(mode as Stroke["tool"])) {
      drawing.current = {
        id: crypto.randomUUID(),
        tool: mode as Stroke["tool"],
        color,
        size: mode === "highlighter" ? size * 6 : size,
        points: [pt],
      };
    } else if (SHAPE_TOOLS.includes(mode as Shape["kind"])) {
      shaping.current = {
        id: crypto.randomUUID(),
        kind: mode as Shape["kind"],
        color,
        size,
        x1: pt.x,
        y1: pt.y,
        x2: pt.x,
        y2: pt.y,
      };
    }
    paintLive();
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (readOnly) return;
    if (!drawing.current && !shaping.current) return;
    const pt = toPage(e);
    if (drawing.current) drawing.current.points.push(pt);
    if (shaping.current) {
      shaping.current.x2 = pt.x;
      shaping.current.y2 = pt.y;
    }
    paintLive();
  }

  function onPointerUp() {
    if (readOnly) return;
    const stroke = drawing.current;
    const shape = shaping.current;
    drawing.current = null;
    shaping.current = null;
    if (stroke) commit((p) => ({ ...p, strokes: [...p.strokes, stroke] }));
    else if (shape) commit((p) => ({ ...p, shapes: [...p.shapes, shape] }));
  }

  /* ------------------------------------------------------------- overlays */

  function saveText() {
    if (!textDraft) return;
    const body = textDraft.value.trim();
    const id = textDraft.id;
    setTextDraft(null);
    if (!body) {
      if (id) commit((p) => ({ ...p, overlays: p.overlays.filter((o) => o.id !== id) }));
      return;
    }
    commit((p) => ({
      ...p,
      overlays: id
        ? p.overlays.map((o) => (o.id === id ? { ...o, value: body } : o))
        : [
            ...p.overlays,
            {
              id: crypto.randomUUID(),
              type: "text",
              x: textDraft.x,
              y: textDraft.y,
              value: body,
              size: 18,
            } as Overlay,
          ],
    }));
  }

  function saveMath() {
    if (!mathDraft) return;
    const body = mathDraft.value.trim();
    const id = mathDraft.id;
    setMathDraft(null);
    if (!body) {
      if (id) commit((p) => ({ ...p, overlays: p.overlays.filter((o) => o.id !== id) }));
      return;
    }
    commit((p) => ({
      ...p,
      overlays: id
        ? p.overlays.map((o) => (o.id === id ? { ...o, value: body } : o))
        : [
            ...p.overlays,
            {
              id: crypto.randomUUID(),
              type: "math",
              x: mathDraft.x,
              y: mathDraft.y,
              value: body,
              size: 20,
            } as Overlay,
          ],
    }));
  }

  function startDrag(
    e: React.PointerEvent,
    id: string,
    kind: "overlay" | "plot",
    x: number,
    y: number,
  ) {
    if (readOnly || mode !== "select") return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragging.current = {
      id,
      kind,
      dx: ((e.clientX - rect.left) / rect.width) * PAGE_W - x,
      dy: ((e.clientY - rect.top) / rect.height) * PAGE_H - y,
    };
  }

  function moveDrag(e: React.PointerEvent) {
    const d = dragging.current;
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!d || !rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * PAGE_W - d.dx;
    const y = ((e.clientY - rect.top) / rect.height) * PAGE_H - d.dy;
    commit(
      (p) =>
        d.kind === "overlay"
          ? { ...p, overlays: p.overlays.map((o) => (o.id === d.id ? { ...o, x, y } : o)) }
          : { ...p, plots: p.plots.map((pl) => (pl.id === d.id ? { ...pl, x, y } : pl)) },
      { history: false },
    );
  }

  /* ----------------------------------------------------------------- pages */

  function addPage() {
    if (!onChange) return;
    setPast((p) => [...p, value]);
    onChange({ ...value, pages: [...value.pages, blankPage(page.paper)] });
    setPageIndex(value.pages.length);
  }

  function deletePage() {
    if (!onChange || value.pages.length === 1) return;
    setPast((p) => [...p, value]);
    onChange({ ...value, pages: value.pages.filter((_, i) => i !== pageIndex) });
    setPageIndex((i) => Math.max(0, i - 1));
  }

  const overlays = useMemo(() => page.overlays, [page.overlays]);

  const toolButton = (key: Mode, icon: React.ReactNode, label: string) => (
    <Button
      key={key}
      type="button"
      size="icon"
      variant={mode === key ? "default" : "outline"}
      className="size-9"
      title={label}
      aria-label={label}
      aria-pressed={mode === key}
      onClick={() => setMode(key)}
    >
      {icon}
    </Button>
  );

  return (
    <div className="space-y-3">
      {!readOnly && (
        <div className="panel flex flex-wrap items-center gap-2 rounded-xl p-2">
          <div className="flex flex-wrap gap-1.5">
            {toolButton("select", <MousePointer2 className="size-4" />, "Select & move")}
            {toolButton("pen", <Pen className="size-4" />, "Pen")}
            {toolButton("pencil", <Pencil className="size-4" />, "Pencil")}
            {toolButton("highlighter", <Highlighter className="size-4" />, "Highlighter")}
            {toolButton("eraser", <Eraser className="size-4" />, "Eraser")}
          </div>
          <span className="mx-1 h-6 w-px bg-border" />
          <div className="flex flex-wrap gap-1.5">
            {toolButton("line", <Minus className="size-4" />, "Line")}
            {toolButton("arrow", <MoveRight className="size-4" />, "Arrow")}
            {toolButton("rect", <Square className="size-4" />, "Rectangle")}
            {toolButton("ellipse", <Circle className="size-4" />, "Ellipse")}
            {toolButton("diamond", <Diamond className="size-4" />, "Decision (flowchart)")}
          </div>
          <span className="mx-1 h-6 w-px bg-border" />
          <div className="flex flex-wrap gap-1.5">
            {toolButton("text", <Type className="size-4" />, "Text box")}
            {toolButton("math", <Sigma className="size-4" />, "Equation")}
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="size-9"
              title="Insert graph or coordinate plane"
              aria-label="Insert graph"
              onClick={() =>
                setPlotDraft({
                  x: 90,
                  y: 160,
                  w: 480,
                  h: 320,
                  expr: "sin(x)",
                  xMin: -6,
                  xMax: 6,
                  yMin: -3,
                  yMax: 3,
                  color: color,
                })
              }
            >
              <LineChart className="size-4" />
            </Button>
          </div>

          <span className="mx-1 h-6 w-px bg-border" />
          <div className="flex items-center gap-1.5">
            {INK_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Ink colour ${c}`}
                onClick={() => setColor(c)}
                className={cn(
                  "size-6 rounded-full border-2 transition-transform",
                  color === c ? "scale-110 border-foreground" : "border-transparent",
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>

          <div className="flex min-w-32 items-center gap-2 px-1">
            <span className="text-xs text-muted-foreground">Size</span>
            <Slider
              value={[size]}
              min={1}
              max={10}
              step={0.5}
              onValueChange={(v) => setSize(v[0] ?? 2)}
              className="w-24"
            />
          </div>

          <Select
            value={page.paper}
            onValueChange={(v) => commit((p) => ({ ...p, paper: v as NotebookPage["paper"] }))}
          >
            <SelectTrigger className="h-9 w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ruled">Ruled</SelectItem>
              <SelectItem value="grid">Grid</SelectItem>
              <SelectItem value="plain">Plain</SelectItem>
            </SelectContent>
          </Select>

          <div className="ml-auto flex items-center gap-1.5">
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="size-9"
              onClick={undo}
              disabled={past.length === 0}
              aria-label="Undo"
            >
              <Undo2 className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="size-9"
              onClick={redo}
              disabled={future.length === 0}
              aria-label="Redo"
            >
              <Redo2 className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="size-9"
              aria-label="Clear page"
              title="Clear page"
              onClick={() =>
                commit((p) => ({ ...p, strokes: [], shapes: [], overlays: [], plots: [] }))
              }
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      )}

      <div
        ref={wrapRef}
        className="relative w-full overflow-hidden rounded-xl border border-border shadow-sm"
        style={{ aspectRatio: `${PAGE_W} / ${PAGE_H}` }}
        onPointerMove={moveDrag}
        onPointerUp={() => (dragging.current = null)}
      >
        <canvas
          ref={canvasRef}
          className={cn(
            "absolute inset-0 h-full w-full touch-none",
            readOnly || mode === "select" ? "cursor-default" : "cursor-crosshair",
          )}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        />

        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{ width: PAGE_W, height: PAGE_H, transform: `scale(${scale})` }}
        >
          {page.plots.map((pl) => (
            <div
              key={pl.id}
              className={cn(
                "absolute",
                mode === "select" && !readOnly ? "cursor-move" : "pointer-events-none",
              )}
              style={{ left: pl.x, top: pl.y, width: pl.w, height: pl.h }}
              onPointerDown={(e) => startDrag(e, pl.id, "plot", pl.x, pl.y)}
            >
              {mode === "select" && !readOnly && (
                <button
                  type="button"
                  className="absolute -right-2 -top-2 rounded-full border border-border bg-background p-1 shadow"
                  aria-label="Remove graph"
                  onClick={() =>
                    commit((p) => ({ ...p, plots: p.plots.filter((x) => x.id !== pl.id) }))
                  }
                >
                  <Trash2 className="size-3" />
                </button>
              )}
            </div>
          ))}

          {overlays.map((o) => (
            <div
              key={o.id}
              className={cn(
                "absolute max-w-[600px] rounded px-1",
                mode === "select" && !readOnly
                  ? "cursor-move ring-1 ring-dashed ring-border"
                  : "pointer-events-none",
              )}
              style={{ left: o.x, top: o.y, color: LIGHT_INK.text }}
              onPointerDown={(e) => startDrag(e, o.id, "overlay", o.x, o.y)}
              onDoubleClick={() => {
                if (readOnly) return;
                if (o.type === "text") setTextDraft({ id: o.id, x: o.x, y: o.y, value: o.value });
                else setMathDraft({ id: o.id, x: o.x, y: o.y, value: o.value });
              }}
            >
              {o.type === "text" ? (
                <p
                  className="whitespace-pre-wrap text-slate-900 dark:text-slate-100"
                  style={{ fontSize: o.size, lineHeight: 1.35 }}
                >
                  {o.value}
                </p>
              ) : (
                <div className="text-slate-900 dark:text-slate-100">
                  <MathPreview latex={o.value} display={false} />
                </div>
              )}
              {mode === "select" && !readOnly && (
                <button
                  type="button"
                  className="absolute -right-3 -top-3 rounded-full border border-border bg-background p-1 shadow"
                  aria-label="Remove item"
                  onClick={() =>
                    commit((p) => ({ ...p, overlays: p.overlays.filter((x) => x.id !== o.id) }))
                  }
                >
                  <Trash2 className="size-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-9"
          aria-label="Previous page"
          disabled={pageIndex === 0}
          onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="text-sm text-muted-foreground">
          Page {Math.min(pageIndex + 1, value.pages.length)} of {value.pages.length}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-9"
          aria-label="Next page"
          disabled={pageIndex >= value.pages.length - 1}
          onClick={() => setPageIndex((i) => Math.min(value.pages.length - 1, i + 1))}
        >
          <ChevronRight className="size-4" />
        </Button>

        {!readOnly && (
          <>
            <Button type="button" variant="outline" size="sm" onClick={addPage}>
              <Plus className="mr-1.5 size-4" /> Add page
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={deletePage}
              disabled={value.pages.length === 1}
            >
              <Trash2 className="mr-1.5 size-4" /> Delete page
            </Button>
          </>
        )}

        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="ml-auto"
          onClick={async () => {
            try {
              await exportNotebookPdf(value, title);
              toast.success("PDF exported");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Export failed");
            }
          }}
        >
          <Download className="mr-1.5 size-4" /> Export PDF
        </Button>
      </div>

      {/* Text box editor */}
      <Dialog open={!!textDraft} onOpenChange={(o) => !o && setTextDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Text box</DialogTitle>
            <DialogDescription>Typed text sits on top of your handwriting.</DialogDescription>
          </DialogHeader>
          <Textarea
            autoFocus
            value={textDraft?.value ?? ""}
            onChange={(e) => setTextDraft((d) => (d ? { ...d, value: e.target.value } : d))}
            className="min-h-32"
            placeholder="Type here…"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTextDraft(null)}>
              Cancel
            </Button>
            <Button onClick={saveText}>Save text</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Equation editor */}
      <Dialog open={!!mathDraft} onOpenChange={(o) => !o && setMathDraft(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Equation</DialogTitle>
            <DialogDescription>
              Build with the toolbar or type LaTeX directly. Chemistry uses mhchem syntax.
            </DialogDescription>
          </DialogHeader>
          <MathEditor
            value={mathDraft?.value ?? ""}
            onChange={(v) => setMathDraft((d) => (d ? { ...d, value: v } : d))}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMathDraft(null)}>
              Cancel
            </Button>
            <Button onClick={saveMath}>Insert equation</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Graph builder */}
      <Dialog open={!!plotDraft} onOpenChange={(o) => !o && setPlotDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Graph & coordinate plane</DialogTitle>
            <DialogDescription>
              Leave the function empty for a blank coordinate plane.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="plot-expr">y =</Label>
              <Input
                id="plot-expr"
                value={plotDraft?.expr ?? ""}
                onChange={(e) => setPlotDraft((d) => (d ? { ...d, expr: e.target.value } : d))}
                placeholder="x^2 - 2*x + 1"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Supports + - * / ^, sin, cos, tan, sqrt, abs, ln, log, exp, pi, e.
              </p>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {(["xMin", "xMax", "yMin", "yMax"] as const).map((k) => (
                <div key={k} className="space-y-1.5">
                  <Label htmlFor={`plot-${k}`} className="text-xs">
                    {k}
                  </Label>
                  <Input
                    id={`plot-${k}`}
                    type="number"
                    value={plotDraft?.[k] ?? 0}
                    onChange={(e) =>
                      setPlotDraft((d) => (d ? { ...d, [k]: Number(e.target.value) } : d))
                    }
                  />
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPlotDraft(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!plotDraft) return;
                if (plotDraft.xMax <= plotDraft.xMin || plotDraft.yMax <= plotDraft.yMin) {
                  toast.error("Axis maximum must be greater than the minimum");
                  return;
                }
                const plot: Plot = { ...plotDraft, id: crypto.randomUUID() };
                setPlotDraft(null);
                commit((p) => ({ ...p, plots: [...p.plots, plot] }));
              }}
            >
              Insert graph
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
