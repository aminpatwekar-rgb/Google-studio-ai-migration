import * as React from "react";

import { cn } from "@/lib/utils";

export interface TextareaProps extends React.ComponentProps<"textarea"> {
  autoResize?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, autoResize, onInput, ...props }, ref) => {
    const internalRef = React.useRef<HTMLTextAreaElement | null>(null);

    const setRefs = React.useCallback(
      (node: HTMLTextAreaElement | null) => {
        internalRef.current = node;
        if (typeof ref === "function") {
          ref(node);
        } else if (ref) {
          (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
        }
      },
      [ref],
    );

    const adjustHeight = React.useCallback(() => {
      if (!autoResize) return;
      const el = internalRef.current;
      if (!el) return;

      el.style.overflowY = "hidden";
      el.style.height = "auto";
      const computed = window.getComputedStyle(el);
      const borderTop = parseFloat(computed.borderTopWidth) || 0;
      const borderBottom = parseFloat(computed.borderBottomWidth) || 0;
      const targetHeight = el.scrollHeight + borderTop + borderBottom;
      if (targetHeight > 0) {
        el.style.height = `${targetHeight}px`;
      }
    }, [autoResize]);

    React.useEffect(() => {
      adjustHeight();
      const raf = requestAnimationFrame(adjustHeight);
      return () => cancelAnimationFrame(raf);
    }, [props.value, props.defaultValue, adjustHeight]);

    React.useEffect(() => {
      if (!autoResize) return;
      window.addEventListener("resize", adjustHeight);
      return () => window.removeEventListener("resize", adjustHeight);
    }, [autoResize, adjustHeight]);

    const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
      if (autoResize) {
        adjustHeight();
      }
      onInput?.(e as any);
    };

    return (
      <textarea
        className={cn(
          "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          autoResize && "!overflow-hidden resize-none",
          className,
        )}
        ref={setRefs}
        onInput={handleInput}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
