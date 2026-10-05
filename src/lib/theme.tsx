import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "light" | "dark";
export type ThemeMode = "light" | "dark" | "system";
export type Accent =
  "gold" | "sapphire" | "emerald" | "rose" | "violet" | "teal" | "crimson" | "slate";

export const ACCENTS: Accent[] = [
  "gold",
  "sapphire",
  "emerald",
  "rose",
  "violet",
  "teal",
  "crimson",
  "slate",
];

export type ThemeStyle = "default" | "midnight" | "sunset" | "forest" | "ocean" | "mono";

export const THEME_STYLES: ThemeStyle[] = [
  "default",
  "midnight",
  "sunset",
  "forest",
  "ocean",
  "mono",
];

type ThemeContextValue = {
  theme: Theme;
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  toggle: () => void;
  /** null = follow the theme style's own primary colour */
  accent: Accent | null;
  setAccent: (a: Accent | null) => void;
  themeStyle: ThemeStyle;
  setThemeStyle: (s: ThemeStyle) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  mode: "system",
  setMode: () => {},
  toggle: () => {},
  accent: null,
  setAccent: () => {},
  themeStyle: "default",
  setThemeStyle: () => {},
});

function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [theme, setTheme] = useState<Theme>("light");
  const [accent, setAccentState] = useState<Accent | null>(null);
  const [themeStyle, setThemeStyleState] = useState<ThemeStyle>("default");

  useEffect(() => {
    const storedMode = window.localStorage.getItem("theme") as ThemeMode | null;
    const initialMode: ThemeMode =
      storedMode === "light" || storedMode === "dark" || storedMode === "system"
        ? storedMode
        : "system";
    setModeState(initialMode);
    setTheme(initialMode === "system" ? systemTheme() : initialMode);

    const storedAccent = window.localStorage.getItem("onyx-accent") as Accent | null;
    if (storedAccent && ACCENTS.includes(storedAccent)) setAccentState(storedAccent);

    const storedStyle = window.localStorage.getItem("onyx-theme-style") as ThemeStyle | null;
    if (storedStyle && THEME_STYLES.includes(storedStyle)) setThemeStyleState(storedStyle);
  }, []);

  useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setTheme(mq.matches ? "dark" : "light");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    if (accent) document.documentElement.setAttribute("data-accent", accent);
    else document.documentElement.removeAttribute("data-accent");
  }, [accent]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme-style", themeStyle);
  }, [themeStyle]);

  function setMode(next: ThemeMode) {
    setModeState(next);
    window.localStorage.setItem("theme", next);
    setTheme(next === "system" ? systemTheme() : next);
  }

  function setAccent(next: Accent | null) {
    setAccentState(next);
    if (next) window.localStorage.setItem("onyx-accent", next);
    else window.localStorage.removeItem("onyx-accent");
  }

  function setThemeStyle(next: ThemeStyle) {
    setThemeStyleState(next);
    window.localStorage.setItem("onyx-theme-style", next);
  }

  return (
    <ThemeContext.Provider
      value={{
        theme,
        mode,
        setMode,
        accent,
        setAccent,
        themeStyle,
        setThemeStyle,
        toggle: () => setMode(theme === "dark" ? "light" : "dark"),
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
