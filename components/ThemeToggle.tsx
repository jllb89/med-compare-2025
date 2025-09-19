'use client';

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { CARD } from "@/lib/ui";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => 'light');

  // Initialize from DOM/localStorage
  useEffect(() => {
    const root = document.documentElement;
    const ls = (localStorage.getItem('theme') as 'light' | 'dark' | null);
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initial = ls ?? (systemDark ? 'dark' : 'light');
    applyTheme(initial);
    setTheme(initial);
    // keep in sync if user changes OS theme and they haven't picked manually
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const stored = localStorage.getItem('theme');
      if (!stored) {
        const next = mq.matches ? 'dark' : 'light';
        applyTheme(next);
        setTheme(next);
      }
    };
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  function applyTheme(next: 'light' | 'dark') {
    const root = document.documentElement;
    if (next === 'dark') {
      root.dataset.theme = 'dark';
      root.classList.add('dark');
    } else {
      root.dataset.theme = 'light';
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', next);
  }

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
  }

  return (
    <button
      onClick={toggle}
      aria-label="Toggle dark mode"
      className={`${CARD} inline-flex items-center gap-2 px-3 py-2 text-sm`}
    >
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      <span className="font-medium">{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
    </button>
  );
}
