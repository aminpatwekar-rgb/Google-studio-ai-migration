import { createFileRoute, Navigate } from "@tanstack/react-router";

function AssignmentGradingRedirect() {
  const { assignmentId } = Route.useParams();
  return <Navigate to="/assignments/$assignmentId" params={{ assignmentId }} replace />;
}

export const Route = createFileRoute("/_authenticated/grading/assignment/$assignmentId")({
  validateSearch: (search: Record<string, unknown>) => ({
    s: typeof search["s"] === "string" ? (search["s"] as string) : undefined,
  }),
  head: () => ({
    meta: [{ title: "Grade Assignment — ONYX" }],
  }),
  component: AssignmentGradingRedirect,
});
