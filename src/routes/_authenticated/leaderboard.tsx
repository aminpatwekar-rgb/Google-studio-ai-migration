import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Crown, Medal, Trophy, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";
import { getLeaderboard } from "@/lib/firebase/firestore";

export const Route = createFileRoute("/_authenticated/leaderboard")({
  head: () => ({
    meta: [
      { title: "Leaderboard — ONYX" },
      { name: "description", content: "Class and platform rankings in ONYX." },
      { property: "og:title", content: "Leaderboard — ONYX" },
    ],
  }),
  component: LeaderboardPage,
});

function LeaderboardPage() {
  const { user } = useAuth();

  const data = useQuery({
    queryKey: ["leaderboard"],
    queryFn: async () => {
      return await getLeaderboard();
    },
  });

  const list = data.data || [];
  const myRank = list.findIndex((r) => r.userId === user?.id);

  if (data.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Leaderboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Academic points and achievements earned across assignments and quizzes.
          </p>
        </div>

        {myRank !== -1 && (
          <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 px-3.5 py-1.5 rounded-lg text-primary text-sm font-semibold">
            <Trophy className="size-4" />
            <span>Your Rank: #{myRank + 1}</span>
          </div>
        )}
      </header>

      {list.length === 0 ? (
        <div className="panel p-12 text-center border-dashed">
          <Trophy className="mx-auto size-10 text-muted-foreground/60" />
          <h3 className="mt-3 text-base font-semibold">Leaderboard is empty</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Points will appear here as teachers grade assignments and students complete quizzes.
          </p>
        </div>
      ) : (
        <div className="panel overflow-hidden bg-card border-border">
          <div className="divide-y divide-border">
            {list.map((entry, idx) => {
              const isMe = entry.userId === user?.id;
              const rank = idx + 1;

              return (
                <div
                  key={entry.userId || idx}
                  className={`p-4 flex items-center justify-between transition-colors ${
                    isMe ? "bg-primary/5 font-medium" : "hover:bg-muted/30"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className="size-8 flex items-center justify-center font-bold text-sm">
                      {rank === 1 ? (
                        <Crown className="size-6 text-warning fill-warning" />
                      ) : rank === 2 ? (
                        <Medal className="size-5 text-slate-400" />
                      ) : rank === 3 ? (
                        <Medal className="size-5 text-amber-600" />
                      ) : (
                        <span className="text-muted-foreground">#{rank}</span>
                      )}
                    </div>

                    <div>
                      <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                        {entry.userName}
                        {isMe && (
                          <span className="text-[10px] bg-primary text-primary-foreground px-1.5 py-0.2 rounded font-bold">
                            You
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {entry.totalSubmissions || 1} graded tasks
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-base font-bold text-primary tabular-nums">
                      {entry.score} pts
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
