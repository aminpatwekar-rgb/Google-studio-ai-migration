import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Crown, Sparkles } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getPlanSummary } from "@/lib/onyx.features.functions";
import { useAuth } from "@/lib/auth";

function limitLabel(value: unknown, suffix = "") {
  const n = Number(value);
  if (n < 0) return "Unlimited";
  return `${n}${suffix}`;
}

export function BusinessModelPlans() {
  const { role } = useAuth();
  const getPlan = useServerFn(getPlanSummary);
  const q = useQuery({
    queryKey: ["business-model-plans"],
    queryFn: () => getPlan(),
    staleTime: 60_000,
  });

  if (q.isLoading)
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">Loading plans…</CardContent>
      </Card>
    );
  if (q.isError)
    return (
      <Card>
        <CardContent className="p-6 text-sm text-destructive">
          Could not load plan information.
        </CardContent>
      </Card>
    );

  const current = q.data.plan;
  const plans = (q.data as any).plans ?? [];
  const catalog = plans.filter((p: any) => p.code !== "admin");

  return (
    <div className="space-y-4">
      <Card className="lift">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            ONYX Plans & Pricing
          </CardTitle>
          <CardDescription>
            Choose the plan that matches your teaching workload. Students keep access to their
            academic work; paid plans unlock teacher/admin productivity features.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {catalog.map((p: any) => {
          const isCurrent = current?.code === p.code;
          const limits = p.limits ?? {};
          const features = p.features ?? {};
          const highlighted = p.code === "pro";
          return (
            <Card key={p.code} className={highlighted ? "border-primary/50 shadow-md" : ""}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-lg">{p.name}</CardTitle>
                  {highlighted && <Crown className="size-4 text-primary" />}
                </div>
                <div className="pt-1">
                  <span className="text-2xl font-bold">
                    ₹{Number(p.monthly_price_inr).toLocaleString("en-IN")}
                  </span>
                  <span className="text-sm text-muted-foreground"> / month</span>
                </div>
                <CardDescription>
                  ₹{Number(p.annual_price_inr).toLocaleString("en-IN")} / year
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="space-y-2 text-sm">
                  <li className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    {limitLabel(limits.max_classes)} classes
                  </li>
                  <li className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    {limitLabel(limits.max_students_per_class)} students/class
                  </li>
                  <li className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    {limitLabel(limits.ai_questions_per_month)} AI questions/month
                  </li>
                  <li className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    {features.rubrics ? "Rubrics" : "Basic grading"}
                  </li>
                  <li className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    {features.attendance ? "Attendance" : "Core class tools"}
                  </li>
                </ul>
                {isCurrent ? (
                  <Button variant="outline" className="w-full" disabled>
                    Current plan
                  </Button>
                ) : role === "admin" ? (
                  <Button variant="outline" className="w-full" disabled>
                    Admin — unlimited access
                  </Button>
                ) : (
                  <Button asChild className="w-full">
                    <Link to="/settings">Upgrade</Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}

        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-lg">Institution</CardTitle>
            <CardDescription>For schools, colleges and larger deployments.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ul className="space-y-2">
              {[
                "Multiple teachers and admins",
                "Central student management",
                "Institution-wide analytics",
                "Custom branding, domain and SSO",
                "Bulk onboarding and exports",
              ].map((x) => (
                <li key={x} className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                  {x}
                </li>
              ))}
            </ul>
            <Button asChild variant="outline" className="w-full">
              <Link to="/settings">Contact / Upgrade</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
