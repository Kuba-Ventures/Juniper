import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

// Light/dark theming for Juniper. The palette itself lives in index.css as the
// :root and .dark CSS-variable sets; this provider only decides which one is
// active by toggling the `dark` class on <html>, and remembers the choice.

export type Theme = "light" | "dark";

const STORAGE_KEY = "juniper_theme";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
}

// The saved choice, or the OS preference on first visit. Exported so a tiny
// pre-hydration script (index.html) can apply the class before React mounts and
// avoid a flash — both paths read the same key.
export function readInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* localStorage unavailable — fall through to system */
  }
  return systemPrefersDark() ? "dark" : "light";
}

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() =>
    typeof document === "undefined" ? "light" : readInitialTheme(),
  );

  // Keep <html> and storage in sync whenever the theme changes.
  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* non-fatal */
    }
  }, [theme]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  const toggleTheme = useCallback(() => setThemeState((t) => (t === "dark" ? "light" : "dark")), []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
