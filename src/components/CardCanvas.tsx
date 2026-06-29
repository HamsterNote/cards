import type { CSSProperties, ReactNode } from 'react';
import { Fragment, useEffect, useRef, useState, useMemo } from 'react';
import { CardCanvasItem } from './CardCanvasItem';
import { buildCardLinkPairs } from '../utils/card-links';
import './CardCanvas.css';

/** 卡片数据模型 */
export interface CardCanvasCard {
  /** 唯一标识 */
  id: string;
  /** 父卡片 id；无父级时省略 */
  parent?: string;
  /** 卡片标题 */
  title: string;
  /** 卡片内容 */
  content: string;
  /** X轴坐标 */
  x: number;
  /** Y轴坐标 */
  y: number;
  /** 卡片宽度 */
  width: number;
  /** 卡片高度 */
  height: number;
  /** 标题区域自定义样式 */
  titleStyle?: CSSProperties;
  /** 内容区域自定义样式 */
  contentStyle?: CSSProperties;
  /** 卡片 Z 轴层级 */
  zIndex?: number;
  /** 该卡片链接的目标卡片 id 列表（link-mode 专用） */
  linkedCardIds?: readonly string[];
}

/** 画布配置选项 */
export interface CardCanvasOptions {
  /** 是否只有选中的卡片才能被移动和 resize。默认 false。 */
  requireSelectionToMoveResize?: boolean;
  /** 移动结束后是否自动选中该卡片。默认 false。 */
  selectOnMoveEnd?: boolean;
}

/** 画布组件属性 */
export interface CardCanvasProps {
  /** 卡片列表 */
  cards: CardCanvasCard[];
  /** 卡片变更回调 */
  onCardsChange?: (nextCards: CardCanvasCard[]) => void;
  /** 自定义类名 */
  className?: string;
  /** 子节点（如需叠加其他内容） */
  children?: ReactNode;
  /** 受控模式下当前选中的卡片 id 列表 */
  selected?: string[];
  /** 卡片被点击时的回调，参数为被点击卡片的 id */
  onSelect?: (id: string) => void;
  /** 点击所有卡片外部时清空选择的回调 */
  onClearSelection?: () => void;
  /** 卡片渲染选项 */
  options?: CardCanvasOptions;
  /** 自定义卡片标题渲染 */
  renderCardTitle?: (title: string) => ReactNode;
  /** 自定义卡片内容渲染 */
  renderCardContent?: (content: string) => ReactNode;
  /**
   * 当卡片被选中时渲染一个 Popover（浮层），插入与卡片同级的 DOM 位置。
   * 参数 1：卡片数据；参数 2：set 函数，接收 Partial<Omit<CardCanvasCard,'id'>>，
   *         会合并到对应卡片并触发 onCardsChange。
   * 返回 null/undefined 时不渲染。卡片正在被拖拽时不展示 Popover。
   */
  renderPopover?: (
    card: CardCanvasCard,
    set: (data: Partial<Omit<CardCanvasCard, 'id'>>) => void
  ) => ReactNode;
  /** 是否启用连线模式。默认 false。 */
  linkMode?: boolean;
  /** 连线模式下，点击目标卡片时的回调 */
  onLinkClick?: (targetCard: CardCanvasCard, sourceCard: CardCanvasCard) => void;
}

/** 连线拖拽过程中的实时状态 */
interface LinkDragInfo {
  /** 源头卡片 id */
  readonly sourceCardId: string;
  /** 指针在画布坐标系中的位置 */
  readonly point: { readonly x: number; readonly y: number };
  /** 当前悬停的目标卡片 id（无目标时为 undefined） */
  readonly targetCardId: string | undefined;
}

export function CardCanvas({
  cards,
  onCardsChange,
  className = '',
  children,
  selected,
  onSelect,
  onClearSelection,
  options = {},
  renderCardTitle,
  renderCardContent,
  renderPopover,
  linkMode: linkModeProp,
  onLinkClick,
}: CardCanvasProps) {
  const linkMode = linkModeProp ?? false;
  const [parentCandidateId, setParentCandidateId] = useState<string | undefined>();
  // 当前正在被拖拽的卡片 id（仅有一张卡片在拖拽时才有值），用于隐藏 Popover
  const [movingCardId, setMovingCardId] = useState<string | undefined>();
  // 连线拖拽实时状态：拖拽期间存储源头卡片、指针位置、目标卡片
  const [linkDragInfo, setLinkDragInfo] = useState<LinkDragInfo | null>(null);

  const normalizedOptions: Required<CardCanvasOptions> = {
    requireSelectionToMoveResize: options.requireSelectionToMoveResize ?? false,
    selectOnMoveEnd: options.selectOnMoveEnd ?? false,
  };

  // Use a ref to hold the latest onCardsChange to avoid stale closures in event listeners
  const onCardsChangeRef = useRef(onCardsChange);
  useEffect(() => {
    onCardsChangeRef.current = onCardsChange;
  }, [onCardsChange]);

  // Ref to hold the current cards prop for event handlers
  const cardsRef = useRef(cards);
  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);

  // Ref to hold the latest onClearSelection to avoid stale closures in event listeners
  const onClearSelectionRef = useRef(onClearSelection);
  useEffect(() => {
    onClearSelectionRef.current = onClearSelection;
  }, [onClearSelection]);

  // Install a pointerdown listener on document to clear selection when clicking outside cards
  useEffect(() => {
    // Only install when onClearSelection is provided and something is selected
    if (!onClearSelection || !selected || selected.length === 0) return;

    const handlePointerDown = (event: PointerEvent) => {
      // Check if the click is inside a card element
      const isInsideCard = event
        .composedPath()
        .some(
          (target) =>
            target instanceof HTMLElement &&
            target.classList.contains('cards-card-canvas__card')
        );

      // If click is outside all cards, clear selection
      if (!isInsideCard) {
        onClearSelectionRef.current?.();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [onClearSelection, selected]);

  const linkPairs = useMemo(() => buildCardLinkPairs(cards), [cards]);

  return (
    <div className={`cards-card-canvas__wrapper ${className}`}>
      <div className="cards-card-canvas__container">
        <svg
          className="cards-card-canvas__connectors"
          data-card-link-connectors
        >
          <title>Card Connectors</title>
          {linkPairs.map((pair) => {
            const sourceCard = cards.find((c) => c.id === pair.fromId);
            const targetCard = cards.find((c) => c.id === pair.toId);
            if (!sourceCard || !targetCard) return null;

            const sourceX = sourceCard.x + sourceCard.width / 2;
            const sourceY = sourceCard.y + sourceCard.height / 2;
            const targetX = targetCard.x + targetCard.width / 2;
            const targetY = targetCard.y + targetCard.height / 2;

            return (
              <line
                key={`${pair.fromId}-${pair.toId}`}
                data-card-link-connector
                x1={sourceX}
                y1={sourceY}
                x2={targetX}
                y2={targetY}
              />
            );
          })}
        </svg>
        {cards.map((card) => {
          // 判断该卡片是否需要展示 Popover：提供了 renderPopover、卡片被选中、且当前没有卡片在拖拽
          const showPopover =
            !!renderPopover && (selected?.includes(card.id) ?? false) && !movingCardId;

          // set 回调：将部分数据合并到当前卡片，并触发 onCardsChange
          const setCard = (data: Partial<Omit<CardCanvasCard, 'id'>>) => {
            const next = cards.map((currentCard) =>
              currentCard.id === card.id ? { ...currentCard, ...data } : currentCard
            );
            onCardsChange?.(next);
          };

          return (
            <Fragment key={card.id}>
              <CardCanvasItem
                card={card}
                cards={cards}
                cardsRef={cardsRef}
                onCardsChangeRef={onCardsChangeRef}
                isSelected={selected?.includes(card.id) ?? false}
                onSelect={onSelect}
                options={normalizedOptions}
                renderCardTitle={renderCardTitle}
                renderCardContent={renderCardContent}
                isParentCandidate={parentCandidateId === card.id}
                setParentCandidateId={setParentCandidateId}
                linkMode={linkMode}
                onLinkClick={onLinkClick}
                onDraggingChange={(isDragging) =>
                  setMovingCardId(isDragging ? card.id : undefined)
                }
                isLinkSource={linkDragInfo?.sourceCardId === card.id}
                isLinkTarget={linkDragInfo?.targetCardId === card.id}
                onLinkDragStart={(sourceCardId) => {
                  // 初始化连线拖拽状态，圆圈起始位置取源头卡片中心
                  const sourceCard = cards.find((c) => c.id === sourceCardId);
                  setLinkDragInfo({
                    sourceCardId,
                    point: {
                      x: sourceCard ? sourceCard.x + sourceCard.width / 2 : 0,
                      y: sourceCard ? sourceCard.y + sourceCard.height / 2 : 0,
                    },
                    targetCardId: undefined,
                  });
                }}
                onLinkDragMove={(point, targetCardId) => {
                  setLinkDragInfo((prev) =>
                    prev === null ? prev : { ...prev, point, targetCardId }
                  );
                }}
                onLinkDragEnd={() => setLinkDragInfo(null)}
              />
              {showPopover && (
                <div
                  className="cards-card-canvas__popover"
                  style={{
                    left: card.x,
                    top: card.y + card.height + 8,
                    zIndex: (card.zIndex ?? 0) + 1,
                  }}
                >
                  {renderPopover(card, setCard)}
                </div>
              )}
            </Fragment>
          );
        })}
        {children}
        {/* 连线拖拽 overlay：圆圈指示器 + 虚线连线 */}
        {linkDragInfo !== null &&
          (() => {
            const sourceCard = cards.find(
              (c) => c.id === linkDragInfo.sourceCardId
            );
            if (!sourceCard) return null;

            const sourceCenterX = sourceCard.x + sourceCard.width / 2;
            const sourceCenterY = sourceCard.y + sourceCard.height / 2;
            const hasTarget = linkDragInfo.targetCardId !== undefined;

            return (
              <>
                {/* SVG 覆盖层：从源头卡片中心到指针位置的虚线 */}
                <svg className="cards-card-canvas__link-drag-overlay" aria-hidden="true">
                  <line
                    className={`cards-card-canvas__link-drag-line${
                      hasTarget
                        ? ' cards-card-canvas__link-drag-line--active'
                        : ''
                    }`}
                    x1={sourceCenterX}
                    y1={sourceCenterY}
                    x2={linkDragInfo.point.x}
                    y2={linkDragInfo.point.y}
                  />
                </svg>
                {/* 圆圈指示器：跟随光标移动 */}
                <div
                  className="cards-card-canvas__link-drag-circle"
                  style={{
                    left: `${linkDragInfo.point.x - 20}px`,
                    top: `${linkDragInfo.point.y - 20}px`,
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                </div>
              </>
            );
          })()}
      </div>
    </div>
  );
}
