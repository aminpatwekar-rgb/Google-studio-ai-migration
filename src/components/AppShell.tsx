import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { motion, useReducedMotion } from "framer-motion";
import {
  LayoutDashboard,
  BookOpen,
  GraduationCap,
  Moon,
  Sun,
  LogOut,
  Menu,
  Shield,
  ClipboardList,
  Trophy,
  Award,
  Settings,
  Eye,
  Check,
  ChevronDown,
  ClipboardCheck,
  Calendar,
  EyeOff,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clearSessionConfirmation } from "@/lib/session-confirm";
import { SPRING_PRESS, getPressProps } from "@/lib/motionPresets";

import { GlobalSearch } from "@/components/GlobalSearch";
import { NotificationCenter } from "@/components/NotificationCenter";
import { Wordmark } from "@/components/Wordmark";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/lib/auth";
import { useViewRole } from "@/lib/viewRole";
import { cn } from "@/lib/utils";
import { getPlanSummary } from "@/lib/onyx.features.functions";
import { useServerFn } from "@tanstack/react-start";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/classes", label: "Classes", icon: GraduationCap },
  { to: "/assignments", label: "Assignments", icon: BookOpen },
  { to: "/quizzes", label: "Quizzes", icon: ClipboardList },
  { to: "/calendar", label: "Calendar", icon: Calendar, feature: "calendar" },
  { to: "/attendance", label: "Attendance", icon: ClipboardCheck, feature: "attendance" },
  { to: "/reports", label: "Reports", icon: ClipboardCheck, feature: "progress_reports" },
  { to: "/rubrics", label: "Rubrics", icon: ClipboardCheck, feature: "rubrics" },
  { to: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { to: "/achievements", label: "Achievements", icon: Award },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

const BOTTOM_NAV = [
  { to: "/dashboard", label: "Home", icon: LayoutDashboard },
  { to: "/classes", label: "Classes", icon: GraduationCap },
  { to: "/assignments", label: "Tasks", icon: BookOpen },
  { to: "/quizzes", label: "Quizzes", icon: ClipboardList },
] as const;

const GRADING_NAV = { to: "/grading", label: "Grading", icon: ClipboardCheck } as const;

const ADMIN_NAV = [{ to: "/admin", label: "Admin", icon: Shield }] as const;

const MotionLink = motion.create(Link);

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useRouterState({ select: (s) => s.location });
  const { theme, toggle } = useTheme();
  const { profile, role } = useAuth();
  const { effectiveRole, setViewRole, isOverridden } = useViewRole();
  const shouldReduceMotion = useReducedMotion();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const getPlan = useServerFn(getPlanSummary);
  const planQuery = useQuery({
    queryKey: ["app-shell-plan", profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: () => getPlan(),
    staleTime: 60_000,
  });
  const branding = useQuery({
    queryKey: ["onyx-branding", profile?.id, profile?.plan],
    enabled: Boolean(profile?.id),
    queryFn: () => {
      const plan = (profile?.plan || "").toLowerCase();
      return plan === "pro" || plan === "institution" || role === "admin";
    },
    staleTime: 60_000,
  });
  const [open, setOpen] = useState(false);
  const { signOut: authSignOut } = useAuth();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    clearSessionConfirmation();
    await authSignOut();
    navigate({ to: "/auth", replace: true });
  }

  const initials = (profile?.full_name || profile?.email || "U")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  // Navigation items follow effectiveRole for previewing
  const canGrade = effectiveRole === "teacher" || effectiveRole === "admin";
  // Teachers and admins get a Grading tab right after Quizzes.
  const baseNav = canGrade ? [...NAV.slice(0, 4), GRADING_NAV, ...NAV.slice(4)] : [...NAV];
  const items = effectiveRole === "admin" ? [...baseNav, ...ADMIN_NAV] : baseNav;
  // Phone tab bar: grading replaces Quizzes for teachers (Quizzes stays in the More menu).
  const bottomItems = canGrade
    ? [BOTTOM_NAV[0], BOTTOM_NAV[1], GRADING_NAV, BOTTOM_NAV[2]]
    : BOTTOM_NAV;
  const canSwitchRole = role === "admin" || role === "teacher";
  const planFeatures = (planQuery.data?.plan?.features ?? {}) as Record<string, boolean>;
  const isAdmin = role === "admin";

  const renderRoleSwitcher = (compact = false) => {
    const roleDotClass =
      effectiveRole === "admin"
        ? "bg-primary"
        : effectiveRole === "teacher"
          ? "bg-info"
          : "bg-muted-foreground";

    if (!canSwitchRole) {
      return (
        <div className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-secondary/80 px-2.5 py-0.5 text-[11px] font-medium capitalize tracking-wide text-muted-foreground shadow-2xs">
          <span className={cn("size-1.5 shrink-0 rounded-full", roleDotClass)} />
          {effectiveRole}
        </div>
      );
    }

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <motion.button
            type="button"
            {...getPressProps(shouldReduceMotion, { hoverScale: 1.02, tapScale: 0.96 })}
            className={cn(
              "group inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-secondary/80 px-2.5 py-0.5 text-[11px] font-medium capitalize tracking-wide text-muted-foreground shadow-2xs transition-colors duration-150 hover:border-border hover:bg-secondary hover:text-foreground cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-ring",
              compact && "px-2 py-0.5 text-[10px]",
            )}
            title={`View as: ${effectiveRole} (Click to change)`}
          >
            <span className={cn("size-1.5 shrink-0 rounded-full", roleDotClass)} />
            <span>{effectiveRole}</span>
            <ChevronDown className="size-3 text-muted-foreground transition-transform duration-200 group-hover:text-foreground group-hover:translate-y-px group-data-[state=open]:rotate-180" />
          </motion.button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Eye className="size-3.5 text-primary" /> View as (Preview)
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {role === "admin" && (
            <DropdownMenuItem
              onClick={() => setViewRole("admin")}
              className="flex items-center justify-between text-xs cursor-pointer"
            >
              <span>Admin view (Your Role)</span>
              {effectiveRole === "admin" && <Check className="size-3.5 text-primary" />}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() => setViewRole("teacher")}
            className="flex items-center justify-between text-xs cursor-pointer"
          >
            <span>Teacher view {role === "teacher" && "(Your Role)"}</span>
            {effectiveRole === "teacher" && <Check className="size-3.5 text-primary" />}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setViewRole("student")}
            className="flex items-center justify-between text-xs cursor-pointer"
          >
            <span>Student view</span>
            {effectiveRole === "student" && <Check className="size-3.5 text-primary" />}
          </DropdownMenuItem>
          {isOverridden && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setViewRole(null)}
                className="text-xs text-muted-foreground justify-center font-medium cursor-pointer hover:text-foreground"
              >
                Reset to default ({role})
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const nav = (
    <nav className="flex flex-col gap-1.5" aria-label="Main Navigation">
      {items.map(({ to, label, icon: Icon, ...item }) => {
        const active = pathname === to || pathname.startsWith(to + "/");
        const feature = (item as { feature?: string }).feature;
        const locked =
          Boolean(feature) && !isAdmin && planQuery.isSuccess && !planFeatures[feature!];

        if (locked) {
          return (
            <div
              key={to}
              title="Included in a higher plan"
              aria-disabled="true"
              className="group relative flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium text-muted-foreground/50 cursor-not-allowed select-none"
            >
              <Icon className="size-4 shrink-0 opacity-60" />
              <span className="truncate flex-1">{label}</span>
              <EyeOff className="size-3.5 opacity-70" />
            </div>
          );
        }

        return (
          <MotionLink
            key={to}
            to={to}
            onClick={() => setOpen(false)}
            {...getPressProps(shouldReduceMotion, { xHover: 2, tapScale: 0.98 })}
            className={cn(
              "group relative flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors duration-150 ease-out",
              active
                ? "bg-primary/10 text-primary shadow-xs font-semibold"
                : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId="nav-active"
                className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-primary"
                transition={{ type: "spring", stiffness: 350, damping: 30 }}
              />
            )}
            <Icon
              className={cn(
                "size-4 shrink-0 transition-colors duration-150",
                active ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
              )}
            />
            <span className="truncate">{label}</span>
          </MotionLink>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16.5rem_1fr] bg-background">
      <aside className="sticky top-0 z-30 hidden h-screen flex-col justify-between border-r border-sidebar-border bg-sidebar/95 backdrop-blur-xl lg:flex">
        <div className="flex flex-col">
          <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-5">
            <Link to="/dashboard" className="transition-opacity hover:opacity-90">
              {branding.data ? (
                <span className="text-sm font-semibold">Workspace</span>
              ) : (
                <Wordmark size="sm" />
              )}
            </Link>
            <div className="flex items-center gap-1">
              <NotificationCenter />
              {renderRoleSwitcher()}
            </div>
          </div>

          <div className="space-y-4 p-4">
            <GlobalSearch />
            <div className="pt-1">{nav}</div>
          </div>
        </div>

        <div className="space-y-3 border-t border-sidebar-border p-4 bg-sidebar/40">
          <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-card/60 p-2.5 shadow-2xs transition-colors hover:border-border">
            <Avatar className="size-9 border border-border/50">
              <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-foreground">
                {profile?.full_name || "Account"}
              </p>
              <p className="truncate text-[11px] capitalize text-muted-foreground">
                {isOverridden ? `${effectiveRole} (preview)` : role}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-9 border-border/80 text-muted-foreground hover:text-foreground shadow-2xs"
              onClick={toggle}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              <span className="ml-1.5 text-xs">{theme === "dark" ? "Light" : "Dark"}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-3 border-border/80 text-muted-foreground hover:text-destructive hover:border-destructive/40 shadow-2xs"
              onClick={signOut}
              title="Sign out"
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </aside>

      <header className="glass sticky top-0 z-40 flex items-center justify-between gap-2 border-b border-border px-4 py-2.5 lg:hidden">
        <Link to="/dashboard" className="flex items-center gap-2">
          {branding.data ? (
            <span className="text-sm font-semibold">Workspace</span>
          ) : (
            <Wordmark size="sm" />
          )}
        </Link>
        <div className="flex items-center gap-1">
          <NotificationCenter />
          {canSwitchRole && renderRoleSwitcher(true)}
        </div>
      </header>

      <nav
        aria-label="Primary"
        className="glass fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {bottomItems.map(({ to, label, icon: Icon }) => {
          const active = pathname === to || pathname.startsWith(to + "/");
          return (
            <Link
              key={to}
              to={to}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="size-5" />
              <span>{label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="More"
          className="flex min-h-14 cursor-pointer flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground transition-colors"
        >
          <Menu className="size-5" />
          <span>More</span>
        </button>
      </nav>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="flex w-[min(20rem,85vw)] flex-col gap-4 overflow-y-auto bg-sidebar p-5 border-l border-sidebar-border"
        >
          <SheetHeader className="text-left pb-2 border-b border-sidebar-border">
            <SheetTitle asChild>
              <div className="flex items-center justify-between">
                <Wordmark size="sm" />
              </div>
            </SheetTitle>
          </SheetHeader>
          <GlobalSearch />
          {nav}
          <div className="mt-auto pt-4 border-t border-sidebar-border space-y-3">
            <div className="flex items-center gap-3 rounded-lg border border-border/70 p-2.5">
              <Avatar className="size-9">
                <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-foreground">
                  {profile?.full_name || "Account"}
                </p>
                <p className="truncate text-[11px] capitalize text-muted-foreground">
                  {isOverridden ? `${effectiveRole} (preview)` : role}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-10 flex-1 justify-center gap-2 border-border/80 text-muted-foreground"
                onClick={toggle}
              >
                {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
                {theme === "dark" ? "Light mode" : "Dark mode"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-10 justify-center gap-2 border-border/80 text-muted-foreground hover:text-destructive hover:border-destructive/40"
                onClick={signOut}
              >
                <LogOut className="size-4" /> Sign out
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <main className="min-w-0 px-4 pb-24 pt-5 sm:px-8 sm:pt-6 lg:py-8">
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto w-full max-w-6xl"
        >
          {isOverridden && (
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3.5 py-2.5 text-xs text-foreground shadow-2xs">
              <div className="flex items-center gap-2 font-medium">
                <Eye className="size-4 shrink-0 text-warning" />
                <span>
                  Previewing as{" "}
                  <strong className="capitalize font-semibold text-foreground">
                    {effectiveRole}
                  </strong>{" "}
                  — your account's actual role is{" "}
                  <strong className="capitalize font-semibold text-foreground">{role}</strong>.{" "}
                  <span className="hidden sm:inline">
                    Real permissions remain protected by Supabase RLS.
                  </span>
                </span>
              </div>
              <motion.button
                type="button"
                {...getPressProps(shouldReduceMotion, { hoverScale: 1.02, tapScale: 0.96 })}
                onClick={() => setViewRole(null)}
                className="self-start sm:self-auto font-semibold text-primary underline underline-offset-2 hover:opacity-80 cursor-pointer"
              >
                Reset to {role}
              </motion.button>
            </div>
          )}
          {children}
        </motion.div>
      </main>
    </div>
  );
}
