import type { BundledTheme } from 'shiki';

import './dark-academia.css';
import './cyberpunk.css';
import './parchment.css';
import './cosmic.css';
import './noir.css';
import './nordic.css';
import './glassmorphism.css';
import './retro-futurism.css';
import './art-deco.css';

// Shiki theme mappings - each app theme maps to a complementary Shiki syntax theme
// Format: [lightTheme, darkTheme] - Shiki uses first for light mode, second for dark
export const shikiThemeMap: Record<string, [BundledTheme, BundledTheme]> = {
  'default': ['github-light', 'github-dark'],
  'dark-academia': ['rose-pine-dawn', 'rose-pine'],        // Warm sepia tones
  'cyberpunk': ['snazzy-light', 'synthwave-84'],           // Neon aesthetics
  'parchment': ['github-light', 'min-light'],              // Clean, paper-like
  'cosmic': ['material-theme-lighter', 'dracula'],         // Deep purples
  'noir': ['min-light', 'github-dark'],                    // High contrast monochrome
  'nordic': ['nord', 'nord'],                              // Muted blues/greens
  'glassmorphism': ['github-light', 'github-dark-dimmed'], // Soft, translucent feel
  'retro-futurism': ['solarized-light', 'solarized-dark'], // Warm pastels
  'art-deco': ['one-light', 'one-dark-pro'],               // Gold/elegant accents
};

export const themes = [
  { id: 'default', name: 'Default', className: '' },
  { id: 'dark-academia', name: 'Dark Academia', className: 'theme-dark-academia' },
  { id: 'cyberpunk', name: 'Cyberpunk', className: 'theme-cyberpunk' },
  { id: 'parchment', name: 'Parchment', className: 'theme-parchment' },
  { id: 'cosmic', name: 'Cosmic', className: 'theme-cosmic' },
  { id: 'noir', name: 'Noir', className: 'theme-noir' },
  { id: 'nordic', name: 'Nordic', className: 'theme-nordic' },
  { id: 'glassmorphism', name: 'Glassmorphism', className: 'theme-glassmorphism' },
  { id: 'retro-futurism', name: 'Retro Futurism', className: 'theme-retro-futurism' },
  { id: 'art-deco', name: 'Art Deco', className: 'theme-art-deco' },
] as const;

export type ThemeId = typeof themes[number]['id'];

// Helper to get Shiki themes for a given app theme
export function getShikiThemes(themeId: ThemeId): [BundledTheme, BundledTheme] {
  return shikiThemeMap[themeId] || shikiThemeMap['default'];
}
