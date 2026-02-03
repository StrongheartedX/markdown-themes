import { themes, type ThemeId } from '../themes';

interface ThemeSelectorProps {
  currentTheme: ThemeId;
  onThemeChange: (theme: ThemeId) => void;
}

export function ThemeSelector({ currentTheme, onThemeChange }: ThemeSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="theme-select" className="text-sm text-text-secondary">
        Theme:
      </label>
      <select
        id="theme-select"
        value={currentTheme}
        onChange={(e) => onThemeChange(e.target.value as ThemeId)}
        className="
          px-3 py-1.5 rounded-[var(--radius)]
          bg-bg-secondary text-text-primary
          border border-border
          focus:outline-none focus:ring-2 focus:ring-accent
          cursor-pointer
        "
      >
        {themes.map((theme) => (
          <option key={theme.id} value={theme.id}>
            {theme.name}
          </option>
        ))}
      </select>
    </div>
  );
}
