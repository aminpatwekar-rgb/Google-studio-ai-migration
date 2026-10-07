import { useQuery } from "@tanstack/react-query";
import {
  HardDrive,
  Sparkles,
  Crown,
  Infinity as InfinityIcon,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getPlanSummary } from "@/lib/onyx.features.functions";
import { useAuth } from "@/lib/auth";

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
  const { isSuperAdmin, role } = useAuth();
  const get = useServerFn(getPlanSummary);
  const q = useQuery({
    queryKey: ["plan-summary"],
    queryFn: () => get(),
    staleTime: 30_000,
    retry: 2,
  });

  if (q.isLoading) {
    return (
      <Card className="lift">
        <CardContent className="p-6 text-sm text-muted-foreground flex items-center gap-2">
          <RefreshCw className="size-4 animate-spin text-primary" />
          Loading plan details…
        </CardContent>
      </Card>
    );
  }

  const isUnlimitedUser =
    isSuperAdmin || q.data?.isSuperAdmin || role === "admin" || q.data?.isUnlimited;
  const p = q.data?.plan;
  const limits = (p?.limits ?? {}) as Record<string, number>;
  const features = (p?.features ?? {}) as Record<string, boolean>;
  const storageLimit = isUnlimitedUser ? -1 : Number(limits.storage_bytes ?? 0);
  const storageUsed = Number(q.data?.storageUsed ?? 0);
  const storagePct = storageLimit > 0 ? Math.min(100, (storageUsed / storageLimit) * 100) : 0;

  if (q.isError && !isUnlimitedUser) {
    return (
      <Card className="lift border-destructive/30">
        <CardContent className="p-6 flex items-center justify-between">
          <p className="text-sm text-destructive">Could not load plan information.</p>
          <Button variant="outline" size="sm" onClick={() => q.refetch()} className="gap-2">
            <RefreshCw className="size-3.5" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={`lift relative overflow-hidden ${isUnlimitedUser ? "border-amber-500/40 bg-gradient-to-br from-amber-500/5 via-background to-primary/5" : ""}`}
    >
      {isUnlimitedUser && (
        <div className="absolute right-0 top-0 h-16 w-16 overflow-hidden pointer-events-none">
          <div className="absolute transform rotate-45 bg-amber-500 text-[10px] font-bold text-black py-0.5 right-[-35px] top-[18px] w-[120px] text-center shadow-sm">
            ALL-ACCESS
          </div>
        </div>
      )}

      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            {isUnlimitedUser ? (
              <>
                <Crown className="size-5 text-amber-500 fill-amber-500/20" />
                <span>Super Admin</span>
              </>
            ) : (
              <>
                <Sparkles className="size-5 text-primary" />
                <span>{p?.name ?? "Free"} Plan</span>
              </>
            )}
          </CardTitle>

          {isUnlimitedUser ? (
            <Badge
              variant="outline"
              className="border-amber-500/50 bg-amber-500/10 text-amber-500 font-semibold gap-1.5"
            >
              <InfinityIcon className="size-3.5" />
              Everything Unlimited
            </Badge>
          ) : (
            <Badge variant="secondary">{p?.name || "Free"}</Badge>
          )}
        </div>
        <CardDescription>
          {isUnlimitedUser
            ? "Your Super Admin account has zero quotas, infinite storage, and all platform features permanently unlocked."
            : "Entitlements and usage are enforced by ONYX, not just the UI."}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <div>
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <HardDrive className="size-4 text-muted-foreground" />
              Cloud Storage
            </span>
            <span className="text-muted-foreground font-medium">
              {bytes(storageUsed)} /{" "}
              {isUnlimitedUser || storageLimit < 0 ? "Unlimited (∞)" : bytes(storageLimit)}
            </span>
          </div>
          {isUnlimitedUser ? (
            <div className="h-2 w-full rounded-full bg-amber-500/20 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-amber-500 to-primary w-full rounded-full" />
            </div>
          ) : (
            <Progress value={storagePct} />
          )}
        </div>

        <div className="grid grid-cols-2 gap-2.5 text-xs sm:grid-cols-3">
          <div className="rounded-lg border border-border/70 bg-card p-3 shadow-xs">
            <span className="text-muted-foreground">Classes</span>
            <p className="mt-1 font-semibold text-sm flex items-center gap-1">
              {isUnlimitedUser || limits.max_classes < 0 ? (
                <>
                  <InfinityIcon className="size-4 text-amber-500" />
                  <span>Unlimited</span>
                </>
              ) : (
                (limits.max_classes ?? 2)
              )}
            </p>
          </div>

          <div className="rounded-lg border border-border/70 bg-card p-3 shadow-xs">
            <span className="text-muted-foreground">Students / class</span>
            <p className="mt-1 font-semibold text-sm flex items-center gap-1">
              {isUnlimitedUser || Number(limits.max_students_per_class) < 0 ? (
                <>
                  <InfinityIcon className="size-4 text-amber-500" />
                  <span>Unlimited</span>
                </>
              ) : (
                limit(limits.max_students_per_class)
              )}
            </p>
          </div>

          <div className="rounded-lg border border-border/70 bg-card p-3 shadow-xs">
            <span className="text-muted-foreground">AI questions / month</span>
            <p className="mt-1 font-semibold text-sm flex items-center gap-1">
              {isUnlimitedUser || Number(limits.ai_questions_per_month) < 0 ? (
                <>
                  <InfinityIcon className="size-4 text-amber-500" />
                  <span>Unlimited</span>
                </>
              ) : (
                limit(limits.ai_questions_per_month)
              )}
            </p>
          </div>

          <div className="rounded-lg border border-border/70 bg-card p-3 shadow-xs">
            <span className="text-muted-foreground">Question bank</span>
            <p className="mt-1 font-semibold text-sm flex items-center gap-1">
              {isUnlimitedUser || Number(limits.question_bank_total) < 0 ? (
                <>
                  <InfinityIcon className="size-4 text-amber-500" />
                  <span>Unlimited</span>
                </>
              ) : (
                (limits.question_bank_total ?? 50)
              )}
            </p>
          </div>

          <div className="rounded-lg border border-border/70 bg-card p-3 shadow-xs col-span-2 sm:col-span-2">
            <span className="text-muted-foreground">Platform features</span>
            <p className="mt-1 font-semibold text-sm flex items-center gap-1.5 text-primary">
              <ShieldCheck className="size-4 text-green-500" />
              {isUnlimitedUser
                ? "All 18+ features active (100% Unlocked)"
                : `${Object.values(features).filter(Boolean).length} features enabled`}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
