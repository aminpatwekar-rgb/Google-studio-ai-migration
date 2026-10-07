import { GoogleGenAI } from "@google/genai";

export function getGeminiApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY is not set in the server environment. Please configure GEMINI_API_KEY.",
    );
  }
  return key;
}

export function getGeminiClient(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: getGeminiApiKey(),
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}
