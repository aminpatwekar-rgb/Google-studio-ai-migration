import { useQuery } from "@tanstack/react-query";
import { HardDrive, Sparkles } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getPlanSummary } from "@/lib/onyx.features.functions";

function bytes(n: number) {
  if (n < 0) return "Unlimited";
  if (n < 1024 ** 2) return `${Math.round(n / 1024)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}
function limit(n: unknown) {
  const v = Number(n);
  return v < 0 ? "Unlimited" : String(v);
}

export function PlanUsageCard() {
  const get = useServerFn(getPlanSummary);
  const q = useQuery({ queryKey: ["plan-summary"], queryFn: () => get(), staleTime: 30_000 });
  if (q.isLoading)
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">Loading plan…</CardContent>
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
  const p = q.data.plan;
  const limits = (p?.limits ?? {}) as Record<string, number>;
  const features = (p?.features ?? {}) as Record<string, boolean>;
  const storageLimit = Number(limits.storage_bytes ?? 0);
  const storageUsed = Number(q.data.storageUsed ?? 0);
  const storagePct = storageLimit > 0 ? Math.min(100, (storageUsed / storageLimit) * 100) : 0;
  return (
    <Card className="lift">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-5 text-primary" />
          {p?.name ?? "Free"} plan
        </CardTitle>
        <CardDescription>
          Entitlements and usage are enforced by ONYX, not just the UI.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <HardDrive className="size-4" />
              Storage
            </span>
            <span className="text-muted-foreground">
              {bytes(storageUsed)} / {storageLimit < 0 ? "Unlimited" : bytes(storageLimit)}
            </span>
          </div>
          <Progress value={storagePct} />
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
          <div className="rounded-lg border border-border p-3">
            <span className="text-muted-foreground">Classes</span>
            <p className="mt-1 font-semibold">
              {limits.max_classes < 0 ? "Unlimited" : limits.max_classes}
            </p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <span className="text-muted-foreground">Students/class</span>
            <p className="mt-1 font-semibold">{limit(limits.max_students_per_class)}</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <span className="text-muted-foreground">AI/month</span>
            <p className="mt-1 font-semibold">{limit(limits.ai_questions_per_month)}</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <span className="text-muted-foreground">Question bank</span>
            <p className="mt-1 font-semibold">
              {limits.question_bank_total < 0 ? "Unlimited" : limits.question_bank_total}
            </p>
          </div>
          <div className="rounded-lg border border-border p-3 col-span-2 sm:col-span-2">
            <span className="text-muted-foreground">Premium features</span>
            <p className="mt-1 font-semibold">
              {Object.values(features).filter(Boolean).length} enabled
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
