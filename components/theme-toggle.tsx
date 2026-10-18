"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

type Theme = "system" | "light" | "dark";

function applyTheme(theme: Theme) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDark = theme === "dark" || (theme === "system" && prefersDark);
  document.documentElement.classList.toggle("dark", isDark);
  try { localStorage.setItem("hh-theme", theme); } catch { /* ignore */ }
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>("system");
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    let selected: Theme = "system";
    try {
      const saved = localStorage.getItem("hh-theme");
      if (saved === "dark" || saved === "light" || saved === "system") selected = saved;
    } catch { /* ignore */ }
    setTheme(selected);
    applyTheme(selected);
    setInitialized(true);
  }, []);

  // Avoid the initial default 'system' effect overwriting a restored dark/light
  // preference before the first localStorage read has completed.
  useEffect(() => {
    if (!initialized || theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [initialized, theme]);

  function changeTheme(t: Theme) {
    setTheme(t);
    applyTheme(t);
  }

  return { theme, changeTheme };
}

export default function ThemeToggle() {
  const { theme, changeTheme } = useTheme();

  const options: { value: Theme; icon: React.ReactNode; label: string }[] = [
    { value: "light", icon: <Sun className="size-3.5" />, label: "Light" },
    { value: "system", icon: <Monitor className="size-3.5" />, label: "System" },
    { value: "dark", icon: <Moon className="size-3.5" />, label: "Dark" },
  ];

  return (
    <div className="flex items-center gap-1 rounded-md border p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => changeTheme(o.value)}
          aria-label={o.label}
          title={o.label}
          className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${
            theme === o.value
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.icon}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}
