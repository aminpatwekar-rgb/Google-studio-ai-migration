import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { auth } from "@/lib/firebase/config";
import { AppShell } from "@/components/AppShell";
import { isSessionConfirmed } from "@/lib/session-confirm";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // Wait for auth to resolve if still loading
    const currentUser = auth.currentUser;
    if (!currentUser) {
      // Let onAuthStateChanged resolve or redirect
      await new Promise<void>((resolve) => {
        const unsub = auth.onAuthStateChanged((u) => {
          unsub();
          resolve();
        });
      });
    }

    const resolvedUser = auth.currentUser;
    if (!resolvedUser) {
      throw redirect({ to: "/auth" });
    }

    if (!isSessionConfirmed(resolvedUser.uid)) {
      throw redirect({ to: "/auth", search: { confirm: true } });
    }

    return { user: resolvedUser };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
