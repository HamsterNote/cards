import {
  isThemeAccentPreset,
  THEME_ACCENTS,
  type ThemeAccent,
} from '@hamster-note/components';
import type { CSSProperties } from 'react';

/** 组件库主题。light 为默认浅色主题，dark 为深色主题。 */
export type CardsTheme = 'light' | 'dark';

type ThemeAccentStyle = CSSProperties & {
  readonly '--hn-color-accent': string;
  readonly '--hn-color-accent-hover': string;
  readonly '--hn-focus-ring': string;
};

export function getThemeAccentStyle(accent: ThemeAccent): ThemeAccentStyle {
  if (isThemeAccentPreset(accent)) {
    const preset = THEME_ACCENTS[accent];
    return {
      '--hn-color-accent': preset.accent,
      '--hn-color-accent-hover': preset.accentHover,
      '--hn-focus-ring': `0 0 0 3px ${preset.focusRingColor}`,
    };
  }

  return {
    '--hn-color-accent': accent,
    '--hn-color-accent-hover': `color-mix(in srgb, ${accent} 82%, white)`,
    '--hn-focus-ring': `0 0 0 3px color-mix(in srgb, ${accent} 42%, transparent)`,
  };
}
