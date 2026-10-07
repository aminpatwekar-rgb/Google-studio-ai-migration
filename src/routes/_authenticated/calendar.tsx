import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getAllAssignments, getAllQuizzes } from "@/lib/firebase/firestore";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { PlanGate } from "@/components/PlanGate";

type EventRow = {
  id: string;
  title: string;
  starts_at: string;
  event_type: string;
  link: string;
};

export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => ({ meta: [{ title: "Calendar — ONYX" }] }),
  component: Page,
});

function Page() {
  const { user } = useAuth();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const monthKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-01`;

  const q = useQuery({
    queryKey: ["onyx-calendar", user?.id, monthKey],
    enabled: Boolean(user),
    queryFn: async () => {
      const from = new Date(cursor.getFullYear(), cursor.getMonth(), 1).getTime();
      const to = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1).getTime();

      const [assignments, quizzes] = await Promise.all([getAllAssignments(), getAllQuizzes()]);

      const events: EventRow[] = [];

      for (const a of assignments) {
        if (a.dueDate) {
          const t = new Date(a.dueDate).getTime();
          if (t >= from && t < to) {
            events.push({
              id: `a-${a.id}`,
              title: a.title,
              starts_at: a.dueDate,
              event_type: "assignment",
              link: `/assignments/${a.id}`,
            });
          }
        }
      }

      for (const qz of quizzes) {
        if (qz.createdAt) {
          const t = new Date(qz.createdAt).getTime();
          if (t >= from && t < to) {
            events.push({
              id: `q-${qz.id}`,
              title: qz.title,
              starts_at: qz.createdAt,
              event_type: "quiz",
              link: `/quizzes/${qz.id}`,
            });
          }
        }
      }

      return events.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    },
  });

  const days = useMemo(() => {
    const y = cursor.getFullYear(),
      m = cursor.getMonth();
    const start = new Date(y, m, 1).getDay(),
      count = new Date(y, m + 1, 0).getDate();
    const cells: Array<number | null> = Array(start).fill(null);
    for (let i = 1; i <= count; i++) cells.push(i);
    while (cells.length % 7) cells.push(null);
    return cells;
  }, [cursor]);

  const byDay = useMemo(() => {
    const map = new Map<number, EventRow[]>();
    for (const e of q.data ?? []) {
      const d = new Date(e.starts_at).getDate();
      map.set(d, [...(map.get(d) ?? []), e]);
    }
    return map;
  }, [q.data]);

  return (
    <PlanGate feature="calendar">
      <div className="space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Calendar</h1>
            <p className="text-sm text-muted-foreground">
              Assignments, quizzes and scheduled ONYX events.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            >
              <ChevronLeft />
            </Button>
            <p className="min-w-32 text-center font-medium">
              {cursor.toLocaleString(undefined, { month: "long", year: "numeric" })}
            </p>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            >
              <ChevronRight />
            </Button>
          </div>
        </header>
        <div className="panel overflow-hidden">
          <div className="grid grid-cols-7 border-b border-border text-xs font-medium text-muted-foreground">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="p-2 text-center">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day, i) => (
              <div key={i} className="min-h-28 border-b border-r border-border p-2">
                <p className="text-xs font-medium">{day ?? ""}</p>
                <div className="mt-1 space-y-1">
                  {day
                    ? (byDay.get(day) ?? []).slice(0, 4).map((e) => (
                        <Link
                          key={e.id}
                          to={e.link}
                          className="block truncate rounded bg-muted px-1.5 py-1 text-[11px] hover:bg-primary/10"
                        >
                          {e.title}
                        </Link>
                      ))
                    : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PlanGate>
  );
}
