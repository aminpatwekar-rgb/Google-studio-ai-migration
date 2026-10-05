import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, ClipboardList, GraduationCap, Search } from "lucide-react";
import { getAllClasses, getAllAssignments, getAllQuizzes } from "@/lib/firebase/firestore";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

type Result =
  | { kind: "class"; id: string; title: string; subtitle: string }
  | { kind: "assignment"; id: string; title: string; subtitle: string }
  | { kind: "quiz"; id: string; title: string; subtitle: string };

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const query = term.trim().toLowerCase();

  const results = useQuery({
    enabled: open && Boolean(user) && query.length >= 2,
    queryKey: ["global-search", query, user?.id],
    queryFn: async (): Promise<Result[]> => {
      try {
        const [classes, assignments, quizzes] = await Promise.all([
          getAllClasses(),
          getAllAssignments(),
          getAllQuizzes(),
        ]);

        const matchedClasses = classes
          .filter((c) => c.name.toLowerCase().includes(query))
          .slice(0, 6)
          .map((c) => ({
            kind: "class" as const,
            id: c.id,
            title: c.name,
            subtitle: c.subject || "Class",
          }));

        const matchedAssignments = assignments
          .filter((a) => a.title.toLowerCase().includes(query))
          .slice(0, 6)
          .map((a) => ({
            kind: "assignment" as const,
            id: a.id,
            title: a.title,
            subtitle: "Assignment",
          }));

        const matchedQuizzes = quizzes
          .filter((q) => q.title.toLowerCase().includes(query))
          .slice(0, 6)
          .map((q) => ({
            kind: "quiz" as const,
            id: q.id,
            title: q.title,
            subtitle: "Quiz",
          }));

        return [...matchedClasses, ...matchedAssignments, ...matchedQuizzes];
      } catch {
        return [];
      }
    },
  });

  const go = (r: Result) => {
    setOpen(false);
    setTerm("");
    if (r.kind === "class") navigate({ to: "/classes/$classId", params: { classId: r.id } });
    if (r.kind === "assignment")
      navigate({ to: "/assignments/$assignmentId", params: { assignmentId: r.id } });
    if (r.kind === "quiz") navigate({ to: "/quizzes/$quizId", params: { quizId: r.id } });
  };

  const classes = (results.data ?? []).filter((r) => r.kind === "class");
  const assignments = (results.data ?? []).filter((r) => r.kind === "assignment");
  const quizzes = (results.data ?? []).filter((r) => r.kind === "quiz");

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-2 text-xs text-muted-foreground w-40 sm:w-56 justify-between"
        onClick={() => setOpen(true)}
      >
        <span className="flex items-center gap-1.5 truncate">
          <Search className="size-3.5 shrink-0" />
          <span>Search ONYX…</span>
        </span>
        <kbd className="pointer-events-none rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          ⌘K
        </kbd>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-0 overflow-hidden max-w-lg">
          <DialogTitle className="sr-only">Search</DialogTitle>
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search classes, assignments, quizzes…"
              value={term}
              onValueChange={setTerm}
            />
            <CommandList>
              {query.length >= 2 && !results.isLoading && (results.data ?? []).length === 0 && (
                <CommandEmpty>No results found for “{term}”.</CommandEmpty>
              )}
              {query.length < 2 && (
                <p className="p-4 text-center text-xs text-muted-foreground">
                  Type at least 2 characters to search.
                </p>
              )}
              {results.isLoading && (
                <p className="p-4 text-center text-xs text-muted-foreground">Searching…</p>
              )}
              {classes.length > 0 && (
                <CommandGroup heading="Classes">
                  {classes.map((c) => (
                    <CommandItem key={c.id} onSelect={() => go(c)}>
                      <GraduationCap className="size-4 mr-2 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="truncate font-medium">{c.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{c.subtitle}</p>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {assignments.length > 0 && (
                <CommandGroup heading="Assignments">
                  {assignments.map((a) => (
                    <CommandItem key={a.id} onSelect={() => go(a)}>
                      <ClipboardList className="size-4 mr-2 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="truncate font-medium">{a.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{a.subtitle}</p>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {quizzes.length > 0 && (
                <CommandGroup heading="Quizzes">
                  {quizzes.map((q) => (
                    <CommandItem key={q.id} onSelect={() => go(q)}>
                      <BookOpen className="size-4 mr-2 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="truncate font-medium">{q.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{q.subtitle}</p>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
