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
  Sparkles,
  FolderKanban,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clearSessionConfirmation } from "@/lib/session-confirm";
import { getPressProps } from "@/lib/motionPresets";

import { GlobalSearch } from "@/components/GlobalSearch";
import { NotificationCenter } from "@/components/NotificationCenter";

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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
  { to: "/projects", label: "Projects", icon: FolderKanban },
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
  const { profile, role, isSuperAdmin } = useAuth();
  const { effectiveRole, setViewRole, isOverridden } = useViewRole();
  const displayRole = isSuperAdmin
    ? "SUPER ADMIN"
    : isOverridden
      ? `${effectiveRole} (preview)`
      : role;
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
  const [open, setOpen] = useState(false);

  // Toggle for collapsible sidebar (persisted in localStorage)
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("onyx_sidebar_collapsed");
      return saved !== null ? saved === "true" : true;
    }
    return true;
  });

  const toggleSidebar = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("onyx_sidebar_collapsed", String(next));
      return next;
    });
  };

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

  const bottomItems = canGrade
    ? [BOTTOM_NAV[0], BOTTOM_NAV[1], GRADING_NAV, BOTTOM_NAV[2]]
    : BOTTOM_NAV;
  const canSwitchRole = role === "admin" || role === "teacher";
  const planFeatures = (planQuery.data?.plan?.features ?? {}) as Record<string, boolean>;
  const isAdmin = role === "admin";

  const renderRoleSwitcher = (mode: "compact_icon" | "pill" = "pill") => {
    const roleDotClass =
      effectiveRole === "admin"
        ? "bg-primary"
        : effectiveRole === "teacher"
          ? "bg-info"
          : "bg-muted-foreground";

    if (mode === "compact_icon") {
      const compactButton = (
        <button
          type="button"
          className="group relative flex size-9 items-center justify-center rounded-xl border border-border/80 bg-secondary/70 text-muted-foreground hover:border-border hover:bg-secondary hover:text-foreground cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Eye className="size-4 text-primary" />
          <span
            className={cn(
              "absolute top-1 right-1 size-2 rounded-full ring-2 ring-sidebar",
              roleDotClass,
            )}
          />
        </button>
      );

      if (!canSwitchRole) {
        return (
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>{compactButton}</TooltipTrigger>
              <TooltipContent
                side="right"
                sideOffset={8}
                className="font-semibold text-xs capitalize"
              >
                Role: {effectiveRole}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      }

      return (
        <DropdownMenu>
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>{compactButton}</DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent
                side="right"
                sideOffset={8}
                className="font-semibold text-xs capitalize"
              >
                View as: {effectiveRole} (Click to switch)
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <DropdownMenuContent side="right" align="start" className="w-48">
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
    }

    if (!canSwitchRole) {
      return (
        <div className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-secondary/80 px-2 py-0.5 text-[10px] font-medium capitalize tracking-wide text-muted-foreground shadow-2xs">
          <span className={cn("size-1.5 shrink-0 rounded-full", roleDotClass)} />
          {effectiveRole}
        </div>
      );
    }

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="group inline-flex items-center gap-1 rounded-full border border-border/80 bg-secondary/80 px-2 py-0.5 text-[10px] font-medium capitalize tracking-wide text-muted-foreground shadow-2xs transition-colors hover:border-border hover:bg-secondary hover:text-foreground cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-ring"
            title={`View as: ${effectiveRole}`}
          >
            <span className={cn("size-1.5 shrink-0 rounded-full", roleDotClass)} />
            <span className="inline">{effectiveRole}</span>
            <ChevronDown className="size-3 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
          </button>
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

  // Compact icon-only sidebar navigation with Tooltips
  const compactDesktopNav = (
    <TooltipProvider delayDuration={0}>
      <nav className="flex flex-col items-center gap-1 w-full" aria-label="Main Navigation">
        {items.map(({ to, label, icon: Icon, ...item }) => {
          const active = pathname === to || pathname.startsWith(to + "/");
          const feature = (item as { feature?: string }).feature;
          const locked =
            Boolean(feature) && !isAdmin && planQuery.isSuccess && !planFeatures[feature!];

          if (locked) {
            return (
              <Tooltip key={to}>
                <TooltipTrigger asChild>
                  <div
                    aria-disabled="true"
                    className="relative flex size-9 items-center justify-center rounded-xl text-muted-foreground/40 cursor-not-allowed select-none"
                  >
                    <Icon className="size-4.5 opacity-50" />
                    <EyeOff className="absolute bottom-1 right-1 size-2.5 opacity-70" />
                  </div>
                </TooltipTrigger>
                <TooltipContent
                  side="right"
                  className="font-semibold text-xs bg-popover text-popover-foreground border border-border shadow-md"
                >
                  {label} (Locked)
                </TooltipContent>
              </Tooltip>
            );
          }

          return (
            <Tooltip key={to}>
              <TooltipTrigger asChild>
                <MotionLink
                  to={to}
                  onClick={() => setOpen(false)}
                  {...getPressProps(shouldReduceMotion, { tapScale: 0.94 })}
                  className={cn(
                    "group relative flex size-9.5 items-center justify-center rounded-xl transition-all duration-150 ease-out",
                    active
                      ? "bg-primary/15 text-primary shadow-2xs font-bold"
                      : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
                  )}
                  aria-label={label}
                >
                  {active && (
                    <motion.span
                      layoutId="nav-active"
                      className="absolute -left-2 top-2 bottom-2 w-1 rounded-r-full bg-primary"
                      transition={{ type: "spring", stiffness: 350, damping: 30 }}
                    />
                  )}
                  <Icon
                    className={cn(
                      "size-4.5 shrink-0 transition-colors duration-150",
                      active
                        ? "text-primary stroke-[2.5]"
                        : "text-muted-foreground group-hover:text-foreground",
                    )}
                  />
                </MotionLink>
              </TooltipTrigger>
              <TooltipContent
                side="right"
                sideOffset={8}
                className="font-semibold text-xs bg-popover text-popover-foreground border border-border/80 shadow-md"
              >
                {label}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </nav>
    </TooltipProvider>
  );

  // Expanded full sidebar navigation with Text Labels
  const expandedDesktopNav = (
    <nav className="flex flex-col gap-1 w-full" aria-label="Main Navigation">
      {items.map(({ to, label, icon: Icon, ...item }) => {
        const active = pathname === to || pathname.startsWith(to + "/");
        const feature = (item as { feature?: string }).feature;
        const locked =
          Boolean(feature) && !isAdmin && planQuery.isSuccess && !planFeatures[feature!];

        if (locked) {
          return (
            <div
              key={to}
              aria-disabled="true"
              title="Included in a higher plan"
              className="flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-medium text-muted-foreground/40 cursor-not-allowed select-none"
            >
              <Icon className="size-4 shrink-0 opacity-50" />
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
              "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-medium transition-all duration-150 ease-out",
              active
                ? "bg-primary/15 text-primary font-bold shadow-2xs"
                : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId="nav-active-expanded"
                className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-primary"
                transition={{ type: "spring", stiffness: 350, damping: 30 }}
              />
            )}
            <Icon
              className={cn(
                "size-4 shrink-0 transition-colors duration-150",
                active
                  ? "text-primary stroke-[2.5]"
                  : "text-muted-foreground group-hover:text-foreground",
              )}
            />
            <span className="truncate">{label}</span>
          </MotionLink>
        );
      })}
    </nav>
  );

  // Expanded mobile drawer navigation
  const mobileSheetNav = (
    <nav className="flex flex-col gap-1" aria-label="Mobile Navigation">
      {items.map(({ to, label, icon: Icon, ...item }) => {
        const active = pathname === to || pathname.startsWith(to + "/");
        const feature = (item as { feature?: string }).feature;
        const locked =
          Boolean(feature) && !isAdmin && planQuery.isSuccess && !planFeatures[feature!];

        if (locked) {
          return (
            <div
              key={to}
              aria-disabled="true"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground/50 cursor-not-allowed select-none"
            >
              <Icon className="size-4 shrink-0 opacity-60" />
              <span className="truncate flex-1">{label}</span>
              <EyeOff className="size-3.5 opacity-70" />
            </div>
          );
        }

        return (
          <Link
            key={to}
            to={to}
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150",
              active
                ? "bg-primary/15 text-primary font-semibold"
                : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
            )}
          >
            <Icon
              className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground")}
            />
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div
      className={cn(
        "min-h-screen bg-background transition-all duration-300 ease-in-out",
        isCollapsed ? "lg:grid lg:grid-cols-[4.25rem_1fr]" : "lg:grid lg:grid-cols-[16rem_1fr]",
      )}
    >
      {/* Desktop Collapsible Sidebar */}
      <aside
        className={cn(
          "sticky top-0 z-30 hidden h-screen flex-col border-r border-sidebar-border bg-sidebar lg:flex py-3 justify-between transition-all duration-300 ease-in-out overflow-hidden",
          isCollapsed ? "w-[4.25rem] items-center" : "w-[16rem] px-3.5",
        )}
      >
        {/* Top Header: Hamburger Toggle, Brand Logo & Controls */}
        <div className="flex flex-col gap-2.5 w-full">
          {isCollapsed ? (
            /* Collapsed Mode: Logo at the Very Top, then Collapse Button */
            <div className="flex flex-col items-center gap-2.5 w-full pb-2 border-b border-sidebar-border">
              {/* Top: Brand Logo */}
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      to="/dashboard"
                      className="flex size-9.5 items-center justify-center rounded-full overflow-hidden transition-transform hover:scale-105 border border-border/80 shadow-xs"
                    >
                      <img
                        src="/onyx-logo.jpg"
                        alt="ONYX"
                        className="size-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={8} className="font-bold text-xs">
                    ONYX Dashboard
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* 3-Line Hamburger Expand Toggle */}
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={toggleSidebar}
                      className="flex size-8 items-center justify-center rounded-lg border border-border/70 bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-ring shrink-0"
                      aria-label="Expand sidebar"
                    >
                      <Menu className="size-4 text-foreground stroke-[2.2]" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={8} className="font-semibold text-xs">
                    Expand Sidebar (Show Labels)
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* Compact Notification Center & Role Switcher */}
              <div className="flex flex-col items-center gap-1.5 pt-0.5">
                <NotificationCenter />
                {renderRoleSwitcher("compact_icon")}
              </div>
            </div>
          ) : (
            /* Expanded Mode: Prominent Brand Anchor at Top-Left */
            <div className="flex flex-col gap-2.5 w-full pb-2 border-b border-sidebar-border">
              {/* Row 1: Brand Logo & Title on Left, Controls on Right */}
              <div className="flex items-center justify-between gap-2 w-full px-0.5">
                <Link
                  to="/dashboard"
                  className="flex items-center gap-3 font-bold text-sm text-foreground hover:opacity-85 transition-opacity min-w-0"
                >
                  <img
                    src="/onyx-logo.jpg"
                    alt="ONYX"
                    className="size-8 rounded-full object-cover border border-border/80 shadow-xs shrink-0"
                    referrerPolicy="no-referrer"
                  />
                  <div className="flex flex-col min-w-0 leading-none">
                    <span className="font-bold tracking-tight text-base text-foreground truncate">
                      ONYX
                    </span>
                    <span className="text-[10px] font-semibold text-muted-foreground tracking-widest uppercase mt-0.5">
                      Workspace
                    </span>
                  </div>
                </Link>

                <div className="flex items-center gap-1 shrink-0">
                  <NotificationCenter />
                  <TooltipProvider delayDuration={0}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={toggleSidebar}
                          className="flex size-8 items-center justify-center rounded-lg border border-border/70 bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          aria-label="Condense sidebar"
                        >
                          <Menu className="size-4 text-foreground stroke-[2.2]" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right" sideOffset={8} className="font-semibold text-xs">
                        Condense Sidebar (Icons Only)
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>

              {/* Row 2: Role Switcher in a Clean, Dedicated Status Bar */}
              <div className="flex items-center justify-between w-full px-2 py-1 rounded-lg bg-secondary/35 border border-border/50 text-xs">
                <span className="text-[11px] font-medium text-muted-foreground">
                  Workspace View
                </span>
                {renderRoleSwitcher("pill")}
              </div>
            </div>
          )}

          {!isCollapsed && <GlobalSearch />}
          <div className="w-full h-px bg-sidebar-border/80" />
        </div>

        {/* Vertical Navigation Menu (Icons Only when Condensed, Icons + Text when Expanded) */}
        <div
          className={cn(
            "flex-1 w-full min-h-0 overflow-y-auto py-1 flex flex-col no-scrollbar",
            isCollapsed ? "px-2 items-center" : "px-0 items-start",
          )}
        >
          {isCollapsed ? compactDesktopNav : expandedDesktopNav}
        </div>

        {/* Bottom Footer Actions */}
        {isCollapsed ? (
          <div className="flex flex-col items-center gap-2 w-full px-2 pt-2 border-t border-sidebar-border">
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-9 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/80"
                    onClick={toggle}
                  >
                    {theme === "dark" ? (
                      <Sun className="size-4.5" />
                    ) : (
                      <Moon className="size-4.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8} className="font-semibold text-xs">
                  {theme === "dark" ? "Light Mode" : "Dark Mode"}
                </TooltipContent>
              </Tooltip>

              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="group relative size-9 rounded-xl overflow-hidden border border-border/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
                      >
                        <Avatar className="size-full">
                          <AvatarFallback className="bg-primary/15 text-xs font-bold text-primary">
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                      </button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={8} className="font-semibold text-xs">
                    {profile?.full_name || "Account"}
                  </TooltipContent>
                </Tooltip>
                <DropdownMenuContent side="right" align="end" className="w-48">
                  <DropdownMenuLabel className="text-xs font-bold">
                    {profile?.full_name || "Account"}
                  </DropdownMenuLabel>
                  <p className="px-2 text-[11px] capitalize text-muted-foreground pb-1">
                    {displayRole}
                  </p>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={toggle} className="text-xs cursor-pointer">
                    {theme === "dark" ? (
                      <Sun className="size-3.5 mr-2" />
                    ) : (
                      <Moon className="size-3.5 mr-2" />
                    )}
                    Toggle Theme
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={signOut}
                    className="text-xs text-destructive cursor-pointer"
                  >
                    <LogOut className="size-3.5 mr-2" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-9 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    onClick={signOut}
                  >
                    <LogOut className="size-4.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent
                  side="right"
                  sideOffset={8}
                  className="font-semibold text-xs text-destructive"
                >
                  Sign Out
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        ) : (
          <div className="shrink-0 space-y-2 border-t border-sidebar-border pt-2 w-full">
            <div className="flex items-center gap-2.5 rounded-xl border border-border/70 bg-card/60 p-2 shadow-2xs transition-colors hover:border-border">
              <Avatar className="size-8 border border-border/50 shrink-0">
                <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-foreground">
                  {profile?.full_name || "Account"}
                </p>
                <p className="truncate text-[10px] capitalize text-muted-foreground">
                  {displayRole}
                </p>
              </div>
            </div>
            <div className="flex gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-8 text-xs border-border/80 text-muted-foreground hover:text-foreground shadow-2xs"
                onClick={toggle}
                title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              >
                {theme === "dark" ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
                <span className="ml-1 text-[11px]">{theme === "dark" ? "Light" : "Dark"}</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2.5 border-border/80 text-muted-foreground hover:text-destructive hover:border-destructive/40 shadow-2xs"
                onClick={signOut}
                title="Sign out"
              >
                <LogOut className="size-3.5" />
              </Button>
            </div>
          </div>
        )}
      </aside>

      {/* Mobile Top Header */}
      <header className="glass sticky top-0 z-40 flex items-center justify-between gap-2 border-b border-border px-4 py-2.5 lg:hidden">
        <Link to="/dashboard" className="flex items-center gap-2 font-bold text-sm text-foreground">
          <img
            src="/onyx-logo.jpg"
            alt="ONYX"
            className="size-6 rounded-full object-cover border border-border/70 shadow-2xs"
            referrerPolicy="no-referrer"
          />
          <span>ONYX</span>
        </Link>
        <div className="flex items-center gap-1">
          <NotificationCenter />
          {canSwitchRole && renderRoleSwitcher("pill")}
        </div>
      </header>

      {/* Mobile Bottom Tab Navigation */}
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
                active ? "text-primary font-bold" : "text-muted-foreground",
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

      {/* Mobile Menu Drawer Sheet */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="flex w-[min(20rem,85vw)] flex-col gap-4 overflow-y-auto bg-sidebar p-5 border-l border-sidebar-border"
        >
          <SheetHeader className="text-left pb-2 border-b border-sidebar-border">
            <SheetTitle asChild>
              <div className="flex items-center gap-2 font-bold text-sm text-foreground">
                <Sparkles className="size-4 text-primary" />
                <span>ONYX Workspace</span>
              </div>
            </SheetTitle>
          </SheetHeader>
          <GlobalSearch />
          {mobileSheetNav}
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
                  {displayRole}
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

      {/* Main Content Area */}
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
                    Real permissions remain protected by Firebase Security Rules.
                  </span>
                </span>
              </div>
              <button
                type="button"
                onClick={() => setViewRole(null)}
                className="self-start sm:self-auto font-semibold text-primary underline underline-offset-2 hover:opacity-80 cursor-pointer"
              >
                Reset to {role}
              </button>
            </div>
          )}
          {children}
        </motion.div>
      </main>
    </div>
  );
}
