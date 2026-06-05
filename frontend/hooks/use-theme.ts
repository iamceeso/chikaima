"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("olanma-theme") as Theme | null;
    const nextTheme = savedTheme ?? "dark";
    setTheme(nextTheme);
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
  }, []);

  const updateTheme = (nextTheme: Theme) => {
    setTheme(nextTheme);
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
    window.localStorage.setItem("olanma-theme", nextTheme);
  };

  return { theme, setTheme: updateTheme };
}
