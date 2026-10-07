import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Award, CheckCircle2, Lock, Sparkles, Star } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";
import { getAchievements, getUserAchievements } from "@/lib/firebase/firestore";

export const Route = createFileRoute("/_authenticated/achievements")({
  head: () => ({
    meta: [
      { title: "Achievements — ONYX" },
      { name: "description", content: "Badges you have earned in ONYX." },
      { property: "og:title", content: "Achievements — ONYX" },
    ],
  }),
  component: AchievementsPage,
});

function AchievementsPage() {
  const { user } = useAuth();

  const data = useQuery({
    queryKey: ["achievements-data", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const [all, mine] = await Promise.all([
        getAchievements(),
        user ? getUserAchievements(user.id) : [],
      ]);
      const earnedMap = new Map(mine.map((m) => [m.achievementId, m]));
      const totalPoints = mine.reduce((sum, item) => sum + (item.points || 0), 0);
      return { all, earnedMap, totalPoints };
    },
  });

  if (data.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const { all, earnedMap, totalPoints } = data.data || {
    all: [],
    earnedMap: new Map(),
    totalPoints: 0,
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Achievements
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Earn badges and points by turning in assignments and completing quizzes.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 px-3.5 py-1.5 rounded-lg text-primary text-sm font-semibold">
          <Sparkles className="size-4" />
          <span>{totalPoints} Points Earned</span>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {all.map((badge) => {
          const earned = earnedMap.get(badge.id);

          return (
            <div
              key={badge.id}
              className={`panel p-5 flex flex-col justify-between border transition-all ${
                earned
                  ? "bg-card border-primary/40 shadow-xs"
                  : "bg-muted/30 border-border/60 opacity-60"
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div
                    className={`size-10 rounded-full flex items-center justify-center ${
                      earned ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <Award className="size-5" />
                  </div>
                  <span className="text-xs font-bold text-primary font-mono">
                    +{badge.points} pts
                  </span>
                </div>

                <div>
                  <h3 className="font-semibold text-base text-foreground flex items-center gap-1.5">
                    {badge.title}
                    {earned && <CheckCircle2 className="size-4 text-success" />}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">{badge.description}</p>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t text-[11px] text-muted-foreground flex items-center justify-between">
                {earned ? (
                  <span className="text-success font-medium">
                    Unlocked on {new Date(earned.earnedAt).toLocaleDateString()}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Lock className="size-3" /> Locked
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
