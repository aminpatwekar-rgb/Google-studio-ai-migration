import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Check,
  Crown,
  Sparkles,
  Infinity as InfinityIcon,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getPlanSummary } from "@/lib/onyx.features.functions";
import { useAuth } from "@/lib/auth";

function limitLabel(value: unknown, suffix = "") {
  const n = Number(value);
  if (n < 0) return "Unlimited";
  return `${n}${suffix}`;
}

const FALLBACK_PLANS = [
  {
    code: "free",
    name: "Free",
    monthly_price_inr: 0,
    annual_price_inr: 0,
    limits: {
      max_classes: 2,
      max_students_per_class: 30,
      ai_questions_per_month: 20,
    },
    features: {
      rubrics: false,
      attendance: false,
    },
  },
  {
    code: "pro",
    name: "Pro",
    monthly_price_inr: 499,
    annual_price_inr: 4999,
    limits: {
      max_classes: 10,
      max_students_per_class: 150,
      ai_questions_per_month: 500,
    },
    features: {
      rubrics: true,
      attendance: true,
    },
  },
  {
    code: "institution",
    name: "Institution",
    monthly_price_inr: 1999,
    annual_price_inr: 19999,
    limits: {
      max_classes: -1,
      max_students_per_class: -1,
      ai_questions_per_month: -1,
    },
    features: {
      rubrics: true,
      attendance: true,
    },
  },
];

export function BusinessModelPlans() {
  const { role, isSuperAdmin } = useAuth();
  const getPlan = useServerFn(getPlanSummary);
  const q = useQuery({
    queryKey: ["business-model-plans"],
    queryFn: () => getPlan(),
    staleTime: 60_000,
    retry: 2,
  });

  const isUnlimitedUser =
    isSuperAdmin || q.data?.isSuperAdmin || role === "admin" || q.data?.isUnlimited;
  const current = q.data?.plan;
  const plans = q.data?.plans && q.data.plans.length > 0 ? q.data.plans : FALLBACK_PLANS;
  const catalog = plans.filter(
    (p: { code: string }) => p.code !== "admin" && p.code !== "super_admin",
  );

  if (q.isLoading) {
    return (
      <Card className="lift">
        <CardContent className="p-6 text-sm text-muted-foreground flex items-center gap-2">
          <RefreshCw className="size-4 animate-spin text-primary" />
          Loading plan tiers & pricing…
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card
        className={`lift ${isUnlimitedUser ? "border-amber-500/30 bg-gradient-to-r from-amber-500/5 via-background to-primary/5" : ""}`}
      >
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-5 text-primary" />
              ONYX Plans & Pricing
            </CardTitle>
            {isUnlimitedUser && (
              <Badge className="bg-amber-500 text-black font-semibold hover:bg-amber-400 gap-1.5">
                <Crown className="size-3.5" />
                Super Admin: All Plans Included
              </Badge>
            )}
          </div>
          <CardDescription>
            {isUnlimitedUser
              ? "As Super Admin, you can inspect all platform tiers and their capabilities. Your account is permanently granted unrestricted access to everything."
              : "Choose the plan that matches your teaching workload. Students keep access to their academic work; paid plans unlock teacher/admin productivity features."}
          </CardDescription>
        </CardHeader>
      </Card>

      {q.isError && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-500 flex items-center justify-between">
          <span>Showing cached plan catalog.</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => q.refetch()}
            className="h-7 text-xs gap-1.5"
          >
            <RefreshCw className="size-3" />
            Reload
          </Button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {catalog.map((p: any) => {
          const isCurrent = current?.code === p.code;
          const limits = p.limits ?? {};
          const features = p.features ?? {};
          const isPro = p.code === "pro";
          const isInstitution = p.code === "institution";

          return (
            <Card
              key={p.code}
              className={`flex flex-col justify-between transition-all duration-200 ${
                isPro
                  ? "border-primary/60 shadow-md ring-1 ring-primary/20"
                  : isInstitution
                    ? "border-purple-500/40 bg-purple-500/5"
                    : ""
              }`}
            >
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-lg flex items-center gap-1.5">
                    {p.name}
                    {isPro && (
                      <Badge variant="secondary" className="text-xs bg-primary/10 text-primary">
                        Popular
                      </Badge>
                    )}
                    {isInstitution && (
                      <Badge
                        variant="secondary"
                        className="text-xs bg-purple-500/10 text-purple-600 dark:text-purple-400"
                      >
                        Enterprise
                      </Badge>
                    )}
                  </CardTitle>
                  {isPro && <Crown className="size-4 text-primary" />}
                </div>

                <div className="pt-2">
                  <span className="text-3xl font-bold">
                    ₹{Number(p.monthly_price_inr).toLocaleString("en-IN")}
                  </span>
                  <span className="text-xs text-muted-foreground"> / month</span>
                </div>
                <CardDescription className="text-xs">
                  {Number(p.annual_price_inr) > 0
                    ? `₹${Number(p.annual_price_inr).toLocaleString("en-IN")} billed annually`
                    : "Free forever for core tools"}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4 flex-1 flex flex-col justify-between">
                <ul className="space-y-2.5 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <Check className="size-4 shrink-0 text-primary" />
                    <span className="text-foreground font-medium">
                      {limitLabel(limits.max_classes)}
                    </span>{" "}
                    classes
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="size-4 shrink-0 text-primary" />
                    <span className="text-foreground font-medium">
                      {limitLabel(limits.max_students_per_class)}
                    </span>{" "}
                    students / class
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="size-4 shrink-0 text-primary" />
                    <span className="text-foreground font-medium">
                      {limitLabel(limits.ai_questions_per_month)}
                    </span>{" "}
                    AI questions / mo
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="size-4 shrink-0 text-primary" />
                    <span>
                      {features.rubrics ? "Rubrics & Advanced Rubric Builder" : "Basic Grading"}
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="size-4 shrink-0 text-primary" />
                    <span>
                      {features.attendance
                        ? "Attendance Tracking & Reports"
                        : "Core Class Management"}
                    </span>
                  </li>
                  {isInstitution && (
                    <>
                      <li className="flex items-center gap-2">
                        <Check className="size-4 shrink-0 text-purple-500" />
                        <span>Central Student Management & SSO</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="size-4 shrink-0 text-purple-500" />
                        <span>Institution-wide Analytics & Exports</span>
                      </li>
                    </>
                  )}
                </ul>

                <div className="pt-4 border-t border-border/50">
                  {isUnlimitedUser ? (
                    <Button
                      variant="outline"
                      className="w-full bg-background border-amber-500/40 text-amber-500 hover:bg-amber-500/10 cursor-default"
                      disabled
                    >
                      <ShieldCheck className="size-4 mr-1.5 text-amber-500" />
                      Included in Super Admin
                    </Button>
                  ) : isCurrent ? (
                    <Button variant="outline" className="w-full" disabled>
                      Current Plan
                    </Button>
                  ) : (
                    <Button asChild className="w-full">
                      <Link to="/settings">
                        {Number(p.monthly_price_inr) > 0
                          ? "Upgrade to " + p.name
                          : "Select " + p.name}
                      </Link>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {isUnlimitedUser && (
        <Card className="border-amber-500/40 bg-gradient-to-r from-amber-500/10 via-background to-primary/10">
          <CardContent className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-amber-500/20 text-amber-500">
                <InfinityIcon className="size-5" />
              </div>
              <div>
                <p className="font-semibold text-sm">Super Admin Master Privilege Active</p>
                <p className="text-xs text-muted-foreground">
                  You have full bypass and unlimited usage over every tier limit, student cap, AI
                  question quota, and storage barrier.
                </p>
              </div>
            </div>
            <Badge
              variant="outline"
              className="border-amber-500/50 text-amber-500 bg-amber-500/10 px-3 py-1"
            >
              Active Tier: Super Admin (∞ Unlimited)
            </Badge>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
