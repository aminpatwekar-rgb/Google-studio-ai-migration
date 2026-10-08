import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check } from "lucide-react";
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/firebase/firestore";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Link } from "@tanstack/react-router";

export function NotificationCenter() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: Boolean(user),
    refetchInterval: 30_000,
    queryFn: () => getNotifications(user!.id, 30),
  });

  const markRead = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  });

  const allRead = useMutation({
    mutationFn: () => markAllNotificationsRead(user!.id),
    onSuccess: () => {
      // Update the visible list immediately, then confirm the persisted state.
      qc.setQueryData(
        ["notifications", user?.id],
        (current: typeof q.data) => current?.map((n) => ({ ...n, read: true })) ?? [],
      );
      qc.invalidateQueries({ queryKey: ["notifications", user?.id] });
    },
  });

  const unread = (q.data ?? []).filter((n) => !n.read).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="size-4" />
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex min-w-4 h-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 sm:w-96">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">Notifications</span>
            {unread > 0 && <Badge variant="secondary">{unread} new</Badge>}
          </div>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => allRead.mutate()}
              disabled={allRead.isPending}
            >
              <Check className="size-3 mr-1" />
              {allRead.isPending ? "Marking..." : "Mark all read"}
            </Button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto divide-y">
          {(q.data ?? []).length === 0 ? (
            <p className="p-4 text-center text-xs text-muted-foreground">No notifications</p>
          ) : (
            (q.data ?? []).map((n) => (
              <div
                key={n.id}
                className={`p-3 text-xs transition-colors hover:bg-muted/50 ${!n.read ? "bg-muted/30 font-medium" : "text-muted-foreground"}`}
                onClick={() => !n.read && markRead.mutate(n.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-foreground">{n.title}</p>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {new Date(n.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <p className="mt-1 text-muted-foreground line-clamp-2">{n.body}</p>
                {n.refId && (
                  <Link to="/dashboard" className="mt-1 inline-block text-primary hover:underline">
                    View
                  </Link>
                )}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
