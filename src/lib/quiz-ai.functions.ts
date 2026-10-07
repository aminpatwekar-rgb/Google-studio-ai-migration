import { createServerFn } from "@tanstack/react-start";
import { Type } from "@google/genai";
import { getGeminiClient } from "./gemini.server";

export interface GenerateQuizInput {
  topic: string;
  gradeLevel?: string;
  difficulty?: "easy" | "medium" | "hard";
  numQuestions?: number;
  questionType?: "multiple_choice" | "text" | "mixed";
  contextDetails?: string;
}

export interface GeneratedQuestion {
  id: string;
  type: "single_choice" | "text";
  text: string;
  options?: string[];
  points: number;
  correctAnswer: string;
  explanation?: string;
}

export interface GenerateQuizResult {
  suggestedTitle: string;
  suggestedTimeLimit: number;
  questions: GeneratedQuestion[];
}

export const generateQuizWithAi = createServerFn({ method: "POST" })
  .validator((input: GenerateQuizInput) => {
    if (!input || !input.topic || typeof input.topic !== "string" || !input.topic.trim()) {
      throw new Error("Topic or subject is required to generate quiz");
    }
    const count = Math.min(Math.max(Number(input.numQuestions) || 5, 1), 15);
    return {
      topic: input.topic.trim(),
      gradeLevel: input.gradeLevel?.trim() || "High School / College",
      difficulty: input.difficulty || "medium",
      numQuestions: count,
      questionType: input.questionType || "mixed",
      contextDetails: input.contextDetails?.trim() || "",
    };
  })
  .handler(async ({ data }): Promise<GenerateQuizResult> => {
    try {
      const ai = getGeminiClient();

      const prompt = `Generate a ${data.numQuestions}-question academic quiz on the topic: "${data.topic}".
Target academic level: ${data.gradeLevel}.
Difficulty: ${data.difficulty}.
Desired question formats: ${
        data.questionType === "multiple_choice"
          ? "All multiple choice (4 options each)"
          : data.questionType === "text"
            ? "Short answer / fill-in style"
            : "Mix of multiple choice and short math/theory questions"
      }.
${data.contextDetails ? `Additional teacher instructions/context: ${data.contextDetails}` : ""}

Ensure mathematical notation, formulas, and chemical symbols are neatly enclosed in LaTeX delimiters: $inline$ or $$display$$.
For multiple choice questions, provide exactly 4 options. The correctAnswer field must match one of the options verbatim.
For short answer questions, the correctAnswer field should be the concise standard answer expected.`;

      const candidateModels = ["gemini-2.5-flash", "gemini-flash-latest"];
      let lastError: unknown = null;
      let responseText = "";

      for (const model of candidateModels) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
              systemInstruction:
                "You are an expert curriculum specialist and exam creator. You generate well-calibrated, accurate academic quizzes. All math equations must use standard LaTeX with $...$ or $$...$$.",
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  suggestedTitle: {
                    type: Type.STRING,
                    description: "Concise, professional title for the quiz",
                  },
                  suggestedTimeLimit: {
                    type: Type.INTEGER,
                    description: "Recommended completion time in minutes",
                  },
                  questions: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        id: { type: Type.STRING },
                        type: {
                          type: Type.STRING,
                          enum: ["single_choice", "text"],
                        },
                        text: {
                          type: Type.STRING,
                          description: "The question prompt, using LaTeX for equations",
                        },
                        options: {
                          type: Type.ARRAY,
                          items: { type: Type.STRING },
                          description: "List of choices for multiple choice questions",
                        },
                        points: {
                          type: Type.INTEGER,
                          description: "Points assigned, usually 5, 10, or 20",
                        },
                        correctAnswer: {
                          type: Type.STRING,
                          description: "The single correct answer for auto-grading",
                        },
                        explanation: {
                          type: Type.STRING,
                          description: "Brief educational explanation of why the answer is correct",
                        },
                      },
                      required: ["id", "type", "text", "points", "correctAnswer"],
                    },
                  },
                },
                required: ["suggestedTitle", "questions"],
              },
            },
          });

          if (response.text?.trim()) {
            responseText = response.text.trim();
            break;
          }
        } catch (err: any) {
          lastError = err;
          const msg = err?.message || String(err);
          // If high demand or 503, try next fallback model
          if (msg.includes("503") || msg.includes("high demand") || msg.includes("UNAVAILABLE")) {
            console.warn(`Model ${model} unavailable, trying fallback...`);
            continue;
          }
          throw err;
        }
      }

      if (!responseText) {
        throw lastError || new Error("No response generated by Gemini model");
      }

      const parsed = JSON.parse(responseText) as GenerateQuizResult;

      // Sanitize and ensure unique IDs
      const timeLimit = Math.max(Number(parsed.suggestedTimeLimit) || data.numQuestions * 3, 5);
      const questions: GeneratedQuestion[] = (parsed.questions || []).map((q, idx) => ({
        id: `q_${Date.now()}_${idx + 1}`,
        type: q.type === "text" ? "text" : "single_choice",
        text: q.text || `Question ${idx + 1}`,
        options:
          q.type !== "text" && Array.isArray(q.options) && q.options.length > 0
            ? q.options.map((opt) => String(opt).trim())
            : undefined,
        points: Number(q.points) || 10,
        correctAnswer: String(q.correctAnswer || "").trim(),
        explanation: q.explanation || undefined,
      }));

      return {
        suggestedTitle: parsed.suggestedTitle || `${data.topic} Quiz`,
        suggestedTimeLimit: timeLimit,
        questions,
      };
    } catch (err) {
      console.error("Gemini quiz generation error:", err);
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`AI Quiz Generation failed: ${msg}`);
    }
  });
