import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { Document } from "@tiptap/extension-document";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Text } from "@tiptap/extension-text";
import { InlineMath, BlockMath } from "@tiptap/extension-mathematics";
import { Placeholder, TrailingNode, UndoRedo } from "@tiptap/extensions";
import "katex/dist/katex.min.css";
import { MathShortcuts } from "@/lib/math/mathShortcuts";
import { docToText, textToDoc } from "@/lib/math/textDoc";
import { cn } from "@/lib/utils";

export type MathTarget = { kind: "inline" | "block"; latex: string; pos: number };

export type RichMathEditorHandle = {
  insertMath: (latex: string, kind: "inline" | "block") => void;
  updateMath: (target: MathTarget, latex: string, kind: "inline" | "block") => void;
  deleteMath: (target: MathTarget) => void;
  focus: () => void;
};

type Props = {
  value: string;
  onChange: (text: string) => void;
  disabled?: boolean | undefined;
  placeholder?: string | undefined;
  allowAutocorrect?: boolean | undefined;
  /** Called when the student clicks an equation to edit it. */
  onEditMath: (target: MathTarget) => void;
  /** Paste/copy/cut/drag attempts are blocked and reported here. */
  onBlocked: (kind: string, label: string) => void;
  /** Image files dropped on the editor. Return true if they were handled. */
  onDropFiles?: ((files: FileList) => boolean) | undefined;
  className?: string | undefined;
};

const KATEX = { throwOnError: false, strict: false, trust: false } as const;

/**
 * The answer box. Looks like a text area but shows typed equations as formatted math.
 * The saved value is still plain text with $inline$ / $$block$$ delimiters.
 */
export const RichMathEditor = forwardRef<RichMathEditorHandle, Props>(function RichMathEditor(
  {
    value,
    onChange,
    disabled,
    placeholder,
    allowAutocorrect,
    onEditMath,
    onBlocked,
    onDropFiles,
    className,
  },
  ref,
) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onEditRef = useRef(onEditMath);
  onEditRef.current = onEditMath;
  const onBlockedRef = useRef(onBlocked);
  onBlockedRef.current = onBlocked;
  const onDropFilesRef = useRef(onDropFiles);
  onDropFilesRef.current = onDropFiles;
  const valueRef = useRef(value);
  valueRef.current = value;

  const editor = useEditor(
    {
      immediatelyRender: false,
      editable: !disabled,
      content: textToDoc(valueRef.current),
      extensions: [
        Document,
        Paragraph,
        Text,
        UndoRedo,
        TrailingNode,
        Placeholder.configure({ placeholder: placeholder ?? "" }),
        InlineMath.extend({ addInputRules: () => [] }).configure({
          katexOptions: KATEX,
          onClick: (node, pos) =>
            onEditRef.current({ kind: "inline", latex: String(node.attrs["latex"] ?? ""), pos }),
        }),
        BlockMath.extend({ addInputRules: () => [] }).configure({
          katexOptions: KATEX,
          onClick: (node, pos) =>
            onEditRef.current({ kind: "block", latex: String(node.attrs["latex"] ?? ""), pos }),
        }),
        MathShortcuts,
      ],
      editorProps: {
        attributes: {
          role: "textbox",
          "aria-multiline": "true",
          "aria-label": "Your answer",
          spellcheck: allowAutocorrect ? "true" : "false",
          autocorrect: allowAutocorrect ? "on" : "off",
          autocapitalize: allowAutocorrect ? "sentences" : "off",
        },
        handlePaste: () => {
          onBlockedRef.current("paste", "Pasting");
          return true;
        },
        handleDrop: (_view, event) => {
          event.preventDefault();
          const files = (event as DragEvent).dataTransfer?.files;
          if (files?.length && onDropFilesRef.current?.(files)) return true;
          onBlockedRef.current("drop", "Dropping text");
          return true;
        },
        handleKeyDown: (_view, event) => {
          const mod = event.ctrlKey || event.metaKey;
          const key = event.key.toLowerCase();
          if (mod && ["v", "c", "x"].includes(key)) {
            event.preventDefault();
            onBlockedRef.current(`key-${key}`, "That shortcut");
            return true;
          }
          return false;
        },
        handleDOMEvents: {
          copy: (_view, event) => {
            event.preventDefault();
            onBlockedRef.current("copy", "Copying");
            return true;
          },
          cut: (_view, event) => {
            event.preventDefault();
            onBlockedRef.current("cut", "Cutting");
            return true;
          },
          contextmenu: (_view, event) => {
            event.preventDefault();
            onBlockedRef.current("contextmenu", "The right-click menu");
            return true;
          },
          dragstart: (_view, event) => {
            event.preventDefault();
            onBlockedRef.current("dragstart", "Dragging text");
            return true;
          },
        },
      },
      onUpdate: ({ editor: ed }) => onChangeRef.current(docToText(ed.getJSON())),
    },
    [allowAutocorrect, placeholder],
  );

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  // Keep the editor in step when the value changes from outside (voice typing, restored drafts).
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (docToText(editor.getJSON()) === value) return;
    editor.commands.setContent(textToDoc(value), { emitUpdate: false });
  }, [editor, value]);

  useImperativeHandle(
    ref,
    () => ({
      insertMath(latex, kind) {
        const ed = editor as Editor | null;
        if (!ed) return;
        const chain = ed.chain().focus();
        if (kind === "block") chain.insertBlockMath({ latex }).run();
        else chain.insertInlineMath({ latex }).run();
      },
      updateMath(target, latex, kind) {
        const ed = editor as Editor | null;
        if (!ed) return;
        if (kind === target.kind) {
          const chain = ed.chain().focus();
          if (kind === "block") chain.updateBlockMath({ latex, pos: target.pos }).run();
          else chain.updateInlineMath({ latex, pos: target.pos }).run();
          return;
        }
        // Switching between inline and block: replace the node.
        const node = ed.state.doc.nodeAt(target.pos);
        if (!node) return;
        ed.chain()
          .focus()
          .deleteRange({ from: target.pos, to: target.pos + node.nodeSize })
          .run();
        const chain = ed.chain().focus();
        if (kind === "block") chain.insertBlockMath({ latex, pos: target.pos }).run();
        else chain.insertInlineMath({ latex, pos: target.pos }).run();
      },
      deleteMath(target) {
        const ed = editor as Editor | null;
        if (!ed) return;
        const chain = ed.chain().focus();
        if (target.kind === "block") chain.deleteBlockMath({ pos: target.pos }).run();
        else chain.deleteInlineMath({ pos: target.pos }).run();
      },
      focus() {
        editor?.commands.focus();
      },
    }),
    [editor],
  );

  return (
    <EditorContent
      editor={editor}
      className={cn(
        "math-editor min-h-[320px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base leading-7 shadow-sm focus-within:ring-1 focus-within:ring-ring md:text-sm",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    />
  );
});
