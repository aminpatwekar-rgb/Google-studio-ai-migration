import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { Send, Trash2 } from "lucide-react";
import { collection, doc, getDocs, setDoc, deleteDoc, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/lib/auth";
import { SPRING_PRESS, getPressProps } from "@/lib/motionPresets";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

type Post = {
  id: string;
  body: string;
  author_id: string;
  parent_id: string | null;
  created_at: string;
  profiles: { full_name: string } | null;
};

/** Class discussion board with one level of threaded replies. */
export function ClassDiscussion({
  classId,
  canModerate,
}: {
  classId: string;
  canModerate: boolean;
}) {
  const shouldReduceMotion = useReducedMotion();
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");

  const posts = useQuery({
    queryKey: ["class-discussion", classId],
    queryFn: async () => {
      try {
        const snap = await getDocs(
          query(collection(db, "classes", classId, "discussions"), orderBy("created_at", "asc")),
        );
        return snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            body: data.body || "",
            author_id: data.author_id || "",
            parent_id: data.parent_id || null,
            created_at: data.created_at || new Date().toISOString(),
            profiles: { full_name: data.author_name || "Member" },
          } as Post;
        });
      } catch {
        return [] as Post[];
      }
    },
  });

  const add = useMutation({
    mutationFn: async ({ text, parent }: { text: string; parent: string | null }) => {
      const trimmed = text.trim();
      if (!trimmed) throw new Error("Write something first");
      if (!user) throw new Error("Sign in to comment");

      const ref = doc(collection(db, "classes", classId, "discussions"));
      await setDoc(ref, {
        id: ref.id,
        author_id: user.id,
        author_name: profile?.name || profile?.full_name || "Member",
        parent_id: parent,
        body: trimmed.slice(0, 2000),
        created_at: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      setBody("");
      setReplyBody("");
      setReplyTo(null);
      void qc.invalidateQueries({ queryKey: ["class-discussion", classId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await deleteDoc(doc(db, "classes", classId, "discussions", id));
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["class-discussion", classId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const all = posts.data ?? [];
  const roots = all.filter((p) => !p.parent_id);

  function Row({ p, nested = false }: { p: Post; nested?: boolean }) {
    const name = p.profiles?.full_name?.trim() || "Member";
    return (
      <div className={nested ? "ml-11 mt-3 border-l border-border pl-4" : ""}>
        <div className="flex items-start gap-3">
          <Avatar className="size-8">
            <AvatarFallback className="text-xs">{name.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {name}{" "}
              <span className="font-normal text-xs text-muted-foreground">
                {new Date(p.created_at).toLocaleString()}
              </span>
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{p.body}</p>
            {!nested && (
              <motion.button
                type="button"
                {...getPressProps(shouldReduceMotion, { hoverScale: 1.05, tapScale: 0.95 })}
                className="mt-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={() => setReplyTo(replyTo === p.id ? null : p.id)}
              >
                Reply
              </motion.button>
            )}
          </div>
          {(p.author_id === user?.id || canModerate) && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Delete message"
              onClick={() => remove.mutate(p.id)}
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
        {!nested && replyTo === p.id && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              add.mutate({ text: replyBody, parent: p.id });
            }}
            className="ml-11 mt-3 space-y-2"
          >
            <Textarea
              rows={2}
              placeholder="Write a reply…"
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setReplyTo(null)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={add.isPending}>
                <Send className="mr-1 size-3" /> Reply
              </Button>
            </div>
          </form>
        )}
        {!nested &&
          all
            .filter((child) => child.parent_id === p.id)
            .map((child) => <Row key={child.id} p={child} nested />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate({ text: body, parent: null });
        }}
        className="panel space-y-3 p-4"
      >
        <Textarea
          rows={3}
          placeholder="Ask a question or start a discussion with your class…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="flex justify-end">
          <Button type="submit" disabled={add.isPending || !body.trim()}>
            <Send className="mr-2 size-4" /> Post to class
          </Button>
        </div>
      </form>

      {posts.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : roots.length === 0 ? (
        <p className="panel p-6 text-center text-sm text-muted-foreground">
          No discussion yet. Start the conversation!
        </p>
      ) : (
        <div className="panel divide-y divide-border p-4 space-y-4">
          {roots.map((p) => (
            <div key={p.id} className="pt-4 first:pt-0">
              <Row p={p} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
