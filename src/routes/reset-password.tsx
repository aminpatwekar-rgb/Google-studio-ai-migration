import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { sendPasswordResetEmail } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { auth } from "@/lib/firebase/config";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Reset password — ONYX" },
      { name: "description", content: "Choose a new password for your ONYX account." },
      { property: "og:title", content: "Reset password — ONYX" },
      { property: "og:description", content: "Set a new password for your ONYX account." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    const parsed = z.string().email("Enter a valid email").safeParse(email.trim());
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]!.message);
      return;
    }
    setBusy(true);
    try {
      await sendPasswordResetEmail(auth, parsed.data);
      setSent(true);
      toast.success("Password reset email sent! Check your inbox.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send reset email");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="panel w-full max-w-md p-7">
        <h1 className="text-2xl font-semibold">Reset your password</h1>
        {sent ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              We have sent password reset instructions to{" "}
              <span className="font-medium text-foreground">{email}</span>.
            </p>
            <Button
              className="w-full"
              onClick={() => navigate({ to: "/auth", search: { mode: "signin" } })}
            >
              Return to sign in
            </Button>
          </div>
        ) : (
          <form onSubmit={handleReset} className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Enter your account email to receive a password reset link.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@school.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Sending..." : "Send reset link"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
