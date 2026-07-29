import { NoteContent } from '@hamster-note/notes';
import type { CSSProperties, ReactNode } from 'react';
import type { CardsTheme } from '../theme';
import { resolveCardContentBlocks } from '../utils/card-content-blocks';
import type { CardCanvasCard } from './CardCanvas';

export type ExternalCardPreviewProps = {
  readonly card: CardCanvasCard;
  readonly position: { readonly x: number; readonly y: number };
  readonly renderCardContent: ((content: string) => ReactNode) | undefined;
  readonly renderCardTitle: ((title: string) => ReactNode) | undefined;
  readonly theme: CardsTheme;
};

function getReadableThemeColor(themeColor: string): '#000' | '#fff' {
  const hex = themeColor.slice(1);
  if (
    !themeColor.startsWith('#') ||
    (hex.length !== 3 && hex.length !== 6) ||
    !/^[\da-f]+$/i.test(hex)
  ) {
    return '#000';
  }

  const expanded =
    hex.length === 3
      ? `${hex.charAt(0).repeat(2)}${hex.charAt(1).repeat(2)}${hex.charAt(2).repeat(2)}`
      : hex;
  const channels = [0, 2, 4].map((offset) => {
    const value = Number.parseInt(expanded.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance =
    (channels[0] ?? 0) * 0.2126 +
    (channels[1] ?? 0) * 0.7152 +
    (channels[2] ?? 0) * 0.0722;

  return luminance > 0.179 ? '#000' : '#fff';
}

export function ExternalCardPreview({
  card,
  position,
  renderCardContent,
  renderCardTitle,
  theme,
}: ExternalCardPreviewProps) {
  const titleStyle: CSSProperties = {
    ...(card.themeColor === undefined
      ? {}
      : {
          backgroundColor: card.themeColor,
          color: getReadableThemeColor(card.themeColor),
        }),
    ...card.titleStyle,
  };
  const contentStyle: CSSProperties = {
    ...(card.themeColor === undefined
      ? {}
      : {
          backgroundColor:
            theme === 'dark'
              ? `color-mix(in srgb, ${card.themeColor} 18%, black)`
              : `color-mix(in srgb, ${card.themeColor} 12%, white)`,
        }),
    ...card.contentStyle,
  };
  const noteBlocks = resolveCardContentBlocks(
    card.id,
    card.content,
    card.contentBlocks
  );

  return (
    <div
      aria-hidden="true"
      className="cards-card-canvas__card cards-card-canvas__card--external-preview"
      data-external-card-preview
      data-card-headless={card.headless ? 'true' : undefined}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${card.width}px`,
        height: `${card.height}px`,
        zIndex: card.zIndex,
      }}
    >
      {card.headless === true ? null : (
        <div className="cards-card-canvas__card-header" style={titleStyle}>
          {renderCardTitle ? renderCardTitle(card.title) : card.title}
        </div>
      )}
      <div className="cards-card-canvas__card-content" style={contentStyle}>
        {renderCardContent ? (
          renderCardContent(card.content)
        ) : card.content !== '' || (card.contentBlocks?.length ?? 0) > 0 ? (
          <div className="cards-card-canvas__card-note cards-card-canvas__embedded-note">
            <NoteContent
              blocks={noteBlocks}
              title=""
              theme={theme}
              {...(card.themeColor === undefined
                ? {}
                : { themeColor: card.themeColor })}
              editable={false}
              topPadding={0}
              bottomPadding={0}
            />
          </div>
        ) : (
          card.content
        )}
      </div>
    </div>
  );
}
