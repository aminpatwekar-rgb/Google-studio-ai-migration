import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Shield, Mail, LogOut, Loader2, KeyRound } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { clearSessionConfirmation } from "@/lib/session-confirm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export function AccountSettingsCard() {
  const { user, profile, role, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);

  const email = profile?.email || user?.email || "No email available";

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await queryClient.cancelQueries();
      queryClient.clear();
      clearSessionConfirmation();
      await signOut();
      navigate({ to: "/auth", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to sign out");
      setSigningOut(false);
    }
  }

  return (
    <Card className="lift transition-colors duration-200 hover:lift-hover">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="size-5 text-primary" />
          Account & Security
        </CardTitle>
        <CardDescription>
          Review your account credentials, assigned role, and active session.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="account-email" className="text-sm font-medium">
              Registered Email
            </Label>
            <div className="relative">
              <Input
                id="account-email"
                type="email"
                value={email}
                readOnly
                disabled
                className="pl-9 bg-muted/50 cursor-not-allowed opacity-90"
              />
              <Mail className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Primary email managed via your authentication provider.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Current Role</Label>
            <div className="flex h-9 items-center justify-between rounded-md border border-border/70 bg-muted/40 px-3">
              <span className="text-sm font-medium capitalize text-foreground">
                {role ?? "User"}
              </span>
              <Badge variant="outline" className="capitalize text-xs font-semibold">
                {role ?? "Standard"}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Permissions are managed by your institution administrator.
            </p>
          </div>
        </div>

        {user?.id && (
          <div className="space-y-1 rounded-lg border border-border/60 bg-secondary/30 p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <KeyRound className="size-3.5" />
              <span>User ID</span>
            </div>
            <p className="font-mono text-xs text-foreground/80 break-all select-all">{user.id}</p>
          </div>
        )}

        <div className="pt-2 border-t border-border/60 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Session Control</p>
            <p className="text-xs text-muted-foreground">
              End your active session on this browser.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleSignOut}
            disabled={signingOut}
            className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
          >
            {signingOut ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <LogOut className="size-4" />
            )}
            {signingOut ? "Signing out..." : "Sign out"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
