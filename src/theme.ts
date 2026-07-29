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
  readonly '--cards-card-selected-outline': string;
  readonly '--cards-card-selected-shadow': string;
};

const getSelectedCardThemeStyle = (accent: string) => ({
  '--cards-card-selected-outline': `color-mix(in srgb, ${accent} 60%, transparent)`,
  '--cards-card-selected-shadow':
    `0 10px 15px -3px rgba(0, 0, 0, 0.1), ` +
    `0 4px 6px -4px rgba(0, 0, 0, 0.1), ` +
    `0 0 0 4px color-mix(in srgb, ${accent} 15%, transparent)`,
});

export function getThemeAccentStyle(accent: ThemeAccent): ThemeAccentStyle {
  if (isThemeAccentPreset(accent)) {
    const preset = THEME_ACCENTS[accent];
    return {
      '--hn-color-accent': preset.accent,
      '--hn-color-accent-hover': preset.accentHover,
      '--hn-focus-ring': `0 0 0 3px ${preset.focusRingColor}`,
      ...getSelectedCardThemeStyle(preset.accent),
    };
  }

  return {
    '--hn-color-accent': accent,
    '--hn-color-accent-hover': `color-mix(in srgb, ${accent} 82%, white)`,
    '--hn-focus-ring': `0 0 0 3px color-mix(in srgb, ${accent} 42%, transparent)`,
    ...getSelectedCardThemeStyle(accent),
  };
}
