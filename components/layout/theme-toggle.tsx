"use client";

import { Moon, SunMedium } from "lucide-react";

import { useTheme } from "@/hooks/use-theme";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="h-11 rounded-2xl border border-border bg-background px-4"
    >
      {theme === "dark" ? <SunMedium className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
      <span className="ml-2">{theme === "dark" ? "Light mode" : "Dark mode"}</span>
    </Button>
  );
}
