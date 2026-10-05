import { jsPDF } from "jspdf";
import { PAGE_W, PAGE_H, renderPage, type Ink, type Notebook } from "./engine";

const PRINT_INK: Ink = {
  bg: "#ffffff",
  line: "#dbe3ef",
  margin: "#f0b3b3",
  axis: "#64748b",
  text: "#0f172a",
};

/** Renders every notebook page to a raster page inside a single A4 PDF. */
export async function exportNotebookPdf(notebook: Notebook, title: string) {
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const scale = 2;

  notebook.pages.forEach((page, i) => {
    const canvas = document.createElement("canvas");
    canvas.width = PAGE_W * scale;
    canvas.height = PAGE_H * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(scale, scale);
    renderPage(ctx, page, PRINT_INK, { overlays: true });

    if (i > 0) doc.addPage();
    doc.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, pw, ph);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`${title} · page ${i + 1} of ${notebook.pages.length}`, 24, ph - 14);
  });

  doc.save(`${title.replace(/[^\w-]+/g, "-").slice(0, 60) || "notebook"}.pdf`);
}

/** Flattens one page to a PNG blob (used when attaching notebook pages to a submission). */
export function pageToBlob(notebook: Notebook, index: number, scale = 2): Promise<Blob | null> {
  return new Promise((resolve) => {
    const page = notebook.pages[index];
    if (!page) return resolve(null);
    const canvas = document.createElement("canvas");
    canvas.width = PAGE_W * scale;
    canvas.height = PAGE_H * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return resolve(null);
    ctx.scale(scale, scale);
    renderPage(ctx, page, PRINT_INK, { overlays: true });
    canvas.toBlob((b) => resolve(b), "image/png");
  });
}
