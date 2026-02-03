import { useEffect } from 'react';

/**
 * Tracks mouse position and sets CSS variables for spotlight effects.
 * Sets --spotlight-x and --spotlight-y as percentages (0-100).
 * Only active when enabled is true.
 */
export function useMouseSpotlight(enabled: boolean) {
  useEffect(() => {
    if (!enabled) {
      // Reset to center when disabled
      document.documentElement.style.setProperty('--spotlight-x', '50%');
      document.documentElement.style.setProperty('--spotlight-y', '50%');
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth) * 100;
      const y = (e.clientY / window.innerHeight) * 100;
      document.documentElement.style.setProperty('--spotlight-x', `${x}%`);
      document.documentElement.style.setProperty('--spotlight-y', `${y}%`);
    };

    // Set initial position to center
    document.documentElement.style.setProperty('--spotlight-x', '50%');
    document.documentElement.style.setProperty('--spotlight-y', '50%');

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [enabled]);
}
