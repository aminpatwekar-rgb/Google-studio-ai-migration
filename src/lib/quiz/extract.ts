/**
 * Study-material extraction. Runs entirely in the browser so raw files never
 * leave the device — only the extracted text is sent to the AI generator.
 * All heavy parsers are dynamically imported so they stay out of the SSR graph.
 */

export const ACCEPTED_MATERIAL = ".pdf,.docx,.doc,.ppt,.pptx,.txt,.md,application/pdf,text/plain";

export const MAX_MATERIAL_BYTES = 20 * 1024 * 1024;

function xmlText(xml: string) {
  return xml
    .replace(/<\/w:p>|<\/a:p>|<\/w:tr>/g, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function fromZipXml(file: File, match: (name: string) => boolean) {
  const { unzipSync, strFromU8 } = await import("fflate");
  const buf = new Uint8Array(await file.arrayBuffer());
  const files = unzipSync(buf);
  const names = Object.keys(files)
    .filter(match)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const parts = names.map((n) => xmlText(strFromU8(files[n]!)));
  return parts.filter(Boolean).join("\n\n");
}

async function fromPdf(file: File) {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .map((it) =>
          typeof (it as { str?: string }).str === "string" ? (it as { str: string }).str : "",
        )
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    );
  }
  await doc.cleanup();
  return pages.filter(Boolean).join("\n\n");
}

export class UnsupportedMaterialError extends Error {}

export async function extractMaterial(file: File): Promise<string> {
  if (file.size > MAX_MATERIAL_BYTES) {
    throw new UnsupportedMaterialError("That file is larger than 20 MB.");
  }
  const name = file.name.toLowerCase();

  if (name.endsWith(".txt") || name.endsWith(".md") || file.type.startsWith("text/")) {
    return (await file.text()).trim();
  }
  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    return fromPdf(file);
  }
  if (name.endsWith(".docx")) {
    return fromZipXml(file, (n) => n === "word/document.xml" || n.startsWith("word/footnotes"));
  }
  if (name.endsWith(".pptx")) {
    return fromZipXml(file, (n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  }
  if (name.endsWith(".doc") || name.endsWith(".ppt")) {
    throw new UnsupportedMaterialError(
      "Legacy .doc / .ppt files aren't readable — please save as .docx or .pptx and try again.",
    );
  }
  throw new UnsupportedMaterialError("Unsupported file type. Use PDF, DOCX, PPTX or TXT.");
}
