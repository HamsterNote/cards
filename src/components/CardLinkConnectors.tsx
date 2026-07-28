import {
  Button,
  confirm,
  Icon,
  Popover,
  ThemeProvider,
  type ThemeAccent,
} from '@hamster-note/components';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getThemeAccentStyle, type CardsTheme } from '../theme';
import {
  buildCardLinkPairs,
  removeSymmetricCardLink,
} from '../utils/card-links';
import type { CardCanvasCard } from './CardCanvas';

interface CardLinkConnectorsProps {
  readonly cards: readonly CardCanvasCard[];
  readonly commitCards?: (cards: CardCanvasCard[]) => void;
  readonly getCards: () => CardCanvasCard[];
  readonly theme: CardsTheme;
  readonly themeColor: ThemeAccent;
}

function getPairKey(fromId: string, toId: string): string {
  return JSON.stringify([fromId, toId]);
}

export function CardLinkConnectors({
  cards,
  commitCards,
  getCards,
  theme,
  themeColor,
}: CardLinkConnectorsProps) {
  const pairs = useMemo(() => buildCardLinkPairs(cards), [cards]);
  const connectorsRef = useRef<SVGSVGElement>(null);
  const anchorsRef = useRef(new Map<string, HTMLButtonElement>());
  const [selectedPairKey, setSelectedPairKey] = useState<string>();
  const [selectedAnchor, setSelectedAnchor] =
    useState<HTMLButtonElement | null>(null);

  const selectedPair = pairs.find(
    (pair) => getPairKey(pair.fromId, pair.toId) === selectedPairKey
  );
  const activeSelectedPair =
    selectedAnchor?.isConnected === true ? selectedPair : undefined;
  const selectedSource = cards.find(
    (card) => card.id === activeSelectedPair?.fromId
  );
  const selectedTarget = cards.find(
    (card) => card.id === activeSelectedPair?.toId
  );
  useEffect(() => {
    if (activeSelectedPair === undefined) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest(
          '[data-card-link-connector], [data-card-link-connector-hit-target], [data-card-link-connector-anchor], [data-card-link-popover]'
        )
      ) {
        return;
      }
      setSelectedPairKey(undefined);
      setSelectedAnchor(null);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [activeSelectedPair]);

  useEffect(() => {
    const connectors = connectorsRef.current;
    if (connectors === null) return;

    // SVG line 本身不承载按钮语义；鼠标点击由容器委托，键盘操作由下方的 HTML button 提供。
    const handleClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const connector = event.target.closest<SVGLineElement>(
        '[data-card-link-pair-key]'
      );
      const pairKey = connector?.dataset.cardLinkPairKey;
      if (pairKey === undefined) return;

      setSelectedPairKey(pairKey);
      setSelectedAnchor(anchorsRef.current.get(pairKey) ?? null);
    };

    connectors.addEventListener('click', handleClick);
    return () => connectors.removeEventListener('click', handleClick);
  }, []);

  return (
    <>
      <svg
        ref={connectorsRef}
        className="cards-card-canvas__connectors"
        data-card-link-connectors
      >
        <title>Card Connectors</title>
        {pairs.map((pair) => {
          const sourceCard = cards.find((card) => card.id === pair.fromId);
          const targetCard = cards.find((card) => card.id === pair.toId);
          if (sourceCard === undefined || targetCard === undefined) return null;

          const sourceX = sourceCard.x + sourceCard.width / 2;
          const sourceY = sourceCard.y + sourceCard.height / 2;
          const targetX = targetCard.x + targetCard.width / 2;
          const targetY = targetCard.y + targetCard.height / 2;
          const pairKey = getPairKey(pair.fromId, pair.toId);
          const isSelected = activeSelectedPair === pair;

          return (
            <g key={pairKey}>
              <line
                className="cards-card-canvas__connector-hit-target"
                data-card-link-connector-hit-target
                data-card-link-pair-key={pairKey}
                x1={sourceX}
                y1={sourceY}
                x2={targetX}
                y2={targetY}
              />
              <line
                className="cards-card-canvas__connector"
                data-card-link-connector
                data-card-link-pair-key={pairKey}
                data-selected={isSelected ? 'true' : undefined}
                x1={sourceX}
                y1={sourceY}
                x2={targetX}
                y2={targetY}
              />
            </g>
          );
        })}
      </svg>

      {pairs.map((pair) => {
        const sourceCard = cards.find((card) => card.id === pair.fromId);
        const targetCard = cards.find((card) => card.id === pair.toId);
        if (sourceCard === undefined || targetCard === undefined) return null;

        const pairKey = getPairKey(pair.fromId, pair.toId);
        const midpointX =
          (sourceCard.x +
            sourceCard.width / 2 +
            targetCard.x +
            targetCard.width / 2) /
          2;
        const midpointY =
          (sourceCard.y +
            sourceCard.height / 2 +
            targetCard.y +
            targetCard.height / 2) /
          2;
        return (
          <button
            key={pairKey}
            ref={(anchor) => {
              if (anchor === null) {
                anchorsRef.current.delete(pairKey);
              } else {
                anchorsRef.current.set(pairKey, anchor);
              }
            }}
            aria-label={`选择 ${sourceCard.title || '未命名卡片'} 与 ${targetCard.title || '未命名卡片'} 的链接`}
            aria-pressed={activeSelectedPair === pair}
            className="cards-card-canvas__connector-anchor"
            data-card-link-connector-anchor
            type="button"
            style={{ left: midpointX, top: midpointY }}
            onClick={(event) => {
              setSelectedPairKey(pairKey);
              setSelectedAnchor(event.currentTarget);
            }}
          />
        );
      })}

      {commitCards !== undefined &&
      activeSelectedPair !== undefined &&
      selectedSource !== undefined &&
      selectedTarget !== undefined &&
      selectedAnchor !== null ? (
        <Popover
          anchor={selectedAnchor}
          anchorOffset={8}
          className="cards-card-canvas__popover cards-card-canvas__link-popover"
          data-card-link-popover
          style={getThemeAccentStyle(themeColor)}
          theme={theme}
        >
          <ThemeProvider accent={themeColor} mode={theme}>
            <Button
              aria-label={`删除 ${selectedSource.title || '未命名卡片'} 与 ${selectedTarget.title || '未命名卡片'} 的链接`}
              disabled={commitCards === undefined}
              size="small"
              type="button"
              variant="ghost"
              onClick={async () => {
                const confirmed = await confirm({
                  title: '删除链接？',
                  description: `确定要删除 ${selectedSource.title || '未命名卡片'} 与 ${selectedTarget.title || '未命名卡片'} 的链接吗？`,
                  confirmText: '删除',
                  cancelText: '取消',
                  tone: 'danger',
                });
                if (!confirmed) return;

                const latestCards = getCards();
                const pairStillExists = buildCardLinkPairs(latestCards).some(
                  (pair) =>
                    pair.fromId === activeSelectedPair.fromId &&
                    pair.toId === activeSelectedPair.toId
                );
                if (pairStillExists) {
                  commitCards(
                    removeSymmetricCardLink(
                      latestCards,
                      activeSelectedPair.fromId,
                      activeSelectedPair.toId
                    )
                  );
                }
                setSelectedPairKey(undefined);
                setSelectedAnchor(null);
              }}
            >
              <Icon name="delete" />
            </Button>
          </ThemeProvider>
        </Popover>
      ) : null}
    </>
  );
}
