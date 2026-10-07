import { performHandwritingOcr } from "./ocr.functions";

/**
 * Recognition & AI extension points.
 *
 * Real handwriting and math OCR powered by Gemini Vision.
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

/** Handwriting → plain text via Gemini Vision. */
export const handwritingProvider: RecognitionProvider = {
  id: "handwriting",
  label: "Handwriting recognition",
  available: true,
  recognize: async (source: RecognitionSource) => {
    if (source.kind !== "image" || !source.dataUrl) {
      throw new Error("Handwriting recognition requires an image source.");
    }
    return await performHandwritingOcr({
      data: { imageDataUrl: source.dataUrl, mode: "handwriting" },
    });
  },
};

/** Page image → text (printed / scanned pages). */
export const ocrProvider: RecognitionProvider = {
  id: "ocr",
  label: "OCR",
  available: true,
  recognize: async (source: RecognitionSource) => {
    if (source.kind !== "image" || !source.dataUrl) {
      throw new Error("OCR requires an image source.");
    }
    return await performHandwritingOcr({
      data: { imageDataUrl: source.dataUrl, mode: "printed" },
    });
  },
};

/** Handwritten maths → LaTeX. */
export const mathRecognitionProvider: RecognitionProvider = {
  id: "math-ocr",
  label: "Math recognition",
  available: true,
  recognize: async (source: RecognitionSource) => {
    if (source.kind !== "image" || !source.dataUrl) {
      throw new Error("Math recognition requires an image source.");
    }
    return await performHandwritingOcr({
      data: { imageDataUrl: source.dataUrl, mode: "math" },
    });
  },
};

export const RECOGNITION_PROVIDERS = [
  handwritingProvider,
  ocrProvider,
  mathRecognitionProvider,
] as const;

export function isRecognitionEnabled() {
  return true;
}
