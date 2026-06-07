"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>("light");

  // Leer preferencia al montar
  useEffect(() => {
    const saved = localStorage.getItem("logi_theme") as Theme | null;
    const preferred = saved ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    apply(preferred);
    setTheme(preferred);
  }, []);

  function apply(t: Theme) {
    document.documentElement.classList.toggle("dark", t === "dark");
  }

  function toggle() {
    const next: Theme = theme === "light" ? "dark" : "light";
    apply(next);
    localStorage.setItem("logi_theme", next);
    setTheme(next);
  }

  return { theme, toggle, isDark: theme === "dark" };
}
