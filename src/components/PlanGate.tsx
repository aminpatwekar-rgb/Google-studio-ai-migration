import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { Sparkles } from "lucide-react";

export function PlanGate({ feature, children }: { feature: string; children: ReactNode }) {
  const { user, profile, role, loading } = useAuth();

  if (loading) {
    return <div className="panel p-8 text-sm text-muted-foreground">Checking your plan…</div>;
  }

  // Admins, teachers, and Pro plans have access
  const isPrivileged = role === "admin" || role === "teacher";
  const userPlan = profile?.plan?.toLowerCase() || "free";
  const isPaid =
    userPlan.includes("pro") || userPlan.includes("institute") || userPlan.includes("premium");

  const hasAccess = isPrivileged || isPaid;

  if (!hasAccess) {
    return (
      <div className="panel mx-auto max-w-xl p-10 text-center">
        <Sparkles className="mx-auto size-6 text-primary" />
        <h1 className="mt-3 text-xl font-semibold">Upgrade to unlock this feature</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This feature ({feature.replace(/_/g, " ")}) is available on ONYX Pro and Teacher plans.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
