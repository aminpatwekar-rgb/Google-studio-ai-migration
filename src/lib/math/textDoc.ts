import type { JSONContent } from "@tiptap/core";
import { MATH_PATTERN } from "@/lib/math/delimiters";

/**
 * Answers are stored as plain text with $inline$ and $$block$$ math. These helpers
 * convert between that text and the editor document so students see rendered
 * equations while the saved format (and the teacher's view) stays unchanged.
 */

export function textToDoc(text: string): JSONContent {
  const content: JSONContent[] = [];
  let current: JSONContent[] = [];
  let afterBlock = false;

  const flush = () => {
    content.push(current.length ? { type: "paragraph", content: current } : { type: "paragraph" });
    current = [];
  };

  const addText = (raw: string) => {
    let value = raw.replace(/\r\n?/g, "\n");
    // The newline that separates a text run from a block equation is not content.
    if (afterBlock) {
      value = value.replace(/^\n/, "");
      afterBlock = false;
    }
    const lines = value.split("\n");
    lines.forEach((line, i) => {
      if (i > 0) flush();
      if (line) current.push({ type: "text", text: line });
    });
  };

  const pattern = new RegExp(MATH_PATTERN.source, "g");
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) addText(text.slice(cursor, index));
    else afterBlock = false;

    if (match[1] !== undefined) {
      if (current.length) flush();
      content.push({ type: "blockMath", attrs: { latex: match[1].trim() } });
      afterBlock = true;
    } else if (match[2] !== undefined) {
      afterBlock = false;
      current.push({ type: "inlineMath", attrs: { latex: match[2] } });
    }
    cursor = index + match[0].length;
  }
  if (cursor < text.length) addText(text.slice(cursor));

  // Always leave a paragraph to type into, including after a trailing block equation.
  if (current.length || content.length === 0 || content[content.length - 1]?.type === "blockMath") {
    flush();
  }
  return { type: "doc", content };
}

export function docToText(doc: JSONContent): string {
  const lines = (doc.content ?? []).map((node) => {
    if (node.type === "blockMath") return `$$${node.attrs?.["latex"] ?? ""}$$`;
    return (node.content ?? [])
      .map((child) => {
        if (child.type === "text") return child.text ?? "";
        if (child.type === "inlineMath") return `$${child.attrs?.["latex"] ?? ""}$`;
        return "";
      })
      .join("");
  });
  return lines.join("\n");
}
