import { cn } from "@/lib/utils";
import onyxMark from "@/assets/onyx-mark.png.asset.json";

export function Wordmark({
  size = "md",
  subtitle,
  className,
}: {
  size?: "sm" | "md";
  subtitle?: string;
  className?: string;
}) {
  const box = size === "sm" ? "size-9" : "size-11";
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <img
        src={onyxMark.url}
        width={44}
        height={44}
        decoding="async"
        alt=""
        aria-hidden="true"
        className={cn("shrink-0 rounded-full object-cover", box)}
      />
      <span className="flex flex-col leading-tight">
        <span className="text-lg font-bold tracking-tight">ONYX</span>
        {subtitle && (
          <span className="text-xs uppercase tracking-widest text-muted-foreground">
            {subtitle}
          </span>
        )}
      </span>
    </div>
  );
}
