import { getQuiz } from "@/lib/firebase/firestore";

export type QuizCounts = Map<string, number>;

export async function fetchQuestionCounts(quizIds: string[]): Promise<QuizCounts> {
  const map: QuizCounts = new Map();
  if (quizIds.length === 0) return map;

  await Promise.all(
    quizIds.map(async (quizId) => {
      try {
        const item = await getQuiz(quizId);
        map.set(quizId, item?.quiz.questions?.length || 0);
      } catch {
        map.set(quizId, 0);
      }
    }),
  );

  return map;
}
