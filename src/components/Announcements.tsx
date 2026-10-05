import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Megaphone, Trash2 } from "lucide-react";
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type AnnouncementRow = {
  id: string;
  title: string;
  body: string | null;
  audience: string;
  class_id: string | null;
  author_id: string;
  created_at: string;
  profiles: { full_name: string } | null;
  announcement_attachments?: Array<any>;
};

const AUDIENCE_LABEL: Record<string, string> = {
  everyone: "Everyone",
  teachers: "Teachers",
  students: "Students",
  class: "This class",
};

export function useAnnouncements(classId?: string) {
  return useQuery({
    queryKey: ["announcements", classId ?? "platform"],
    queryFn: async () => {
      try {
        const colRef = collection(db, "announcements");
        const q = classId
          ? query(colRef, where("class_id", "==", classId))
          : query(colRef, where("class_id", "==", null));

        const snap = await getDocs(q);
        const list = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            title: data.title || "Announcement",
            body: data.body || null,
            audience: data.audience || "everyone",
            class_id: data.class_id || null,
            author_id: data.author_id || "",
            created_at: data.created_at || new Date().toISOString(),
            profiles: { full_name: data.author_name || "Instructor" },
            announcement_attachments: [],
          } as AnnouncementRow;
        });

        return list.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
      } catch {
        return [];
      }
    },
  });
}

export function Announcements({
  classId,
  canPost,
  emptyText = "No announcements yet.",
}: {
  classId?: string;
  canPost: boolean;
  emptyText?: string;
}) {
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState(classId ? "class" : "everyone");

  const list = useAnnouncements(classId);

  const post = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("A title is required");
      if (!user) throw new Error("Sign in to publish an announcement");

      const newRef = doc(collection(db, "announcements"));
      await setDoc(newRef, {
        id: newRef.id,
        author_id: user.id,
        author_name: profile?.name || profile?.full_name || "Teacher",
        class_id: classId ?? null,
        audience: classId ? "class" : audience,
        title: title.trim().slice(0, 160),
        body: body.trim() || null,
        created_at: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      toast.success("Announcement published");
      setTitle("");
      setBody("");
      void qc.invalidateQueries({ queryKey: ["announcements"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await deleteDoc(doc(db, "announcements", id));
    },
    onSuccess: () => {
      toast.success("Announcement removed");
      void qc.invalidateQueries({ queryKey: ["announcements"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      {canPost && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            post.mutate();
          }}
          className="panel space-y-4 p-5"
        >
          <div className="flex items-center gap-2">
            <Megaphone className="size-4 text-primary" />
            <h2 className="text-sm font-semibold">Post announcement</h2>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ann-title">Title</Label>
            <Input
              id="ann-title"
              placeholder="Important update about exam schedule"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={post.isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ann-body">Message</Label>
            <Textarea
              id="ann-body"
              rows={3}
              placeholder="Share details, instructions or deadlines…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={post.isPending}
            />
          </div>
          {!classId && (
            <div className="space-y-2">
              <Label>Audience</Label>
              <Select value={audience} onValueChange={setAudience} disabled={post.isPending}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="everyone">Everyone</SelectItem>
                  <SelectItem value="teachers">Teachers only</SelectItem>
                  <SelectItem value="students">Students only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex justify-end">
            <Button type="submit" disabled={post.isPending || !title.trim()}>
              {post.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Publish announcement
            </Button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {list.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (list.data ?? []).length === 0 ? (
          <p className="panel p-6 text-center text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          (list.data ?? []).map((ann) => (
            <div key={ann.id} className="panel space-y-2 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-base">{ann.title}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Posted by {ann.profiles?.full_name ?? "Instructor"} ·{" "}
                    {new Date(ann.created_at).toLocaleDateString()}
                    {ann.audience && ann.audience !== "class" && (
                      <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                        {AUDIENCE_LABEL[ann.audience] ?? ann.audience}
                      </span>
                    )}
                  </p>
                </div>
                {(canPost || user?.id === ann.author_id) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => remove.mutate(ann.id)}
                    disabled={remove.isPending}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
              {ann.body && (
                <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                  {ann.body}
                </p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
