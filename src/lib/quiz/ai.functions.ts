import { createServerFn } from "@tanstack/react-start";
import { requireFirebaseAuth } from "@/lib/firebase/auth-middleware";
import { getGeminiClient } from "@/lib/gemini.server";

export type GeneratedQuestion = {
  type: string;
  difficulty: string;
  prompt: string;
  options: string[];
  correct: string[];
  explanation: string;
  points: number;
};

type GenerateInput = {
  material: string;
  count: number;
  difficulty: "easy" | "medium" | "hard" | "mixed";
  types: string[];
  withExplanations: boolean;
  topic?: string | undefined;
  avoid?: string[] | undefined;
};

const ALLOWED_TYPES = ["mcq", "multi_select", "true_false", "fill_blank", "short_answer", "essay"];

function validate(input: GenerateInput): GenerateInput {
  const material = String(input?.material ?? "").trim();
  if (material.length < 10) {
    throw new Error("Add at least some study material or text to generate from.");
  }
  const types = (Array.isArray(input.types) ? input.types : []).filter((t) =>
    ALLOWED_TYPES.includes(t),
  );
  const selectedTypes = types.length ? types : ["mcq"];
  const count = Math.min(30, Math.max(1, Math.round(Number(input.count) || 5)));
  const difficulty = (["easy", "medium", "hard", "mixed"] as const).includes(
    input.difficulty as never,
  )
    ? input.difficulty
    : "medium";

  return {
    material: material.slice(0, 60_000),
    count,
    difficulty,
    types: selectedTypes,
    withExplanations: input.withExplanations !== false,
    topic: typeof input.topic === "string" ? input.topic.slice(0, 200) : undefined,
    avoid: Array.isArray(input.avoid)
      ? input.avoid.slice(0, 60).map((s) => String(s).slice(0, 300))
      : [],
  };
}

function parseQuestions(raw: string): GeneratedQuestion[] {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1]!.trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) text = text.slice(start, end + 1);

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Could not parse AI response. Please try again.");
  }

  const list = parsed?.questions;
  if (!Array.isArray(list) || !list.length) {
    throw new Error("No questions were generated. Try providing more text.");
  }

  return list.map((q: any) => ({
    type: ALLOWED_TYPES.includes(String(q.type)) ? String(q.type) : "mcq",
    difficulty: ["easy", "medium", "hard"].includes(String(q.difficulty))
      ? String(q.difficulty)
      : "medium",
    prompt: String(q.prompt || "").trim(),
    options: Array.isArray(q.options) ? q.options.map(String) : [],
    correct: Array.isArray(q.correct)
      ? q.correct.map(String)
      : q.correct
        ? [String(q.correct)]
        : [],
    explanation: String(q.explanation || "").trim(),
    points: Number(q.points) > 0 ? Number(q.points) : 1,
  }));
}

function generateLocalQuestions(input: GenerateInput): GeneratedQuestion[] {
  const sentences = input.material
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15);

  const questions: GeneratedQuestion[] = [];
  const count = Math.min(input.count, Math.max(1, sentences.length));

  for (let i = 0; i < count; i++) {
    const s = sentences[i % sentences.length] || `Topic concept #${i + 1}`;
    const words = s.split(" ").filter((w) => w.length > 3);
    const keyword = words[Math.floor(words.length / 2)]?.replace(/[^a-zA-Z0-9]/g, "") || "concept";

    if (input.types.includes("true_false") && i % 3 === 0) {
      questions.push({
        type: "true_false",
        difficulty:
          input.difficulty === "mixed" ? (i % 2 === 0 ? "easy" : "medium") : input.difficulty,
        prompt: `True or False: According to the study material, "${s}"?`,
        options: ["True", "False"],
        correct: ["True"],
        explanation: input.withExplanations ? "Directly stated in the provided text." : "",
        points: 1,
      });
    } else if (input.types.includes("short_answer") && i % 3 === 1) {
      questions.push({
        type: "short_answer",
        difficulty:
          input.difficulty === "mixed" ? (i % 2 === 0 ? "easy" : "medium") : input.difficulty,
        prompt: `Explain the importance of ${keyword} in relation to: "${s}"`,
        options: [],
        correct: [keyword],
        explanation: input.withExplanations ? `Key keyword: ${keyword}` : "",
        points: 2,
      });
    } else {
      questions.push({
        type: "mcq",
        difficulty:
          input.difficulty === "mixed" ? (i % 2 === 0 ? "easy" : "medium") : input.difficulty,
        prompt: `Based on the study material, what best describes ${keyword}?`,
        options: [
          s,
          `It is completely unrelated to ${keyword}.`,
          `It is an obsolete concept regarding ${keyword}.`,
          `None of the above.`,
        ],
        correct: [s],
        explanation: input.withExplanations ? `Excerpt: "${s}"` : "",
        points: 1,
      });
    }
  }

  return questions;
}

async function callAI(input: GenerateInput): Promise<GeneratedQuestion[]> {
  const ai = getGeminiClient();
  const prompt = [
    `You are an expert educator. Generate exactly ${input.count} assessment question(s) strictly from this study material:`,
    input.material,
    `Allowed Question types: ${input.types.join(", ")}. Difficulty level: ${input.difficulty}.`,
    input.topic ? `Focus on topic: ${input.topic}.` : "",
    input.avoid?.length ? `Avoid repeating: ${input.avoid.join(", ")}` : "",
    `Include clear answer explanations if withExplanations is true (${input.withExplanations}).`,
    `For math equations, format them properly in LaTeX notation with single dollars $...$ or double dollars $$...$$.`,
    `Return ONLY a valid JSON object matching this schema:`,
    `{"questions": [{"type": "mcq"|"multi_select"|"true_false"|"fill_blank"|"short_answer"|"essay", "difficulty": "easy"|"medium"|"hard", "prompt": string, "options": string[], "correct": string[], "explanation": string, "points": number}]}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const runModel = async (model: string) => {
    return await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });
  };

  try {
    let response;
    try {
      response = await runModel("gemini-3.8-flash");
    } catch (err: any) {
      if (err.status === 503 || err.message?.includes("UNAVAILABLE")) {
        console.warn("gemini-3.8-flash unavailable, falling back to gemini-3.5-flash-lite");
        response = await runModel("gemini-3.5-flash-lite");
      } else {
        throw err;
      }
    }

    const text = response.text;
    console.log("AI Raw response length:", text?.length);
    if (!text) throw new Error("No AI response received.");
    return parseQuestions(text);
  } catch (err) {
    console.error("Error in callAI:", err);
    throw err;
  }
}

import { consumeAiQuestionQuota } from "@/lib/entitlements.functions";

export const generateQuizQuestions = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((input: GenerateInput) => validate(input))
  .handler(async ({ data, context }) => {
    console.log("generateQuizQuestions called by:", context.userId, context.email);
    try {
      // Check and consume quota first
      await consumeAiQuestionQuota(context.userId, data.count, context.email);
      console.log("Quota consumed successfully");

      const questions = await callAI(data);
      console.log("AI Questions generated:", questions.length);

      return { questions: questions.slice(0, data.count) };
    } catch (err: any) {
      console.error("Error in generateQuizQuestions:", err);
      throw err;
    }
  });

export const regenerateQuizQuestion = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((input: GenerateInput) => validate({ ...input, count: 1 }))
  .handler(async ({ data, context }) => {
    console.log("regenerateQuizQuestion called by:", context.userId, context.email);
    try {
      // Check and consume 1 unit of AI quota
      await consumeAiQuestionQuota(context.userId, 1, context.email);
      const questions = await callAI({ ...data, count: 1 });
      const question = questions[0] || generateLocalQuestions({ ...data, count: 1 })[0];
      return { question };
    } catch (err: any) {
      console.error("Error in regenerateQuizQuestion:", err);
      throw err;
    }
  });
