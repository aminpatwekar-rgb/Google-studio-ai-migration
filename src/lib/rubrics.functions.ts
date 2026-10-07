import { createServerFn } from "@tanstack/react-start";
import { requireFirebaseAuth } from "@/lib/firebase/auth-middleware";
import { getGeminiClient } from "@/lib/gemini.server";

export type RubricLevel = {
  id: string;
  label: string;
  points: number;
  description: string;
};

export type RubricCriterion = {
  id: string;
  title: string;
  description: string;
  max_points: number;
  levels: RubricLevel[];
};

export type RubricTemplate = {
  id: string;
  title: string;
  description: string;
  criteria: RubricCriterion[];
};

export const STANDARD_TEMPLATES: RubricTemplate[] = [
  {
    id: "analytical_essay",
    title: "Analytical Essay Rubric",
    description:
      "Evaluates thesis development, evidence & analysis, structure, and academic conventions.",
    criteria: [
      {
        id: "c1",
        title: "Thesis & Central Argument",
        description: "Clarity, originality, and defensibility of the thesis statement.",
        max_points: 4,
        levels: [
          {
            id: "l1",
            label: "Exemplary",
            points: 4,
            description:
              "Nuanced, insightful thesis that drives a compelling, focused argument throughout.",
          },
          {
            id: "l2",
            label: "Proficient",
            points: 3,
            description: "Clear, arguable thesis with consistent focus and supporting points.",
          },
          {
            id: "l3",
            label: "Developing",
            points: 2,
            description: "Vague or overly broad thesis; argument drifts or lacks clear purpose.",
          },
          {
            id: "l4",
            label: "Beginning",
            points: 1,
            description: "Missing, purely factual, or unclear thesis with minimal argument.",
          },
        ],
      },
      {
        id: "c2",
        title: "Evidence & Textual Analysis",
        description: "Integration and close analysis of relevant sources and evidence.",
        max_points: 4,
        levels: [
          {
            id: "l1",
            label: "Exemplary",
            points: 4,
            description:
              "Exceptional integration of primary/secondary evidence with deep, critical analysis.",
          },
          {
            id: "l2",
            label: "Proficient",
            points: 3,
            description: "Accurate evidence cited with logical explanations and analytical depth.",
          },
          {
            id: "l3",
            label: "Developing",
            points: 2,
            description:
              "Evidence is present but relies heavily on summary rather than analytical critique.",
          },
          {
            id: "l4",
            label: "Beginning",
            points: 1,
            description: "Sparse or inaccurate evidence with little to no analytical backing.",
          },
        ],
      },
      {
        id: "c3",
        title: "Structure & Organization",
        description: "Logical paragraph sequencing, topic sentences, and smooth transitions.",
        max_points: 4,
        levels: [
          {
            id: "l1",
            label: "Exemplary",
            points: 4,
            description: "Seamless paragraph transitions and sophisticated, cohesive logical flow.",
          },
          {
            id: "l2",
            label: "Proficient",
            points: 3,
            description: "Well-structured with clear topic sentences and logical progression.",
          },
          {
            id: "l3",
            label: "Developing",
            points: 2,
            description:
              "Some organizational issues; abrupt transitions or uneven paragraph development.",
          },
          {
            id: "l4",
            label: "Beginning",
            points: 1,
            description: "Disorganized structure making core ideas difficult to follow.",
          },
        ],
      },
      {
        id: "c4",
        title: "Mechanics & Academic Style",
        description: "Grammar, syntax, scholarly tone, and proper citations.",
        max_points: 4,
        levels: [
          {
            id: "l1",
            label: "Exemplary",
            points: 4,
            description:
              "Flawless prose, sophisticated vocabulary, and accurate citation formatting.",
          },
          {
            id: "l2",
            label: "Proficient",
            points: 3,
            description:
              "Clear, correct academic tone with few minor mechanical or citation errors.",
          },
          {
            id: "l3",
            label: "Developing",
            points: 2,
            description:
              "Frequent grammatical or punctuation errors that occasionally obscure meaning.",
          },
          {
            id: "l4",
            label: "Beginning",
            points: 1,
            description: "Pervasive grammatical errors; lack of citation standards.",
          },
        ],
      },
    ],
  },
  {
    id: "science_lab_report",
    title: "Science Lab Report Rubric",
    description: "Evaluates scientific method, data accuracy, analysis, and conclusions.",
    criteria: [
      {
        id: "c1",
        title: "Hypothesis & Variables",
        description:
          "Testable hypothesis and thorough identification of control and experimental variables.",
        max_points: 5,
        levels: [
          {
            id: "l1",
            label: "Exemplary",
            points: 5,
            description:
              "Precisely formulated testable hypothesis with all variables clearly controlled and defined.",
          },
          {
            id: "l2",
            label: "Proficient",
            points: 4,
            description:
              "Testable hypothesis with independent, dependent, and controlled variables identified.",
          },
          {
            id: "l3",
            label: "Developing",
            points: 2,
            description: "Hypothesis is vague or variables are incompletely defined.",
          },
          {
            id: "l4",
            label: "Beginning",
            points: 1,
            description: "Hypothesis missing or not testable through scientific inquiry.",
          },
        ],
      },
      {
        id: "c2",
        title: "Data Collection & Representation",
        description: "Accurate tables, charts, units, and uncertainty recordings.",
        max_points: 5,
        levels: [
          {
            id: "l1",
            label: "Exemplary",
            points: 5,
            description:
              "Comprehensive data tables, properly labeled graphs with units, scales, and error bars.",
          },
          {
            id: "l2",
            label: "Proficient",
            points: 4,
            description: "Clear data tables and accurate graphs with labeled axes and units.",
          },
          {
            id: "l3",
            label: "Developing",
            points: 2,
            description:
              "Data presentation has minor errors, missing units, or formatting inconsistencies.",
          },
          {
            id: "l4",
            label: "Beginning",
            points: 1,
            description:
              "Incomplete or disorganized data with missing charts or critical measurements.",
          },
        ],
      },
      {
        id: "c3",
        title: "Scientific Discussion & Error Analysis",
        description:
          "Deep interpretation of trends, validation of hypothesis, and experimental error analysis.",
        max_points: 5,
        levels: [
          {
            id: "l1",
            label: "Exemplary",
            points: 5,
            description:
              "Insightful interpretation linking findings to scientific theory with rigorous error discussion.",
          },
          {
            id: "l2",
            label: "Proficient",
            points: 4,
            description:
              "Sound explanation of data patterns, hypothesis evaluation, and plausible sources of error.",
          },
          {
            id: "l3",
            label: "Developing",
            points: 2,
            description:
              "Superficial interpretation with generic or minimal discussion of experimental error.",
          },
          {
            id: "l4",
            label: "Beginning",
            points: 1,
            description:
              "Fails to interpret results or connect conclusions to original experimental data.",
          },
        ],
      },
    ],
  },
  {
    id: "project_presentation",
    title: "Oral Presentation & Pitch Rubric",
    description: "Evaluates subject mastery, visual aids, delivery, and audience engagement.",
    criteria: [
      {
        id: "c1",
        title: "Content & Subject Knowledge",
        description: "Depth of topic coverage and ability to answer questions confidently.",
        max_points: 5,
        levels: [
          {
            id: "l1",
            label: "Exemplary",
            points: 5,
            description:
              "Demonstrates authoritative mastery, anticipates complex questions, and explains concepts effortlessly.",
          },
          {
            id: "l2",
            label: "Proficient",
            points: 4,
            description:
              "Thorough topic coverage with accurate explanations and clear responses to audience inquiry.",
          },
          {
            id: "l3",
            label: "Developing",
            points: 2,
            description:
              "Basic coverage with occasional inaccuracies or difficulty responding to questions.",
          },
          {
            id: "l4",
            label: "Beginning",
            points: 1,
            description: "Superficial knowledge; unable to elaborate beyond slide bullet points.",
          },
        ],
      },
      {
        id: "c2",
        title: "Visual Aids & Slides",
        description: "Design quality, clarity, readability, and multimedia enhancement.",
        max_points: 5,
        levels: [
          {
            id: "l1",
            label: "Exemplary",
            points: 5,
            description:
              "Stunning, high-impact visuals that enhance comprehension without text clutter.",
          },
          {
            id: "l2",
            label: "Proficient",
            points: 4,
            description: "Clean, legible slides with appropriate graphics and organized content.",
          },
          {
            id: "l3",
            label: "Developing",
            points: 2,
            description: "Cluttered slides or excessive text that distracts from speaker delivery.",
          },
          {
            id: "l4",
            label: "Beginning",
            points: 1,
            description: "Poor visual aids with low readability or missing essential graphics.",
          },
        ],
      },
      {
        id: "c3",
        title: "Delivery & Public Speaking",
        description: "Eye contact, pacing, vocal projection, body language, and time management.",
        max_points: 5,
        levels: [
          {
            id: "l1",
            label: "Exemplary",
            points: 5,
            description:
              "Dynamic presence, natural eye contact, excellent vocal variety, and perfect pacing.",
          },
          {
            id: "l2",
            label: "Proficient",
            points: 4,
            description: "Clear projection, consistent eye contact, and adherence to time limits.",
          },
          {
            id: "l3",
            label: "Developing",
            points: 2,
            description: "Monotone delivery, reads heavily from notes/slides, or uneven pacing.",
          },
          {
            id: "l4",
            label: "Beginning",
            points: 1,
            description: "Inaudible, disengaged, or significantly under/over the allocated time.",
          },
        ],
      },
    ],
  },
  {
    id: "coding_software_project",
    title: "Software Engineering & Code Rubric",
    description: "Evaluates functional requirements, code quality, testing, and documentation.",
    criteria: [
      {
        id: "c1",
        title: "Functionality & Edge Cases",
        description: "Correct implementation of specifications and robust error handling.",
        max_points: 5,
        levels: [
          {
            id: "l1",
            label: "Exemplary",
            points: 5,
            description:
              "All requirements fully met with graceful handling of boundary conditions and invalid inputs.",
          },
          {
            id: "l2",
            label: "Proficient",
            points: 4,
            description:
              "Core features work correctly as specified with basic edge case validation.",
          },
          {
            id: "l3",
            label: "Developing",
            points: 2,
            description:
              "Partial feature completion or noticeable bugs under standard usage scenarios.",
          },
          {
            id: "l4",
            label: "Beginning",
            points: 1,
            description: "Code fails to compile or fails fundamental core requirements.",
          },
        ],
      },
      {
        id: "c2",
        title: "Architecture & Code Cleanliness",
        description: "Modularity, naming conventions, separation of concerns, and clean structure.",
        max_points: 5,
        levels: [
          {
            id: "l1",
            label: "Exemplary",
            points: 5,
            description:
              "Idiomatic, elegant design patterns, modular architecture, and self-documenting code.",
          },
          {
            id: "l2",
            label: "Proficient",
            points: 4,
            description:
              "Well-organized functions, consistent formatting, and appropriate modularity.",
          },
          {
            id: "l3",
            label: "Developing",
            points: 2,
            description:
              "Monolithic code blocks, inconsistent naming, or excessive code duplication.",
          },
          {
            id: "l4",
            label: "Beginning",
            points: 1,
            description:
              "Spaghetti code with poor structure making maintenance extremely difficult.",
          },
        ],
      },
      {
        id: "c3",
        title: "Documentation & Readme",
        description: "Clear setup instructions, comments, and architecture explanations.",
        max_points: 5,
        levels: [
          {
            id: "l1",
            label: "Exemplary",
            points: 5,
            description:
              "Complete README with setup guide, architectural diagrams, API docs, and meaningful comments.",
          },
          {
            id: "l2",
            label: "Proficient",
            points: 4,
            description: "Clear instructions to run the application with key functions commented.",
          },
          {
            id: "l3",
            label: "Developing",
            points: 2,
            description: "Sparse instructions or outdated comments.",
          },
          {
            id: "l4",
            label: "Beginning",
            points: 1,
            description: "No documentation or instructions provided.",
          },
        ],
      },
    ],
  },
];

type GenerateRubricInput = {
  topic: string;
  gradeLevel?: string;
  scaleType?: "4_level" | "3_level" | "5_level";
  maxScorePerCriterion?: number;
  criteriaCount?: number;
  additionalGuidelines?: string;
};

export const generateRubricWithAi = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((input: GenerateRubricInput) => {
    if (!input || typeof input.topic !== "string" || !input.topic.trim()) {
      throw new Error("Topic or assignment prompt is required.");
    }
    return {
      topic: input.topic.trim().slice(0, 500),
      gradeLevel: input.gradeLevel
        ? String(input.gradeLevel).slice(0, 100)
        : "University / High School",
      scaleType: input.scaleType || "4_level",
      maxScorePerCriterion: Number(input.maxScorePerCriterion) || 4,
      criteriaCount: Math.min(8, Math.max(2, Number(input.criteriaCount) || 4)),
      additionalGuidelines: input.additionalGuidelines
        ? String(input.additionalGuidelines).slice(0, 1000)
        : undefined,
    };
  })
  .handler(async ({ data }) => {
    const gemini = getGeminiClient();

    const systemPrompt = `You are an expert educator and curriculum designer.
Generate a structured, comprehensive educational grading rubric formatted strictly as JSON.

Topic / Assignment: "${data.topic}"
Target Grade/Level: "${data.gradeLevel}"
Criteria Count: ${data.criteriaCount}
Scale: ${data.scaleType} (Max points per criterion: ${data.maxScorePerCriterion})
${data.additionalGuidelines ? `Guidelines: "${data.additionalGuidelines}"` : ""}

Respond ONLY with valid JSON matching this schema:
{
  "title": "Clear rubric title",
  "description": "Short explanation of the assessment criteria",
  "criteria": [
    {
      "id": "c1",
      "title": "Criterion Title (e.g., Thesis & Argument)",
      "description": "Brief explanation of what this criterion evaluates",
      "max_points": ${data.maxScorePerCriterion},
      "levels": [
        {
          "id": "l1",
          "label": "Exemplary",
          "points": ${data.maxScorePerCriterion},
          "description": "Specific descriptive indicators of what mastery looks like"
        },
        ... (descending points for each level)
      ]
    }
  ]
}`;

    const response = await gemini.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
      config: {
        temperature: 0.3,
        responseMimeType: "application/json",
      },
    });

    const rawText = response.text || "{}";
    try {
      const parsed = JSON.parse(rawText);
      return {
        title: String(parsed.title || `${data.topic} Rubric`),
        description: String(parsed.description || `Scoring guide for ${data.topic}`),
        criteria: (Array.isArray(parsed.criteria) ? parsed.criteria : []).map(
          (c: any, cIdx: number) => ({
            id: c.id || `c_${Date.now()}_${cIdx}`,
            title: String(c.title || `Criterion ${cIdx + 1}`),
            description: String(c.description || ""),
            max_points: Number(c.max_points) || data.maxScorePerCriterion,
            levels: (Array.isArray(c.levels) ? c.levels : []).map((l: any, lIdx: number) => ({
              id: l.id || `l_${Date.now()}_${lIdx}`,
              label: String(l.label || `Level ${lIdx + 1}`),
              points: Number.isFinite(Number(l.points))
                ? Number(l.points)
                : data.maxScorePerCriterion - lIdx,
              description: String(l.description || ""),
            })),
          }),
        ),
      };
    } catch (err) {
      throw new Error("Failed to parse AI-generated rubric. Please try again.");
    }
  });
