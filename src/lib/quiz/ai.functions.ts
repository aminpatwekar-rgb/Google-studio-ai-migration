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
  if (material.length < 40) {
    throw new Error("Add at least a short paragraph of study material to generate from.");
  }
  const types = (Array.isArray(input.types) ? input.types : []).filter((t) =>
    ALLOWED_TYPES.includes(t),
  );
  if (!types.length) throw new Error("Pick at least one question type.");
  const selectedTypes = types;
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

function buildPrompt(input: GenerateInput) {
  return [
    `Generate exactly ${input.count} exam question(s) strictly from the STUDY MATERIAL below.`,
    `Allowed question types: ${input.types.join(", ")}. Spread them across the allowed types.`,
    input.difficulty === "mixed"
      ? "Mix easy, medium and hard difficulty."
      : `Every question must be ${input.difficulty} difficulty.`,
    input.topic ? `Focus on the topic: ${input.topic}.` : "",
    input.withExplanations
      ? "Include a one or two sentence explanation of why the answer is right."
      : "Leave explanation as an empty string.",
    input.avoid?.length
      ? `Do NOT repeat or paraphrase these existing questions:\n- ${input.avoid.join("\n- ")}`
      : "",
    "",
    "Rules:",
    "- Never invent facts that are not supported by the material.",
    "- No duplicate or near-duplicate questions.",
    '- "mcq": exactly 4 options, exactly 1 entry in correct (matching an option verbatim).',
    '- "multi_select": 4-5 options, 2 or more entries in correct (each matching an option verbatim).',
    '- "true_false": options ["True","False"], correct is one of them.',
    '- "fill_blank": use ____ in the prompt, options [], correct holds accepted answers.',
    '- "short_answer": options [], correct holds 1-3 acceptable short answers.',
    '- "essay": options [], correct [].',
    "- points: 1 for easy, 2 for medium, 3 for hard.",
    "",
    'Reply with JSON only, shaped { "questions": [ { "type", "difficulty", "prompt", "options", "correct", "explanation", "points" } ] }.',
    "",
    "STUDY MATERIAL:",
    input.material,
  ]
    .filter(Boolean)
    .join("\n");
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

const MODEL = "gemini-2.5-flash";
const TIMEOUT_MS = 90_000;

/** Calls Google's Gemini API directly. The key (GEMINI_API_KEY) never leaves the server. */
async function callGemini(prompt: string): Promise<string> {
  const key = process.env["GEMINI_API_KEY"] ?? process.env["GOOGLE_API_KEY"];
  if (!key) {
    throw new Error(
      "AI is not configured. Add GEMINI_API_KEY (from Google AI Studio) to the server environment.",
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: "You are an experienced examiner. You write precise, unambiguous assessment questions grounded only in the supplied material, and you always reply with valid JSON.",
              },
            ],
          },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.4 },
        }),
      },
    );
  } catch (err) {
    if ((err as Error)?.name === "AbortError") {
      throw new Error("The AI took too long to respond. Try fewer questions or less material.");
    }
    throw new Error("Could not reach the AI service. Check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 429) throw new Error("AI rate limit reached. Please wait a moment and try again.");
  if (res.status === 400 || res.status === 401 || res.status === 403) {
    const body = await res.text();
    console.error(`Gemini rejected the request [${res.status}]: ${body}`);
    throw new Error("The AI credentials were rejected. Check GEMINI_API_KEY on the server.");
  }
  if (!res.ok) {
    console.error(`Gemini error [${res.status}]: ${await res.text()}`);
    throw new Error(`The AI service failed (${res.status}). Please try again.`);
  }

  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) throw new Error("The AI returned an empty response. Try again.");
  return text;
}

/** Generates a batch of questions from study material. */
export const generateQuizQuestions = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((input: GenerateInput) => validate(input))
  .handler(async ({ data }) => {
    const questions = parseQuestions(await callGemini(buildPrompt(data))).slice(0, data.count);
    if (!questions.length) throw new Error("The AI didn't return any usable questions. Try again.");
    return { questions };
  });

/** Regenerates a single question, avoiding everything already in the quiz. */
export const regenerateQuizQuestion = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((input: GenerateInput) => validate({ ...input, count: 1 }))
  .handler(async ({ data }) => {
    const [question] = parseQuestions(await callGemini(buildPrompt({ ...data, count: 1 })));
    if (!question) throw new Error("Couldn't regenerate that question. Try again.");
    return { question };
  });
