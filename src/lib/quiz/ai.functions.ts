import { createServerFn } from "@tanstack/react-start";
import { requireFirebaseAuth } from "@/lib/firebase/auth-middleware";

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
  if (material.length < 20) {
    throw new Error("Add at least a short paragraph of study material to generate from.");
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
    points: Number(q.points) > 0 ? Number(q.points) : 2,
  }));
}

function generateLocalQuestions(input: GenerateInput): GeneratedQuestion[] {
  // Reliable generator when external API is not configured
  const sentences = input.material
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);

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
        prompt: `True or False: According to the material, "${s}"?`,
        options: ["True", "False"],
        correct: ["True"],
        explanation: input.withExplanations ? "Directly stated in the provided text." : "",
        points: 2,
      });
    } else {
      questions.push({
        type: "mcq",
        difficulty:
          input.difficulty === "mixed" ? (i % 2 === 0 ? "easy" : "medium") : input.difficulty,
        prompt: `Based on the material, what statement best describes ${keyword}?`,
        options: [
          s,
          `It is unrelated to the primary discussion of ${keyword}.`,
          `It contradicts the foundational findings on ${keyword}.`,
          `It is an obsolete hypothesis regarding ${keyword}.`,
        ],
        correct: [s],
        explanation: input.withExplanations ? `Excerpt: "${s}"` : "",
        points: 2,
      });
    }
  }

  return questions;
}

async function callAI(input: GenerateInput): Promise<GeneratedQuestion[]> {
  const geminiKey = process.env["GEMINI_API_KEY"];
  if (!geminiKey) {
    return generateLocalQuestions(input);
  }

  const prompt = [
    `Generate exactly ${input.count} assessment question(s) strictly from this material:`,
    input.material,
    `Question types: ${input.types.join(", ")}. Difficulty: ${input.difficulty}.`,
    input.topic ? `Focus on topic: ${input.topic}.` : "",
    input.avoid?.length ? `Avoid: ${input.avoid.join(", ")}` : "",
    `Return ONLY a JSON object: {"questions": [{"type": "mcq"|"true_false"|"short_answer", "difficulty": "easy"|"medium"|"hard", "prompt": string, "options": string[], "correct": string[], "explanation": string, "points": number}]}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
      },
    );

    if (!res.ok) {
      return generateLocalQuestions(input);
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return generateLocalQuestions(input);
    return parseQuestions(text);
  } catch {
    return generateLocalQuestions(input);
  }
}

export const generateQuizQuestions = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((input: GenerateInput) => validate(input))
  .handler(async ({ data }) => {
    const questions = await callAI(data);
    return { questions: questions.slice(0, data.count) };
  });

export const regenerateQuizQuestion = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((input: GenerateInput) => validate({ ...input, count: 1 }))
  .handler(async ({ data }) => {
    const questions = await callAI({ ...data, count: 1 });
    const question = questions[0] || generateLocalQuestions({ ...data, count: 1 })[0];
    return { question };
  });
