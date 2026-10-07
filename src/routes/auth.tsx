import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { z } from "zod";
import {
  Loader2,
  GraduationCap,
  Presentation,
  ArrowRight,
  UserCheck,
  Mail,
  CheckCircle2,
  KeyRound,
} from "lucide-react";
import { sendPasswordResetEmail } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
      { title: "Sign up or Sign in — ONYX" },
      {
        name: "description",
        content: "Create your student or teacher account, or sign in to ONYX.",
      },
      { property: "og:title", content: "Account Access — ONYX" },
      {
        property: "og:description",
        content: "Access your classes, assignments and handwriting tools.",
      },
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
  const {
    session,
    user,
    profile,
    loading,
    needsRoleSelection,
    signInWithEmail,
    signUpWithEmail,
    completeSignUp,
    signInWithGoogle,
    signOut,
  } = useAuth();

  const [mode, setMode] = useState<"signin" | "signup">(search.mode ?? "signup");
  const [role, setRole] = useState<"student" | "teacher">("student");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [switching, setSwitching] = useState(false);

  // Forgot password modal state
  const [forgotOpen, setForgotOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);

  // If authenticated user needs to choose role, populate name from provider if blank
  useEffect(() => {
    if (user && !fullName) {
      setFullName(user.displayName || user.email?.split("@")[0] || "");
    }
  }, [user, fullName]);

  const confirmed = isSessionConfirmed(session?.user.id);
  const isExistingUserConfirmed = Boolean(session) && Boolean(profile) && confirmed && !switching;
  const needsExistingUserConfirm = Boolean(session) && Boolean(profile) && !confirmed && !switching;
  const requiresRoleSelection = Boolean(user) && (needsRoleSelection || !profile) && !switching;

  useEffect(() => {
    if (!loading && isExistingUserConfirmed) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [loading, isExistingUserConfirmed, navigate]);

  async function handleUseAnotherAccount() {
    setSwitching(true);
    clearSessionConfirmation();
    await signOut();
    setMode("signup");
    setFullName("");
    setEmail("");
    setPassword("");
    setSwitching(false);
  }

  async function handleCompleteRoleOnboarding(e: React.FormEvent) {
    e.preventDefault();
    const finalName = fullName.trim() || user?.displayName || user?.email?.split("@")[0] || "User";
    if (!finalName) {
      toast.error("Please enter your name to complete sign up");
      return;
    }
    setBusy(true);
    try {
      await completeSignUp(role, finalName);
      toast.success(
        `Welcome to ONYX! Registered as ${role === "teacher" ? "Teacher" : "Student"}.`,
      );
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to finish registration");
    } finally {
      setBusy(false);
    }
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
        try {
          await signUpWithEmail(
            parsed.data.email,
            parsed.data.password,
            fullName.trim(),
            role as AppRole,
          );
          if (auth.currentUser) {
            markSessionConfirmed(auth.currentUser.uid);
          }
          setSwitching(false);
          toast.success(
            `Welcome to ONYX! Registered as ${role === "teacher" ? "Teacher" : "Student"}.`,
          );
          navigate({ to: "/dashboard", replace: true });
        } catch (signUpErr: any) {
          const errCode = signUpErr?.code || "";
          const errMsg = String(signUpErr?.message || "");
          if (errCode === "auth/email-already-in-use" || errMsg.includes("email-already-in-use")) {
            // User already created an account! Try to sign them in with these credentials
            try {
              const existingProfile = await signInWithEmail(
                parsed.data.email,
                parsed.data.password,
              );
              if (auth.currentUser) {
                markSessionConfirmed(auth.currentUser.uid);
              }
              setSwitching(false);
              if (existingProfile) {
                toast.success("Account already exists — successfully signed you in!");
                navigate({ to: "/dashboard", replace: true });
                return;
              } else {
                await completeSignUp(role === "teacher" ? "teacher" : "student", fullName.trim());
                toast.success(
                  `Registration completed! Welcome to ONYX as ${role === "teacher" ? "Teacher" : "Student"}.`,
                );
                navigate({ to: "/dashboard", replace: true });
                return;
              }
            } catch {
              setMode("signin");
              toast.info(
                "An account with this email already exists. Please enter your password to sign in, or click 'Forgot password?' to reset it.",
                { duration: 6000 },
              );
              return;
            }
          }
          throw signUpErr;
        }
      } else {
        const existingProfile = await signInWithEmail(parsed.data.email, parsed.data.password);
        if (auth.currentUser) {
          markSessionConfirmed(auth.currentUser.uid);
        }
        setSwitching(false);
        toast.success("Signed in");
        if (existingProfile) {
          navigate({ to: "/dashboard", replace: true });
        }
      }
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : "Authentication failed";
      // If user does not exist in Firebase, prompt them to sign up and choose role
      if (
        msg.includes("user-not-found") ||
        msg.includes("invalid-credential") ||
        msg.includes("invalid-login-credentials")
      ) {
        toast.error(
          "No account found or invalid credentials. If you are new, please sign up and choose your role.",
        );
        setMode("signup");
      } else {
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setBusy(true);
    try {
      await signInWithGoogle();
      // If user is brand new, needsRoleSelection is set to true by loadProfile.
      // The page stays here and shows the role selection screen!
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  function handleOpenForgot() {
    setResetEmail(email.trim());
    setResetSent(false);
    setForgotOpen(true);
  }

  async function handleSendReset(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const parsed = z
      .string()
      .trim()
      .email("Enter a valid email address")
      .safeParse(resetEmail.trim());
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]!.message);
      return;
    }
    setResetBusy(true);
    try {
      await sendPasswordResetEmail(auth, parsed.data);
      setResetSent(true);
      toast.success("Password reset email sent!");
    } catch (error: any) {
      const code = error?.code;
      if (code === "auth/user-not-found") {
        toast.error("No account found with this email address.");
      } else if (code === "auth/invalid-email") {
        toast.error("Please enter a valid email address.");
      } else if (code === "auth/too-many-requests") {
        toast.error("Too many reset attempts. Please try again later.");
      } else {
        toast.error(error instanceof Error ? error.message : "Failed to send reset link");
      }
    } finally {
      setResetBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="panel w-full max-w-md p-7 shadow-xl border border-border"
      >
        <Link to="/" className="mb-6 flex items-center gap-2.5">
          <img
            src={onyxMark.url || "/onyx-logo.jpg"}
            width={32}
            height={32}
            decoding="async"
            alt="ONYX"
            referrerPolicy="no-referrer"
            className="size-8 rounded-full object-cover border border-border/80 shadow-xs"
          />
          <span className="font-bold tracking-tight text-lg">ONYX</span>
        </Link>

        {/* STEP 1: MANDATORY ROLE ONBOARDING (For any new user logging in for the first time) */}
        {requiresRoleSelection ? (
          <div className="space-y-5">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                <UserCheck className="size-3.5" />
                Step 2: Choose Account Role
              </div>
              <h1 className="text-2xl font-bold tracking-tight mt-2">Choose your role</h1>
              <p className="text-sm text-muted-foreground">
                To complete your account for{" "}
                <span className="font-medium text-foreground">{user?.email}</span>, please select
                whether you are a Student or Teacher.
              </p>
            </div>

            <form onSubmit={handleCompleteRoleOnboarding} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="role-fullname">Full Name</Label>
                <Input
                  id="role-fullname"
                  placeholder="Your full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>I am joining as a</Label>
                <div className="grid grid-cols-1 gap-2.5">
                  <motion.button
                    type="button"
                    onClick={() => setRole("student")}
                    {...getPressProps(shouldReduceMotion)}
                    className={cn(
                      "flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all cursor-pointer",
                      role === "student"
                        ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary"
                        : "border-input bg-card/60 hover:bg-muted/50",
                    )}
                  >
                    <div
                      className={cn(
                        "mt-0.5 rounded-lg p-2 shrink-0",
                        role === "student"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      <GraduationCap className="size-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">Student</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Submit assignments, complete handwriting notebooks, take quizzes, and track
                        grades.
                      </p>
                    </div>
                  </motion.button>

                  <motion.button
                    type="button"
                    onClick={() => setRole("teacher")}
                    {...getPressProps(shouldReduceMotion)}
                    className={cn(
                      "flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all cursor-pointer",
                      role === "teacher"
                        ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary"
                        : "border-input bg-card/60 hover:bg-muted/50",
                    )}
                  >
                    <div
                      className={cn(
                        "mt-0.5 rounded-lg p-2 shrink-0",
                        role === "teacher"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      <Presentation className="size-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">Teacher / Instructor</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Create classes, publish assignments, grade work with AI rubrics, and manage
                        student rosters.
                      </p>
                    </div>
                  </motion.button>
                </div>
              </div>

              <Button type="submit" className="w-full press" disabled={busy}>
                {busy ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <ArrowRight className="mr-2 size-4" />
                )}
                Complete Sign Up & Continue
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="w-full text-xs text-muted-foreground hover:text-foreground"
                onClick={() => void handleUseAnotherAccount()}
                disabled={busy}
              >
                Sign out & use a different account
              </Button>
            </form>
          </div>
        ) : needsExistingUserConfirm ? (
          /* STEP 2: SESSION CONFIRMATION (For established accounts on a fresh tab) */
          <div className="space-y-4">
            <h1 className="text-2xl font-semibold">
              Continue as {profile?.full_name?.trim() || session?.user.email || "this account"}?
            </h1>
            <p className="text-sm text-muted-foreground">
              You are signed in with{" "}
              <span className="font-medium text-foreground">{session?.user.email}</span> (
              {profile?.role}).
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
          /* STEP 3: DEFAULT SIGN UP OR SIGN IN FORM */
          <>
            <div className="mb-6 space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">
                {mode === "signin" ? "Welcome back" : "Create your account"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {mode === "signin"
                  ? "Enter your credentials to access your classes and assignments."
                  : "Choose your role as a student or teacher to start."}
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
                      placeholder="e.g. Jane Doe"
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
                        {...getPressProps(shouldReduceMotion)}
                        className={cn(
                          "flex items-center gap-2 rounded-lg border p-3 text-left text-sm transition-colors cursor-pointer",
                          role === "student"
                            ? "border-primary bg-primary/10 text-primary ring-1 ring-primary"
                            : "border-input hover:bg-muted/50",
                        )}
                      >
                        <GraduationCap className="size-4 shrink-0" />
                        <div>
                          <p className="font-semibold text-xs">Student</p>
                          <p className="text-[11px] text-muted-foreground">Submit work</p>
                        </div>
                      </motion.button>
                      <motion.button
                        type="button"
                        onClick={() => setRole("teacher")}
                        {...getPressProps(shouldReduceMotion)}
                        className={cn(
                          "flex items-center gap-2 rounded-lg border p-3 text-left text-sm transition-colors cursor-pointer",
                          role === "teacher"
                            ? "border-primary bg-primary/10 text-primary ring-1 ring-primary"
                            : "border-input hover:bg-muted/50",
                        )}
                      >
                        <Presentation className="size-4 shrink-0" />
                        <div>
                          <p className="font-semibold text-xs">Teacher</p>
                          <p className="text-[11px] text-muted-foreground">Manage classes</p>
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
                      onClick={handleOpenForgot}
                      className="text-xs text-primary underline hover:text-primary/80 font-medium cursor-pointer"
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
                {mode === "signin" ? "Sign in" : "Create account (Choose Teacher/Student)"}
              </Button>
            </form>

            <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> or continue with{" "}
              <span className="h-px flex-1 bg-border" />
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
                className="font-medium text-primary hover:underline cursor-pointer"
              >
                {mode === "signin" ? "Sign up (Pick role)" : "Sign in"}
              </button>
            </p>
          </>
        )}
      </motion.div>

      {/* Forgot Password Dialog */}
      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="size-5 text-primary" />
              Reset your password
            </DialogTitle>
            <DialogDescription>
              {resetSent
                ? "Check your inbox for a password reset email."
                : "Enter the email address associated with your account and we'll send you instructions to reset your password."}
            </DialogDescription>
          </DialogHeader>

          {resetSent ? (
            <div className="space-y-4 py-2">
              <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
                <CheckCircle2 className="size-5 text-primary shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-foreground">Reset link sent to {resetEmail}</p>
                  <p className="text-xs text-muted-foreground">
                    Follow the instructions in the email to set a new password. If you don't see it
                    within a couple of minutes, check your spam or junk folder.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button className="w-full" onClick={() => setForgotOpen(false)}>
                  Back to Sign In
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleSendReset} className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="reset-email">Account Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                  <Input
                    id="reset-email"
                    type="email"
                    placeholder="you@school.edu"
                    className="pl-9"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    autoFocus
                    required
                  />
                </div>
              </div>
              <DialogFooter className="gap-2 sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setForgotOpen(false)}
                  disabled={resetBusy}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={resetBusy}>
                  {resetBusy && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Send Reset Link
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
