import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { CardCanvasItem } from './CardCanvasItem';
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
}: CardCanvasProps) {
  const [parentCandidateId, setParentCandidateId] = useState<string | undefined>();

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

  return (
    <div className={`cards-card-canvas__wrapper ${className}`}>
      <div className="cards-card-canvas__container">
        {cards.map((card) => (
          <CardCanvasItem
            key={card.id}
            card={card}
            cardsRef={cardsRef}
            onCardsChangeRef={onCardsChangeRef}
            isSelected={selected?.includes(card.id) ?? false}
            onSelect={onSelect}
            options={normalizedOptions}
            renderCardTitle={renderCardTitle}
            renderCardContent={renderCardContent}
            isParentCandidate={parentCandidateId === card.id}
            setParentCandidateId={setParentCandidateId}
          />
        ))}
        {children}
      </div>
    </div>
  );
}
