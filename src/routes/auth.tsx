import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { z } from "zod";
import { Loader2, GraduationCap, Presentation } from "lucide-react";
import { sendPasswordResetEmail } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { auth } from "@/lib/firebase/config";
import { useAuth, type AppRole } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { SPRING_PRESS, getPressProps } from "@/lib/motionPresets";
import onyxMark from "@/assets/onyx-mark.png.asset.json";
import {
  clearSessionConfirmation,
  isSessionConfirmed,
  markSessionConfirmed,
} from "@/lib/session-confirm";

const searchSchema = z.object({
  mode: z.enum(["signin", "signup"]).optional(),
  confirm: z.boolean().optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Sign in — ONYX" },
      {
        name: "description",
        content: "Sign in or create a student or teacher account on ONYX.",
      },
      { property: "og:title", content: "Sign in — ONYX" },
      { property: "og:description", content: "Access your classes, assignments and submissions." },
    ],
  }),
  component: AuthPage,
});

const credentials = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(6, "Password must be at least 6 characters").max(72),
});

function AuthPage() {
  const shouldReduceMotion = useReducedMotion();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { session, profile, loading, signInWithEmail, signUpWithEmail, signInWithGoogle, signOut } =
    useAuth();
  const [mode, setMode] = useState<"signin" | "signup">(search.mode ?? "signup");
  const [role, setRole] = useState<"student" | "teacher">("student");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [switching, setSwitching] = useState(false);

  const confirmed = isSessionConfirmed(session?.user.id);
  const needsConfirm = Boolean(session) && !confirmed && !switching;

  useEffect(() => {
    if (!loading && session && confirmed && !switching) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [loading, session, confirmed, switching, navigate]);

  async function handleUseAnotherAccount() {
    setSwitching(true);
    clearSessionConfirmation();
    await signOut();
    setMode("signin");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = credentials.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]!.message);
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        if (!fullName.trim()) {
          toast.error("Please enter your full name");
          setBusy(false);
          return;
        }
        await signUpWithEmail(parsed.data.email, parsed.data.password, fullName.trim(), role as AppRole);
        if (auth.currentUser) {
          markSessionConfirmed(auth.currentUser.uid);
        }
        setSwitching(false);
        toast.success("Welcome to ONYX");
        navigate({ to: "/dashboard", replace: true });
      } else {
        await signInWithEmail(parsed.data.email, parsed.data.password);
        if (auth.currentUser) {
          markSessionConfirmed(auth.currentUser.uid);
        }
        setSwitching(false);
        toast.success("Signed in");
        navigate({ to: "/dashboard", replace: true });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setBusy(true);
    try {
      await signInWithGoogle();
      if (auth.currentUser) {
        markSessionConfirmed(auth.currentUser.uid);
      }
      toast.success("Signed in with Google");
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  async function forgot() {
    const parsed = z.string().email().safeParse(email.trim());
    if (!parsed.success) {
      toast.error("Enter your email above first");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, parsed.data);
      toast.success("Password reset link sent to your email");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send reset link");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="panel w-full max-w-md p-7"
      >
        <Link to="/" className="mb-6 flex items-center gap-2">
          <img
            src={onyxMark.url}
            width={32}
            height={32}
            decoding="async"
            alt=""
            aria-hidden="true"
            className="size-8 rounded-full object-cover"
          />
          <span className="font-semibold tracking-tight">ONYX</span>
        </Link>

        {needsConfirm ? (
          <div className="space-y-4">
            <h1 className="text-2xl font-semibold">
              Continue as {profile?.full_name?.trim() || session?.user.email || "this account"}?
            </h1>
            <p className="text-sm text-muted-foreground">
              You're already signed in with{" "}
              <span className="font-medium text-foreground">{session?.user.email}</span>.
            </p>
            <Button
              className="w-full"
              onClick={() => {
                markSessionConfirmed(session!.user.id);
                navigate({ to: "/dashboard", replace: true });
              }}
            >
              Continue as {profile?.full_name?.trim().split(" ")[0] || session?.user.email}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => void handleUseAnotherAccount()}
            >
              Use another account
            </Button>
          </div>
        ) : (
          <>
            <div className="mb-6 space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">
                {mode === "signin" ? "Welcome back" : "Create your account"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {mode === "signin"
                  ? "Enter your credentials to access your classes and assignments."
                  : "Start submitting and grading handwriting-first work."}
              </p>
            </div>

            <form onSubmit={submit} className="space-y-4">
              {mode === "signup" && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="name">Full name</Label>
                    <Input
                      id="name"
                      autoComplete="name"
                      placeholder="Jane Doe"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>I am a</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <motion.button
                        type="button"
                        onClick={() => setRole("student")}
                        {...getPressProps(shouldReduceMotion, SPRING_PRESS)}
                        className={cn(
                          "flex items-center gap-2 rounded-md border p-3 text-left text-sm transition-colors",
                          role === "student"
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-input hover:bg-muted/50",
                        )}
                      >
                        <GraduationCap className="size-4" />
                        <div>
                          <p className="font-medium">Student</p>
                          <p className="text-xs text-muted-foreground">Submit assignments</p>
                        </div>
                      </motion.button>
                      <motion.button
                        type="button"
                        onClick={() => setRole("teacher")}
                        {...getPressProps(shouldReduceMotion, SPRING_PRESS)}
                        className={cn(
                          "flex items-center gap-2 rounded-md border p-3 text-left text-sm transition-colors",
                          role === "teacher"
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-input hover:bg-muted/50",
                        )}
                      >
                        <Presentation className="size-4" />
                        <div>
                          <p className="font-medium">Teacher</p>
                          <p className="text-xs text-muted-foreground">Manage classes</p>
                        </div>
                      </motion.button>
                    </div>
                  </div>
                </>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@school.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  {mode === "signin" && (
                    <button
                      type="button"
                      onClick={forgot}
                      className="text-xs text-muted-foreground underline hover:text-foreground"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <Input
                  id="password"
                  type="password"
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <Button type="submit" className="w-full press" disabled={busy}>
                {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
                {mode === "signin" ? "Sign in" : "Create account"}
              </Button>
            </form>

            <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
            </div>

            <Button
              variant="outline"
              className="w-full press"
              onClick={handleGoogle}
              disabled={busy}
            >
              Continue with Google
            </Button>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              {mode === "signin" ? "Don't have an account?" : "Already have an account?"}{" "}
              <button
                type="button"
                onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                className="font-medium text-primary hover:underline"
              >
                {mode === "signin" ? "Sign up" : "Sign in"}
              </button>
            </p>
          </>
        )}
      </motion.div>
    </div>
  );
}
