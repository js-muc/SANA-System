import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

export const THEMES: { id: string; name: string; colors: [string, string, string] }[] = [
  { id: 'default', name: 'Default', colors: ['#1D4ED8', '#F8FAFC', '#0F172A'] },
  { id: 'evergreen', name: 'Evergreen & Forest', colors: ['#4ADE80', '#0F1712', '#DCE6D2'] },
  { id: 'nord', name: 'Nord & Arctic Blues', colors: ['#88C0D0', '#2E3440', '#ECEFF4'] },
  { id: 'solarized-light', name: 'Solarized Light', colors: ['#268BD2', '#FDF6E3', '#657B83'] },
  { id: 'solarized-dark', name: 'Solarized Dark', colors: ['#268BD2', '#002B36', '#839496'] },
  { id: 'sepia', name: 'Sepia & Warm Reading', colors: ['#9C661F', '#F0E0C5', '#5B432B'] },
  { id: 'cyberpunk', name: '80s Cyberpunk & Neon', colors: ['#FF00AA', '#0A0A14', '#F0F0FF'] },
  { id: 'matrix', name: 'Classic Matrix Green', colors: ['#00FF41', '#000000', '#00FF41'] },
];

const STORAGE_KEY = 'sana-theme';

type ThemeContextType = {
  theme: string;
  setTheme: (id: string) => void;
  themes: typeof THEMES;
};

const ThemeContext = createContext<ThemeContextType | null>(null);

function applyTheme(id: string) {
  if (id === 'default') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', id);
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<string>(() => {
    const saved = localStorage.getItem(STORAGE_KEY) ?? 'default';
    applyTheme(saved);
    return saved;
  });

  function setTheme(id: string) {
    localStorage.setItem(STORAGE_KEY, id);
    applyTheme(id);
    setThemeState(id);
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}