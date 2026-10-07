import { useState, useEffect } from "react";
import { Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface CountdownTimerProps {
  dueDate: string | null | undefined;
  submitted?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
  showIcon?: boolean;
}

/**
 * Live, real-time ticking countdown timer for student assignments and quizzes.
 * Displays remaining Days, Hours, Minutes, and Seconds with color-coded urgency.
 */
export function CountdownTimer({
  dueDate,
  submitted = false,
  className,
  size = "md",
  showIcon = true,
}: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    isOverdue: boolean;
    totalMs: number;
  } | null>(null);

  useEffect(() => {
    if (!dueDate) {
      setTimeLeft(null);
      return;
    }

    function calculateTime() {
      const now = new Date().getTime();
      const target = new Date(dueDate!).getTime();

      if (Number.isNaN(target)) {
        setTimeLeft(null);
        return;
      }

      const diff = target - now;
      const isOverdue = diff < 0;
      const absDiff = Math.abs(diff);

      const days = Math.floor(absDiff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((absDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((absDiff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((absDiff % (1000 * 60)) / 1000);

      setTimeLeft({
        days,
        hours,
        minutes,
        seconds,
        isOverdue,
        totalMs: diff,
      });
    }

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [dueDate]);

  if (submitted) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 shadow-2xs",
          className,
        )}
      >
        {showIcon && <CheckCircle2 className="size-3.5 shrink-0" />}
        <span>Submitted</span>
      </span>
    );
  }

  if (!dueDate || !timeLeft) {
    return (
      <span className={cn("text-xs text-muted-foreground font-medium", className)}>
        No due date
      </span>
    );
  }

  const { days, hours, minutes, seconds, isOverdue, totalMs } = timeLeft;

  // Format countdown string: "2d 14h 32m", "5h 12m 45s", "12m 30s", "45s"
  let formatted = "";
  if (days > 0) {
    formatted = `${days}d ${hours}h ${minutes}m`;
  } else if (hours > 0) {
    formatted = `${hours}h ${minutes}m ${seconds}s`;
  } else if (minutes > 0) {
    formatted = `${minutes}m ${seconds}s`;
  } else {
    formatted = `${seconds}s`;
  }

  // Visual Urgency System:
  // - Overdue: Red destructive badge
  // - Critical (< 1h): Pulsing red badge
  // - Urgent (< 24h): Amber warning badge
  // - Upcoming (> 24h): Indigo/Primary badge
  let badgeStyle = "bg-primary/10 text-primary border-primary/25";
  let iconColor = "text-primary";

  if (isOverdue) {
    badgeStyle = "bg-destructive/15 text-destructive border-destructive/30 font-semibold";
    iconColor = "text-destructive";
  } else if (totalMs < 3600 * 1000) {
    badgeStyle = "bg-destructive/15 text-destructive border-destructive/40 font-bold animate-pulse";
    iconColor = "text-destructive";
  } else if (totalMs < 24 * 3600 * 1000) {
    badgeStyle =
      "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 font-semibold";
    iconColor = "text-amber-600 dark:text-amber-400";
  }

  const sizeClass =
    size === "sm"
      ? "text-[11px] px-2 py-0.5 gap-1"
      : size === "lg"
        ? "text-sm px-3 py-1 gap-2"
        : "text-xs px-2.5 py-0.5 gap-1.5";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-mono tracking-tight transition-all shadow-2xs shrink-0 select-none",
        badgeStyle,
        sizeClass,
        className,
      )}
      title={
        isOverdue
          ? `Overdue by ${formatted} (${new Date(dueDate).toLocaleString()})`
          : `Due in ${formatted} (${new Date(dueDate).toLocaleString()})`
      }
    >
      {showIcon &&
        (isOverdue ? (
          <AlertTriangle className={cn("shrink-0 size-3.5", iconColor)} />
        ) : (
          <Clock className={cn("shrink-0 size-3.5", iconColor)} />
        ))}
      <span>{isOverdue ? `Overdue: ${formatted}` : `${formatted} left`}</span>
    </span>
  );
}
