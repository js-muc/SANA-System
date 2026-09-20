import { Check, Palette } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

export default function Settings() {
  const { theme, setTheme, themes } = useTheme();

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Palette className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Settings</h1>
          <p className="text-sm text-muted">Personalize how SANA OS looks for you</p>
        </div>
      </div>

      <div className="bg-surface rounded-2xl border border-border shadow-sm p-6">
        <h2 className="font-semibold text-foreground mb-1">Theme</h2>
        <p className="text-sm text-muted mb-5">
          This choice is saved on this device only — other people using SANA OS won't see your theme.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {themes.map(t => {
            const isActive = theme === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                className={`relative flex flex-col items-start gap-3 p-4 rounded-xl border-2 text-left transition ${
                  isActive ? 'border-primary' : 'border-border hover:border-muted'
                }`}
              >
                {isActive && (
                  <div className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                    <Check className="w-3 h-3 text-primary-foreground" />
                  </div>
                )}
                <div className="flex gap-1.5">
                  {t.colors.map((c, i) => (
                    <div key={i} className="w-6 h-6 rounded-full border border-border" style={{ backgroundColor: c }} />
                  ))}
                </div>
                <span className="text-sm font-medium text-foreground">{t.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}