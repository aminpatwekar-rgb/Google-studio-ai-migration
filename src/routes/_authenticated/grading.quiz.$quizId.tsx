import { createFileRoute, Navigate } from "@tanstack/react-router";

function QuizGradingRedirect() {
  const { quizId } = Route.useParams();
  return <Navigate to="/quizzes/$quizId" params={{ quizId }} replace />;
}

export const Route = createFileRoute("/_authenticated/grading/quiz/$quizId")({
  validateSearch: (search: Record<string, unknown>) => ({
    s: typeof search["s"] === "string" ? (search["s"] as string) : undefined,
  }),
  head: () => ({
    meta: [{ title: "Grade Quiz — ONYX" }],
  }),
  component: QuizGradingRedirect,
});
