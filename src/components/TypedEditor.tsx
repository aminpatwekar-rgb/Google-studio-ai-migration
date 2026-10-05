import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MathEditor } from "@/components/math/MathEditor";
import {
  RichMathEditor,
  type MathTarget,
  type RichMathEditorHandle,
} from "@/components/math/RichMathEditor";
import { ImagePlus, Trash2, ArrowUp, ArrowDown, Mic, ShieldAlert, Sigma } from "lucide-react";

export type ImageBlock = {
  id: string;
  path: string;
  url: string;
  caption: string;
};

type Props = {
  value: string;
  onChange: (v: string) => void;
  blocks: ImageBlock[];
  onBlocksChange: (b: ImageBlock[]) => void;
  allowImages: boolean;
  allowAutocorrect: boolean;
  allowVoice: boolean;
  allowMath?: boolean;
  disabled?: boolean;
  onViolation: (kind: string) => void;
  violations: number;
  onUploadImage: (file: File) => Promise<ImageBlock | null>;
};

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [index: number]: { transcript: string };
    };
  };
}

interface SpeechRecognitionErrorEvent {
  error?: string;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export function TypedEditor({
  value,
  onChange,
  blocks,
  onBlocksChange,
  allowImages,
  allowAutocorrect,
  allowVoice,
  allowMath = true,
  disabled,
  onViolation,
  violations,
  onUploadImage,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<RichMathEditorHandle>(null);
  const [uploading, setUploading] = useState(false);
  const [listening, setListening] = useState(false);
  // Equation dialog: inserting a new equation, or editing one the student clicked.
  const [mathDialog, setMathDialog] = useState<{
    latex: string;
    block: boolean;
    target: MathTarget | null;
  } | null>(null);

  function block(kind: string, label: string) {
    toast.warning(`${label} is disabled on this assignment`, {
      description: "This attempt has been recorded and is visible to your teacher.",
      icon: <ShieldAlert className="size-4" />,
    });
    onViolation(kind);
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    if (!allowImages) {
      toast.error("Images are disabled on this assignment");
      return;
    }
    setUploading(true);
    const added: ImageBlock[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      const b = await onUploadImage(file);
      if (b) added.push(b);
    }
    setUploading(false);
    if (added.length) onBlocksChange([...blocks, ...added]);
  }

  function move(idx: number, dir: -1 | 1) {
    const next = [...blocks];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target]!, next[idx]!];
    onBlocksChange(next);
  }

  // Voice typing stays on until the student turns it off. Browsers end a
  // recognition session after every pause, so the `stopped` flag decides
  // whether `onend` restarts it or lets it die.
  const recRef = useRef<SpeechRecognitionInstance | null>(null);
  const stoppedRef = useRef(true);
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    return () => {
      stoppedRef.current = true;
      try {
        recRef.current?.stop();
      } catch {
        /* recognition already ended */
      }
    };
  }, []);

  function startVoice() {
    const SR =
      (
        window as unknown as {
          webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
        }
      ).webkitSpeechRecognition ??
      (
        window as unknown as {
          SpeechRecognition?: new () => SpeechRecognitionInstance;
        }
      ).SpeechRecognition;
    if (!SR) {
      toast.error("Voice typing isn't supported in this browser");
      return;
    }
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = navigator.language || "en-US";
    rec.onresult = (e: SpeechRecognitionEvent) => {
      let text = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i]?.isFinal) text += e.results[i]?.[0]?.transcript ?? "";
      }
      text = text.trim();
      if (!text) return;
      const current = valueRef.current;
      onChangeRef.current(current ? `${current} ${text}` : text);
    };
    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e?.error === "not-allowed" || e?.error === "service-not-allowed") {
        stoppedRef.current = true;
        setListening(false);
        toast.error("Microphone access is blocked");
      }
      // "no-speech"/"aborted" are normal pauses — onend restarts them.
    };
    rec.onend = () => {
      if (stoppedRef.current) return;
      try {
        rec.start();
      } catch {
        /* start() throws if it is already running */
      }
    };
    recRef.current = rec;
    stoppedRef.current = false;
    try {
      rec.start();
      setListening(true);
      toast.info("Voice typing on — it stays on until you turn it off");
    } catch {
      toast.error("Could not start voice typing");
    }
  }

  function stopVoice() {
    stoppedRef.current = true;
    setListening(false);
    try {
      recRef.current?.stop();
    } catch {
      /* already stopped */
    }
  }

  function openMathEditor() {
    setMathDialog({ latex: "", block: false, target: null });
  }

  function editMath(target: MathTarget) {
    if (disabled) return;
    setMathDialog({ latex: target.latex, block: target.kind === "block", target });
  }

  function saveEquation() {
    if (!mathDialog) return;
    const latex = mathDialog.latex.trim();
    if (!latex) return;
    const kind = mathDialog.block ? "block" : "inline";
    if (mathDialog.target) editorRef.current?.updateMath(mathDialog.target, latex, kind);
    else editorRef.current?.insertMath(latex, kind);
    setMathDialog(null);
  }

  function removeEquation() {
    if (mathDialog?.target) editorRef.current?.deleteMath(mathDialog.target);
    setMathDialog(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
          Paste protection on
        </span>
        {violations > 0 && (
          <span className="rounded-full border border-destructive/40 bg-destructive/15 px-2.5 py-0.5 text-xs font-medium text-destructive">
            {violations} blocked attempt{violations === 1 ? "" : "s"} flagged
          </span>
        )}
        <div className="ml-auto flex flex-wrap justify-end gap-2">
          {allowMath && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={openMathEditor}
            >
              <Sigma className="mr-1.5 size-3.5" /> Insert equation
            </Button>
          )}

          {allowVoice && (
            <Button
              type="button"
              variant={listening ? "default" : "outline"}
              size="sm"
              aria-pressed={listening}
              onClick={() => (listening ? stopVoice() : startVoice())}
            >
              <Mic className={`mr-1.5 size-3.5 ${listening ? "animate-pulse" : ""}`} />
              {listening ? "Voice on" : "Voice"}
            </Button>
          )}

          {allowImages && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              <ImagePlus className="mr-1.5 size-3.5" /> Insert image
            </Button>
          )}
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />

      {allowMath ? (
        <RichMathEditor
          ref={editorRef}
          value={value}
          onChange={onChange}
          disabled={disabled}
          allowAutocorrect={allowAutocorrect}
          placeholder="Write your answer here. Pasting is disabled."
          onEditMath={editMath}
          onBlocked={block}
          onDropFiles={(files) => {
            if (!allowImages) return false;
            void handleFiles(files);
            return true;
          }}
        />
      ) : (
        <Textarea
          value={value}
          disabled={disabled}
          spellCheck={allowAutocorrect}
          autoCorrect={allowAutocorrect ? "on" : "off"}
          autoCapitalize={allowAutocorrect ? "sentences" : "off"}
          onChange={(e) => onChange(e.target.value)}
          onPaste={(e) => {
            e.preventDefault();
            block("paste", "Pasting");
          }}
          onCopy={(e) => {
            e.preventDefault();
            block("copy", "Copying");
          }}
          onCut={(e) => {
            e.preventDefault();
            block("cut", "Cutting");
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            block("contextmenu", "The right-click menu");
          }}
          onDragStart={(e) => {
            e.preventDefault();
            block("dragstart", "Dragging text");
          }}
          onDrop={(e) => {
            const files = e.dataTransfer.files;
            if (files?.length && allowImages) {
              e.preventDefault();
              void handleFiles(files);
              return;
            }
            e.preventDefault();
            block("drop", "Dropping text");
          }}
          onKeyDown={(e) => {
            const mod = e.ctrlKey || e.metaKey;
            if (mod && ["v", "c", "x"].includes(e.key.toLowerCase())) {
              e.preventDefault();
              block(`key-${e.key.toLowerCase()}`, "That shortcut");
            }
          }}
          placeholder="Write your answer here. Pasting is disabled."
          className="min-h-[320px] resize-y font-normal leading-7"
        />
      )}

      <Dialog open={mathDialog !== null} onOpenChange={(open) => !open && setMathDialog(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{mathDialog?.target ? "Edit equation" : "Insert equation"}</DialogTitle>
            <DialogDescription>
              Type your equation below. You will see it formatted as you type.
            </DialogDescription>
          </DialogHeader>
          {mathDialog && (
            <MathEditor
              value={mathDialog.latex}
              onChange={(latex) => setMathDialog((d) => (d ? { ...d, latex } : d))}
              display={mathDialog.block}
              onDisplayChange={(block) => setMathDialog((d) => (d ? { ...d, block } : d))}
              onClipboardBlocked={block}
            />
          )}
          <DialogFooter className="gap-2 sm:justify-between">
            {mathDialog?.target ? (
              <Button type="button" variant="ghost" onClick={removeEquation}>
                <Trash2 className="mr-1.5 size-4 text-destructive" /> Remove
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setMathDialog(null)}>
                Cancel
              </Button>
              <Button type="button" disabled={!mathDialog?.latex.trim()} onClick={saveEquation}>
                {mathDialog?.target ? "Save equation" : "Insert equation"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {allowImages && blocks.length > 0 && (
        <div className="space-y-3">
          {blocks.map((b, i) => (
            <div key={b.id} className="panel flex gap-3 p-3">
              <img
                src={b.url}
                alt={b.caption || "Inserted illustration"}
                className="size-24 rounded-md object-cover"
              />
              <div className="flex-1 space-y-2">
                <Input
                  value={b.caption}
                  maxLength={160}
                  placeholder="Caption"
                  onChange={(e) => {
                    const next = [...blocks];
                    next[i] = { ...b, caption: e.target.value };
                    onBlocksChange(next);
                  }}
                />
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="icon" onClick={() => move(i, -1)}>
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" onClick={() => move(i, 1)}>
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onBlocksChange(blocks.filter((x) => x.id !== b.id))}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
