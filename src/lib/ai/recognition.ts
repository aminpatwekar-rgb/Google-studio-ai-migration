/**
 * Recognition & AI extension points.
 *
 * Nothing here fabricates results. Each provider is an interface with a
 * "not configured" default so future OCR / handwriting / feedback engines can be
 * plugged in without touching the notebook or submission UI.
 */

export type RecognitionSource =
  { kind: "image"; dataUrl: string } | { kind: "strokes"; strokes: unknown };

export type RecognitionResult = {
  text: string;
  latex?: string;
  confidence: number;
};

export type RecognitionProvider = {
  id: string;
  label: string;
  available: boolean;
  recognize: (source: RecognitionSource) => Promise<RecognitionResult>;
};

export class ProviderNotConfiguredError extends Error {
  constructor(label: string) {
    super(`${label} is not configured yet.`);
    this.name = "ProviderNotConfiguredError";
  }
}

function unconfigured(id: string, label: string): RecognitionProvider {
  return {
    id,
    label,
    available: false,
    recognize: async () => {
      throw new ProviderNotConfiguredError(label);
    },
  };
}

/** Handwriting → plain text. */
export const handwritingProvider: RecognitionProvider = unconfigured(
  "handwriting",
  "Handwriting recognition",
);

/** Page image → text (printed / scanned pages). */
export const ocrProvider: RecognitionProvider = unconfigured("ocr", "OCR");

/** Handwritten maths → LaTeX. */
export const mathRecognitionProvider: RecognitionProvider = unconfigured(
  "math-ocr",
  "Math recognition",
);

export const RECOGNITION_PROVIDERS = [
  handwritingProvider,
  ocrProvider,
  mathRecognitionProvider,
] as const;

export function isRecognitionEnabled() {
  return RECOGNITION_PROVIDERS.some((p) => p.available);
}
