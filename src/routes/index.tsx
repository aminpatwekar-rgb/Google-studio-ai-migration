import { createFileRoute, Link } from "@tanstack/react-router";
import {
  PenLine,
  ShieldCheck,
  Camera,
  BarChart3,
  ArrowRight,
  Moon,
  Sun,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ONYX — Handwriting-First Assignment Submission & Tracking" },
      {
        name: "description",
        content:
          "A handwriting-first assignment platform for schools and colleges. Create classes, set assignments, submit scanned or locked typed work, and review with marks and feedback.",
      },
      { property: "og:title", content: "ONYX — Handwriting-First Assignment Platform" },
      {
        property: "og:description",
        content:
          "Classes, assignments, handwritten uploads, a paste-locked typed editor, and teacher review with marks and annotations.",
      },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  {
    icon: Camera,
    title: "Handwritten first",
    body: "Capture pages with the camera, drag in scans, or upload multi-page PDFs. Pages stay ordered and private.",
  },
  {
    icon: ShieldCheck,
    title: "Locked typed editor",
    body: "Copy, paste, right-click and text drag are blocked. Every attempt raises a warning and is flagged to the teacher.",
  },
  {
    icon: PenLine,
    title: "Review with intent",
    body: "Zoom and rotate pages, leave comments, award marks, then return or approve in one pass.",
  },
  {
    icon: BarChart3,
    title: "Progress that reads clearly",
    body: "Upcoming, overdue, submitted and completion percentage — colour-coded across every dashboard.",
  },
];

function Landing() {
  const { theme, toggle } = useTheme();

  return (
    <div className="min-h-screen">
      <header className="glass sticky top-0 z-40 mx-auto flex max-w-6xl items-center justify-between rounded-b-2xl px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="brand-gradient flex size-8 items-center justify-center rounded-lg text-sm font-bold text-primary-foreground">
            O
          </span>
          <span className="font-semibold tracking-tight">ONYX</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
          <Button asChild size="sm">
            <Link to="/auth">Get started</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5">
        <section className="py-20 sm:py-28">
          <div className="landing-hero-reveal max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <CheckCircle2 className="size-3.5 text-success" /> Built for schools and colleges
            </span>
            <h1 className="mt-6 text-5xl leading-[1.05] sm:text-6xl">
              <span className="text-display">Handwriting</span> deserves a
              <br />
              <span className="text-display">modern</span> submission flow.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted-foreground">
              ONYX gives teachers classes, assignments and review tools — and gives students a calm
              place to submit scanned pages or typed work that can't be pasted in.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/auth">
                  Create your account <ArrowRight className="ml-1 size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/auth" search={{ mode: "signin" }}>
                  I already have one
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 pb-24 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <article
              key={f.title}
              className="panel lift landing-feature-reveal p-6 hover:lift-hover"
            >
              <f.icon className="size-5 text-primary" />
              <h2 className="mt-4 text-lg font-semibold">{f.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
            </article>
          ))}
        </section>
      </main>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        ONYX — Online Network for Yielding Xcellence. Assignment submission &amp; tracking.
      </footer>
    </div>
  );
}
