import { createFileRoute } from "@tanstack/react-router";
import { Monitor, Moon, Sun, Check, WandSparkles } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  useTheme,
  ACCENTS,
  THEME_STYLES,
  type Accent,
  type ThemeMode,
  type ThemeStyle,
} from "@/lib/theme";
import { getPressProps } from "@/lib/motionPresets";
import { cn } from "@/lib/utils";

import { ProfileSettingsCard } from "@/components/settings/ProfileSettingsCard";
import { NotificationPreferencesCard } from "@/components/settings/NotificationPreferencesCard";
import { AccountSettingsCard } from "@/components/settings/AccountSettingsCard";
import { PlanUsageCard } from "@/components/settings/PlanUsageCard";
import { BusinessModelPlans } from "@/components/settings/BusinessModelPlans";
import { RolePreferencesCard } from "@/components/settings/RolePreferencesCard";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — ONYX Appearance & Theme" },
      {
        name: "description",
        content:
          "Personalise ONYX: switch between light, dark or system themes and pick your accent colour.",
      },
      { property: "og:title", content: "Settings — ONYX Appearance & Theme" },
      {
        property: "og:description",
        content: "Choose your ONYX theme and accent colour.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

const ACCENT_SWATCH: Record<Accent, { label: string; light: string; dark: string }> = {
  gold: { label: "Gold", light: "oklch(0.72 0.13 75)", dark: "oklch(0.75 0.13 78)" },
  sapphire: { label: "Sapphire", light: "oklch(0.6 0.14 250)", dark: "oklch(0.68 0.14 250)" },
  emerald: { label: "Emerald", light: "oklch(0.6 0.14 155)", dark: "oklch(0.68 0.14 155)" },
  rose: { label: "Rose", light: "oklch(0.62 0.18 20)", dark: "oklch(0.68 0.18 20)" },
  violet: { label: "Violet", light: "oklch(0.55 0.19 295)", dark: "oklch(0.72 0.16 297)" },
  teal: { label: "Teal", light: "oklch(0.55 0.1 195)", dark: "oklch(0.74 0.11 192)" },
  crimson: { label: "Crimson", light: "oklch(0.52 0.2 15)", dark: "oklch(0.68 0.18 18)" },
  slate: { label: "Slate", light: "oklch(0.45 0.035 250)", dark: "oklch(0.78 0.02 250)" },
};

const MODES: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

const THEME_STYLE_LABELS: Record<ThemeStyle, string> = {
  default: "Onyx",
  midnight: "Midnight",
  sunset: "Sunset",
  forest: "Forest",
  ocean: "Ocean",
  mono: "Mono",
};

function SettingsPage() {
  const { theme, mode, setMode, accent, setAccent, themeStyle, setThemeStyle } = useTheme();
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Personalise how ONYX looks on this device and manage your account preferences.
        </p>
      </div>

      {/* 1. Profile */}
      <section className="space-y-3">
        <div className="border-b border-border/60 pb-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Profile
          </h2>
        </div>
        <ProfileSettingsCard />
      </section>

      {/* 2. Appearance */}
      <section className="space-y-3">
        <div className="border-b border-border/60 pb-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Appearance
          </h2>
        </div>
        <Card className="lift transition-colors duration-200 hover:lift-hover">
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>Choose a theme and accent colour.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            <div className="space-y-3">
              <p className="text-sm font-medium">Theme</p>
              <ToggleGroup
                type="single"
                value={mode}
                onValueChange={(v) => v && setMode(v as ThemeMode)}
                className="justify-start gap-2"
              >
                {MODES.map(({ value, label, icon: Icon }) => (
                  <ToggleGroupItem
                    key={value}
                    value={value}
                    aria-label={label}
                    className="gap-2 rounded-lg border border-border px-4 transition-colors duration-200 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                  >
                    <Icon className="size-4" />
                    {label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <p className="text-xs text-muted-foreground">Currently showing the {theme} theme.</p>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium">Theme style</p>
                <p className="text-xs text-muted-foreground">
                  Choose the visual character of ONYX.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {THEME_STYLES.map((style) => {
                  const selected = themeStyle === style;
                  return (
                    <Button
                      key={style}
                      type="button"
                      variant="outline"
                      onClick={() => setThemeStyle(style)}
                      aria-pressed={selected}
                      className={cn(
                        "h-auto min-w-0 flex-col items-stretch gap-2 rounded-lg p-2 text-left",
                        selected &&
                          "border-primary ring-2 ring-primary ring-offset-2 ring-offset-background",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "h-10 w-full rounded-md border border-border/60",
                          `theme-style-preview-${style}`,
                        )}
                      />
                      <span className="flex w-full items-center justify-between gap-1 px-0.5 text-xs">
                        {THEME_STYLE_LABELS[style]}
                        {selected && <Check className="size-3.5 text-primary" />}
                      </span>
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium">Accent colour</p>
              <div className="flex flex-wrap items-center gap-4">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setAccent(null)}
                  aria-label="Use theme accent"
                  aria-pressed={accent === null}
                  className={cn(
                    "size-10 rounded-full",
                    accent === null &&
                      "ring-2 ring-foreground ring-offset-2 ring-offset-background",
                  )}
                >
                  <WandSparkles className="size-4" />
                </Button>
                {ACCENTS.map((a) => {
                  const swatch = ACCENT_SWATCH[a];
                  const selected = accent === a;
                  return (
                    <motion.button
                      key={a}
                      type="button"
                      onClick={() => setAccent(a)}
                      aria-label={swatch.label}
                      aria-pressed={selected}
                      {...getPressProps(shouldReduceMotion, { hoverScale: 1.08, tapScale: 0.92 })}
                      className={cn(
                        "flex size-10 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition-colors duration-200 cursor-pointer",
                        selected ? "ring-2 ring-foreground" : "hover:brightness-105",
                      )}
                      style={{ backgroundColor: theme === "dark" ? swatch.dark : swatch.light }}
                    >
                      {selected && <Check className="size-4 text-background" />}
                    </motion.button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                {accent
                  ? `${ACCENT_SWATCH[accent].label} selected`
                  : `${THEME_STYLE_LABELS[themeStyle]} theme accent selected`}
              </p>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium">Preview</p>
              <div className="panel lift relative overflow-hidden p-4 transition-colors duration-200">
                <div aria-hidden="true" className="brand-gradient absolute inset-x-0 top-0 h-1" />
                <div className="flex items-start gap-3 pt-1">
                  <span className="brand-gradient inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-primary-foreground">
                    O
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {THEME_STYLE_LABELS[themeStyle]} preview
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {mode === "system" ? `System (${theme})` : mode} mode ·{" "}
                      {accent ? ACCENT_SWATCH[accent].label : "Theme"} accent
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" className="transition-colors duration-200">
                    Primary action
                  </Button>
                  <Button size="sm" variant="outline" className="transition-colors duration-200">
                    Secondary
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 3. Notifications */}
      <section className="space-y-3">
        <div className="border-b border-border/60 pb-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Notifications
          </h2>
        </div>
        <NotificationPreferencesCard />
      </section>

      {/* 4. Preferences & Defaults */}
      <section className="space-y-3">
        <div className="border-b border-border/60 pb-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Preferences & Defaults
          </h2>
        </div>
        <RolePreferencesCard />
      </section>

      {/* 5. Subscription */}
      <section className="space-y-3">
        <div className="border-b border-border/60 pb-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Subscription
          </h2>
        </div>
        <div className="space-y-3">
          <PlanUsageCard />
          <BusinessModelPlans />
        </div>
      </section>

      {/* 6. Account & Security */}
      <section className="space-y-3">
        <div className="border-b border-border/60 pb-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Account & Security
          </h2>
        </div>
        <AccountSettingsCard />
      </section>
    </div>
  );
}
