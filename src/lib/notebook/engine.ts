/** Notebook page model + canvas rendering + safe function plotting. */

export const PAGE_W = 794; // A4 at 96dpi
export const PAGE_H = 1123;
export const RULE_GAP = 34;

export type Pt = { x: number; y: number; p: number };

export type Tool =
  "pen" | "pencil" | "highlighter" | "eraser" | "line" | "arrow" | "rect" | "ellipse" | "diamond";

export type Stroke = {
  id: string;
  tool: "pen" | "pencil" | "highlighter" | "eraser";
  color: string;
  size: number;
  points: Pt[];
};

export type Shape = {
  id: string;
  kind: "line" | "arrow" | "rect" | "ellipse" | "diamond";
  color: string;
  size: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type Overlay = {
  id: string;
  type: "text" | "math";
  x: number;
  y: number;
  value: string;
  size: number;
};

export type Plot = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  expr: string; // empty = blank coordinate plane
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  color: string;
};

export type NotebookPage = {
  id: string;
  paper: "ruled" | "grid" | "plain";
  strokes: Stroke[];
  shapes: Shape[];
  overlays: Overlay[];
  plots: Plot[];
};

export type Notebook = { version: 1; pages: NotebookPage[] };

export function blankPage(paper: NotebookPage["paper"] = "ruled"): NotebookPage {
  return {
    id: crypto.randomUUID(),
    paper,
    strokes: [],
    shapes: [],
    overlays: [],
    plots: [],
  };
}

export function emptyNotebook(): Notebook {
  return { version: 1, pages: [blankPage()] };
}

export function isNotebook(v: unknown): v is Notebook {
  return (
    typeof v === "object" &&
    v !== null &&
    Array.isArray((v as Notebook).pages) &&
    (v as Notebook).version === 1
  );
}

/* ------------------------------------------------------------------ maths */

const FUNCS: Record<string, (n: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  sqrt: Math.sqrt,
  abs: Math.abs,
  ln: Math.log,
  log: Math.log10,
  exp: Math.exp,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
};

/**
 * Compiles `y = f(x)` from a restricted expression grammar.
 * Only digits, x, whitelisted function names and arithmetic survive validation,
 * so nothing arbitrary reaches the evaluator.
 */
export function compileExpression(raw: string): ((x: number) => number) | null {
  const src = raw.trim();
  if (!src) return null;
  const names = [...Object.keys(FUNCS), "pi", "e", "x"];
  const stripped = src.replace(new RegExp(`\\b(${names.join("|")})\\b`, "g"), "");
  if (/[^0-9+\-*/^().,%\s]/.test(stripped)) return null;

  let js = src.replace(/\^/g, "**");
  for (const name of Object.keys(FUNCS)) {
    js = js.replace(new RegExp(`\\b${name}\\s*\\(`, "g"), `F.${name}(`);
  }
  js = js.replace(/\bpi\b/g, "Math.PI").replace(/\be\b/g, "Math.E");

  try {
    const fn = new Function("F", "x", `"use strict"; return (${js});`) as (
      f: typeof FUNCS,
      x: number,
    ) => number;
    const probe = fn(FUNCS, 1);
    if (typeof probe !== "number") return null;
    return (x: number) => {
      try {
        const v = fn(FUNCS, x);
        return typeof v === "number" ? v : NaN;
      } catch {
        return NaN;
      }
    };
  } catch {
    return null;
  }
}

/* --------------------------------------------------------------- painting */

export function drawPaper(
  ctx: CanvasRenderingContext2D,
  paper: NotebookPage["paper"],
  ink: { line: string; margin: string; bg: string },
) {
  ctx.fillStyle = ink.bg;
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  if (paper === "plain") return;

  ctx.lineWidth = 1;
  ctx.strokeStyle = ink.line;
  if (paper === "ruled") {
    for (let y = RULE_GAP * 2; y < PAGE_H; y += RULE_GAP) {
      ctx.beginPath();
      ctx.moveTo(48, y);
      ctx.lineTo(PAGE_W - 32, y);
      ctx.stroke();
    }
    ctx.strokeStyle = ink.margin;
    ctx.beginPath();
    ctx.moveTo(72, 24);
    ctx.lineTo(72, PAGE_H - 24);
    ctx.stroke();
  } else {
    const gap = 26;
    for (let x = gap; x < PAGE_W; x += gap) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, PAGE_H);
      ctx.stroke();
    }
    for (let y = gap; y < PAGE_H; y += gap) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(PAGE_W, y);
      ctx.stroke();
    }
  }
}

function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
  if (s.points.length === 0) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (s.tool === "eraser") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "rgba(0,0,0,1)";
  } else {
    ctx.strokeStyle = s.color;
    if (s.tool === "highlighter") {
      ctx.globalAlpha = 0.28;
      ctx.lineCap = "butt";
    }
    if (s.tool === "pencil") ctx.globalAlpha = 0.75;
  }

  if (s.points.length === 1) {
    const p = s.points[0]!;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.6, (s.size * p.p) / 2), 0, Math.PI * 2);
    ctx.fillStyle = s.tool === "eraser" ? "rgba(0,0,0,1)" : s.color;
    ctx.fill();
    ctx.restore();
    return;
  }

  for (let i = 1; i < s.points.length; i++) {
    const a = s.points[i - 1]!;
    const b = s.points[i]!;
    ctx.beginPath();
    ctx.lineWidth = Math.max(0.5, s.size * ((a.p + b.p) / 2));
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawShape(ctx: CanvasRenderingContext2D, s: Shape) {
  ctx.save();
  ctx.strokeStyle = s.color;
  ctx.lineWidth = s.size;
  ctx.lineJoin = "round";
  const { x1, y1, x2, y2 } = s;
  ctx.beginPath();
  if (s.kind === "line" || s.kind === "arrow") {
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    if (s.kind === "arrow") {
      const ang = Math.atan2(y2 - y1, x2 - x1);
      const head = 10 + s.size * 2;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - head * Math.cos(ang - 0.4), y2 - head * Math.sin(ang - 0.4));
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - head * Math.cos(ang + 0.4), y2 - head * Math.sin(ang + 0.4));
      ctx.stroke();
    }
  } else if (s.kind === "rect") {
    ctx.rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    ctx.stroke();
  } else if (s.kind === "ellipse") {
    ctx.ellipse(
      (x1 + x2) / 2,
      (y1 + y2) / 2,
      Math.abs(x2 - x1) / 2,
      Math.abs(y2 - y1) / 2,
      0,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
  } else {
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    ctx.moveTo(cx, y1);
    ctx.lineTo(x2, cy);
    ctx.lineTo(cx, y2);
    ctx.lineTo(x1, cy);
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
}

function drawPlot(ctx: CanvasRenderingContext2D, p: Plot, axis: string) {
  const { x, y, w, h, xMin, xMax, yMin, yMax } = p;
  const sx = (vx: number) => x + ((vx - xMin) / (xMax - xMin)) * w;
  const sy = (vy: number) => y + h - ((vy - yMin) / (yMax - yMin)) * h;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  ctx.strokeStyle = axis;
  ctx.globalAlpha = 0.28;
  ctx.lineWidth = 1;
  for (let v = Math.ceil(xMin); v <= xMax; v++) {
    ctx.beginPath();
    ctx.moveTo(sx(v), y);
    ctx.lineTo(sx(v), y + h);
    ctx.stroke();
  }
  for (let v = Math.ceil(yMin); v <= yMax; v++) {
    ctx.beginPath();
    ctx.moveTo(x, sy(v));
    ctx.lineTo(x + w, sy(v));
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x, sy(0));
  ctx.lineTo(x + w, sy(0));
  ctx.moveTo(sx(0), y);
  ctx.lineTo(sx(0), y + h);
  ctx.stroke();

  ctx.font = "11px ui-sans-serif, system-ui";
  ctx.fillStyle = axis;
  for (let v = Math.ceil(xMin); v <= xMax; v++) {
    if (v === 0) continue;
    ctx.fillText(String(v), sx(v) - 3, sy(0) + 12);
  }
  for (let v = Math.ceil(yMin); v <= yMax; v++) {
    if (v === 0) continue;
    ctx.fillText(String(v), sx(0) + 4, sy(v) + 4);
  }

  const f = compileExpression(p.expr);
  if (f) {
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let pen = false;
    for (let px = 0; px <= w; px++) {
      const vx = xMin + (px / w) * (xMax - xMin);
      const vy = f(vx);
      if (!Number.isFinite(vy)) {
        pen = false;
        continue;
      }
      const py = sy(vy);
      if (py < y - h || py > y + 2 * h) {
        pen = false;
        continue;
      }
      if (pen) ctx.lineTo(x + px, py);
      else ctx.moveTo(x + px, py);
      pen = true;
    }
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = axis;
  ctx.globalAlpha = 0.5;
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}

export type Ink = { line: string; margin: string; bg: string; axis: string; text: string };

export function renderPage(
  ctx: CanvasRenderingContext2D,
  page: NotebookPage,
  ink: Ink,
  opts: { overlays?: boolean } = {},
) {
  drawPaper(ctx, page.paper, ink);
  for (const p of page.plots) drawPlot(ctx, p, ink.axis);
  for (const s of page.strokes) drawStroke(ctx, s);
  for (const s of page.shapes) drawShape(ctx, s);
  if (opts.overlays) {
    for (const o of page.overlays) {
      ctx.save();
      ctx.fillStyle = ink.text;
      ctx.font =
        o.type === "math"
          ? `italic ${o.size}px "Times New Roman", serif`
          : `${o.size}px ui-sans-serif, system-ui`;
      o.value.split("\n").forEach((line, i) => {
        ctx.fillText(line, o.x, o.y + o.size + i * (o.size * 1.35));
      });
      ctx.restore();
    }
  }
}
