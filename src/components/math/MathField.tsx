import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { MathfieldElement } from "mathlive";
import "mathlive/fonts.css";
import { cn } from "@/lib/utils";

export type MathFieldHandle = {
  /** Insert LaTeX at the caret. Returns false while the field is still loading. */
  insert: (latex: string) => boolean;
  focus: () => void;
};

type Props = {
  value: string;
  onChange: (latex: string) => void;
  placeholder?: string | undefined;
  className?: string | undefined;
  autoFocus?: boolean | undefined;
  /** Called when the field is ready (true) or MathLive could not load (false). */
  onStatus?: ((available: boolean) => void) | undefined;
  /** When set, copy/cut/paste/drop/right-click are blocked and reported here. */
  onClipboardBlocked?: ((kind: string, label: string) => void) | undefined;
};

/**
 * A visual equation box (MathLive). Students type naturally — x^2 for powers, / for
 * fractions, sqrt for roots — and see the formatted equation as they type.
 * MathLive touches `window`, so it is loaded in the browser only.
 */
export const MathField = forwardRef<MathFieldHandle, Props>(function MathField(
  { value, onChange, placeholder, className, autoFocus, onStatus, onClipboardBlocked },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<MathfieldElement | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const blockedRef = useRef(onClipboardBlocked);
  blockedRef.current = onClipboardBlocked;
  const statusRef = useRef(onStatus);
  statusRef.current = onStatus;
  const valueRef = useRef(value);
  valueRef.current = value;

  useImperativeHandle(ref, () => ({
    insert(latex) {
      const mf = fieldRef.current;
      if (!mf) return false;
      mf.insert(latex, { format: "latex", focus: true, feedback: false, mode: "math" });
      onChangeRef.current(mf.value);
      return true;
    },
    focus() {
      fieldRef.current?.focus();
    },
  }));

  useEffect(() => {
    let cancelled = false;
    let mf: MathfieldElement | null = null;
    const cleanups: Array<() => void> = [];

    import("mathlive")
      .then(({ MathfieldElement }) => {
        if (cancelled || !hostRef.current) return;
        // Fonts come from the bundled stylesheet; sounds and the on-screen keyboard are off
        // so the field behaves inside dialogs and on phones.
        MathfieldElement.fontsDirectory = null;
        MathfieldElement.soundsDirectory = null;

        mf = new MathfieldElement();
        mf.mathVirtualKeyboardPolicy = "manual";
        mf.letterShapeStyle = "tex";
        mf.smartFence = true;
        mf.setAttribute("aria-label", "Equation");
        if (placeholder) mf.setAttribute("placeholder", placeholder);
        mf.value = valueRef.current;

        const handleInput = () => onChangeRef.current(mf!.value);
        mf.addEventListener("input", handleInput);
        cleanups.push(() => mf?.removeEventListener("input", handleInput));

        const guard = (kind: string, label: string) => (e: Event) => {
          if (!blockedRef.current) return;
          e.preventDefault();
          e.stopPropagation();
          blockedRef.current(kind, label);
        };
        for (const [event, kind, label] of [
          ["paste", "paste", "Pasting"],
          ["copy", "copy", "Copying"],
          ["cut", "cut", "Cutting"],
          ["drop", "drop", "Dropping text"],
          ["contextmenu", "contextmenu", "The right-click menu"],
        ] as const) {
          const handler = guard(kind, label);
          mf.addEventListener(event, handler, true);
          cleanups.push(() => mf?.removeEventListener(event, handler, true));
        }

        hostRef.current.appendChild(mf);
        fieldRef.current = mf;
        setState("ready");
        statusRef.current?.(true);
        if (autoFocus) setTimeout(() => mf?.focus(), 0);
      })
      .catch(() => {
        if (cancelled) return;
        setState("failed");
        statusRef.current?.(false);
      });

    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
      mf?.remove();
      fieldRef.current = null;
    };
    // The field is created once; value changes are synced below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const mf = fieldRef.current;
    if (mf && mf.value !== value) mf.setValue(value, { silenceNotifications: true });
  }, [value, state]);

  if (state === "failed") return null;
  return (
    <div
      ref={hostRef}
      className={cn("math-field-host", state === "loading" && "min-h-14 animate-pulse", className)}
    />
  );
});
