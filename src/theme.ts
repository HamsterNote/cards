import type { CSSProperties } from 'react';

/** 组件库主题。light 为默认浅色主题，dark 为深色主题。 */
export type CardsTheme = 'light' | 'dark';

const CARDS_THEME_ACCENTS = {
  violet: {
    accent: '#7c83ff',
    accentHover: '#9197ff',
    focusRingColor: 'rgb(145 151 255 / 42%)',
  },
  blue: {
    accent: '#60a5fa',
    accentHover: '#7db6fb',
    focusRingColor: 'rgb(96 165 250 / 42%)',
  },
  teal: {
    accent: '#2dd4bf',
    accentHover: '#4fdcc9',
    focusRingColor: 'rgb(45 212 191 / 42%)',
  },
  orange: {
    accent: '#fb923c',
    accentHover: '#fca45c',
    focusRingColor: 'rgb(251 146 60 / 42%)',
  },
  pink: {
    accent: '#f472b6',
    accentHover: '#f68cc4',
    focusRingColor: 'rgb(244 114 182 / 42%)',
  },
} as const;

type CardsThemeAccentPreset = keyof typeof CARDS_THEME_ACCENTS;

/** 画布主题色支持内置色名及任意 CSS 颜色值。 */
export type CardsThemeAccent = CardsThemeAccentPreset | (string & {});

function isCardsThemeAccentPreset(
  accent: string
): accent is CardsThemeAccentPreset {
  return accent in CARDS_THEME_ACCENTS;
}

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

export function getThemeAccentStyle(
  accent: CardsThemeAccent
): ThemeAccentStyle {
  if (isCardsThemeAccentPreset(accent)) {
    const preset = CARDS_THEME_ACCENTS[accent];
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
