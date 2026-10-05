import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check } from "lucide-react";
import {
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  updateDoc,
  doc,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Link } from "@tanstack/react-router";

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  link?: string | null;
  kind?: string | null;
  readAt?: string | null;
  createdAt: string;
}

export function NotificationCenter() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: Boolean(user),
    refetchInterval: 30_000,
    queryFn: async () => {
      if (!user) return [];
      try {
        const notifRef = collection(db, "users", user.id, "notifications");
        const notifQuery = query(notifRef, orderBy("createdAt", "desc"), limit(30));
        const snap = await getDocs(notifQuery);
        return snap.docs.map((d) => ({
          id: d.id,
          title: d.data().title || "Notification",
          body: d.data().body || "",
          link: d.data().link || null,
          kind: d.data().kind || null,
          readAt: d.data().readAt || null,
          createdAt: d.data().createdAt || new Date().toISOString(),
        })) as NotificationItem[];
      } catch {
        return [];
      }
    },
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      if (!user) return;
      await updateDoc(doc(db, "users", user.id, "notifications", id), {
        readAt: new Date().toISOString(),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  });

  const allRead = useMutation({
    mutationFn: async () => {
      if (!user) return;
      const unreadList = (q.data ?? []).filter((n) => !n.readAt);
      if (unreadList.length === 0) return;
      const batch = writeBatch(db);
      for (const item of unreadList) {
        batch.update(doc(db, "users", user.id, "notifications", item.id), {
          readAt: new Date().toISOString(),
        });
      }
      await batch.commit();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  });

  const unread = (q.data ?? []).filter((n) => !n.readAt).length;

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
            >
              <Check className="size-3 mr-1" /> Mark all read
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
                className={`p-3 text-xs transition-colors hover:bg-muted/50 ${
                  !n.readAt ? "bg-muted/30 font-medium" : "text-muted-foreground"
                }`}
                onClick={() => !n.readAt && markRead.mutate(n.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-foreground">{n.title}</p>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {new Date(n.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <p className="mt-1 text-muted-foreground line-clamp-2">{n.body}</p>
                {n.link && (
                  <Link to={n.link} className="mt-1 inline-block text-primary hover:underline">
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
