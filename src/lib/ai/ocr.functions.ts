import { createServerFn } from "@tanstack/react-start";
import { getGeminiClient } from "@/lib/gemini.server";
import { requireFirebaseAuth } from "@/lib/firebase/auth-middleware";

export type OcrInput = {
  imageDataUrl: string; // Base64 data URL
  mode?: "handwriting" | "printed" | "math";
};

export type OcrResponse = {
  text: string;
  latex?: string;
  confidence: number;
};

export const performHandwritingOcr = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((input: OcrInput) => {
    if (!input?.imageDataUrl || typeof input.imageDataUrl !== "string") {
      throw new Error("Image data is required for OCR processing");
    }
    return {
      imageDataUrl: input.imageDataUrl,
      mode: input.mode || "handwriting",
    };
  })
  .handler(async ({ data }): Promise<OcrResponse> => {
    try {
      const ai = getGeminiClient();

      // Extract base64 payload and mime type
      const match = data.imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
      let mimeType = "image/jpeg";
      let base64Data = data.imageDataUrl;

      if (match && match[1] && match[2]) {
        mimeType = match[1];
        base64Data = match[2];
      }

      const prompt =
        data.mode === "math"
          ? "Transcribe all handwritten and printed mathematical equations, variables, and explanatory text in this image into clean LaTeX format. Enclose inline math with $...$ and block math with $$...$$."
          : "Transcribe the handwriting and text in this student submission image faithfully. Preserve paragraphs, bullet points, and math formulas with standard LaTeX $...$ delimiters. Return only the extracted markdown transcription.";

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [
              {
                text: prompt,
              },
              {
                inlineData: {
                  mimeType,
                  data: base64Data,
                },
              },
            ],
          },
        ],
        config: {
          systemInstruction:
            "You are an expert handwriting transcription engine and educational OCR specialist. You accurately read messy student handwriting, diagram labels, and math equations, converting them into standard markdown with LaTeX math notations.",
        },
      });

      const extractedText = response.text || "";

      return {
        text: extractedText.trim(),
        latex: extractedText.includes("$") ? extractedText : undefined,
        confidence: 0.95,
      };
    } catch (err) {
      console.error("OCR Processing error:", err);
      throw new Error(
        err instanceof Error
          ? err.message
          : "Failed to transcribe handwriting. Please ensure an image is provided.",
      );
    }
  });
