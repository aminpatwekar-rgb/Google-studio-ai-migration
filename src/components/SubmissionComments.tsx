import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { collection, doc, getDocs, setDoc, deleteDoc, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

type CommentRow = {
  id: string;
  body: string;
  created_at: string;
  author_id: string;
  profiles: { full_name: string } | null;
};

export function SubmissionComments({ submissionId }: { submissionId: string }) {
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const [body, setBody] = useState("");

  const q = useQuery({
    queryKey: ["comments", submissionId],
    queryFn: async () => {
      try {
        const snap = await getDocs(
          query(
            collection(db, "submissions", submissionId, "comments"),
            orderBy("created_at", "asc"),
          ),
        );
        return snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            body: data.body || "",
            created_at: data.created_at || new Date().toISOString(),
            author_id: data.author_id || "",
            profiles: { full_name: data.author_name || "User" },
          } as CommentRow;
        });
      } catch {
        return [] as CommentRow[];
      }
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const text = body.trim();
      if (!text) throw new Error("Write something first");
      if (!user) throw new Error("Sign in to comment");

      const ref = doc(collection(db, "submissions", submissionId, "comments"));
      await setDoc(ref, {
        id: ref.id,
        author_id: user.id,
        author_name: profile?.name || profile?.full_name || "User",
        body: text.slice(0, 2000),
        created_at: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      setBody("");
      void qc.invalidateQueries({ queryKey: ["comments", submissionId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await deleteDoc(doc(db, "submissions", submissionId, "comments", id));
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["comments", submissionId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const comments = q.data ?? [];

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold">Teacher–Student Discussion</h2>

      {q.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
        </div>
      ) : comments.length === 0 ? (
        <p className="panel p-4 text-xs text-muted-foreground">
          No feedback comments yet. Use this thread for questions or notes on this submission.
        </p>
      ) : (
        <div className="panel divide-y divide-border">
          {comments.map((c) => {
            const name = c.profiles?.full_name || "User";
            const isAuthor = c.author_id === user?.id;
            return (
              <div key={c.id} className="flex items-start gap-3 p-3.5">
                <Avatar className="size-7">
                  <AvatarFallback className="text-[10px]">
                    {name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium">
                      {name}{" "}
                      <span className="font-normal text-[11px] text-muted-foreground">
                        {new Date(c.created_at).toLocaleString()}
                      </span>
                    </p>
                    {isAuthor && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 text-muted-foreground hover:text-destructive"
                        onClick={() => remove.mutate(c.id)}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-foreground whitespace-pre-wrap">{c.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
        className="space-y-2"
      >
        <Textarea
          rows={2}
          placeholder="Add a comment or question about this submission…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={add.isPending || !body.trim()}>
            {add.isPending && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            Send comment
          </Button>
        </div>
      </form>
    </section>
  );
}
