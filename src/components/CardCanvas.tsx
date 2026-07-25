import {
  Button,
  Icon,
  Menu,
  MenuItem,
  MenuLabel,
  Popover,
} from '@hamster-note/components';
// 共享组件库样式：提供 .hn-popover 浮层外观（背景/边框/阴影/主题变量）。
// 样式会被打进本库的 dist/cards.css，使用方无需再单独引入。
import '@hamster-note/components/styles.css';
import type { NoteBlock } from '@hamster-note/notes';
import {
  type CSSProperties,
  Fragment,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { CardsTheme } from '../theme';
import {
  getMindMapLayoutMode,
  MIND_MAP_HORIZONTAL_GAP,
  normalizeMindMapLayout,
  shouldNormalizeMindMapAfterCardUpdate,
} from '../utils/card-layout';
import { buildCardLinkPairs } from '../utils/card-links';
import { isCardCanvasInteractivePointerTarget } from '../utils/card-popover-interactions';
import './CardCanvas.css';
import { CardCanvasItem } from './CardCanvasItem';
import type { CardComment } from './CardComments';
import {
  CardCanvasVirtualPaper,
  type CardCanvasVirtualPaperOptions,
} from './CardCanvasVirtualPaper';

// 子卡布局模式：
// - 'free'：自由放置，子卡片可在任意位置
// - 'mind-map-horizontal'：导图横向布局，子卡片在父卡右侧垂直居中排列
// - 'arrange'：排列布局，子卡片在父卡内容区内从左到右、从上到下流式排列
export type CardChildrenLayoutMode = 'free' | 'mind-map-horizontal' | 'arrange';

/** 卡片数据模型 */
export interface CardCanvasCard {
  /** 唯一标识 */
  id: string;
  /** 父卡片 id；无父级时省略 */
  parent?: string;
  /** 卡片标题 */
  title: string;
  /** 卡片内容（纯文本；有 contentBlocks 时作为其纯文本镜像，供搜索/序列化使用） */
  content: string;
  /**
   * 富文本内容块（@hamster-note/notes 的 NoteBlock）。
   * 提供后卡片内容区默认改用 NoteContent 渲染；editable 时即为内联编辑的真相源。
   */
  contentBlocks?: readonly NoteBlock[];
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
  childrenLayoutMode?: CardChildrenLayoutMode;
  /** 该卡片链接的目标卡片 id 列表（link-mode 专用） */
  linkedCardIds?: readonly string[];
  /** 卡片关联的线程评论 */
  comments?: readonly CardComment[];
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
   * 当卡片被选中时渲染一个 Popover（浮层），锚定到卡片并挂载到 document.body。
   * 内容会被 @hamster-note/components 的 Popover 包裹（自带背景/边框/阴影与
   * light/dark 主题），因此这里只需渲染内部控件，无需再绘制浮层外壳。
   * 参数 1：卡片数据；参数 2：set 函数，接收 Partial<Omit<CardCanvasCard,'id'>>，
   *         会合并到对应卡片并触发 onCardsChange。
   * 返回 null/undefined 时不渲染。卡片正在被拖拽时不展示 Popover。
   */
  renderPopover?: (
    card: CardCanvasCard,
    set: (data: Partial<Omit<CardCanvasCard, 'id'>>) => void
  ) => ReactNode;
  /**
   * 卡片评论入口的公开事件。传入后，选中卡片的 Popover 会显示默认“评论”按钮。
   * CardCanvas 不持有评论窗口或评论数据；宿主可在回调中打开自己的 Dialog/Panel，
   * 并通过受控 cards 与 onCardsChange 持久化评论。
   */
  onCommentCard?: (card: CardCanvasCard) => void;
  /** 是否启用连线模式。默认 false。 */
  linkMode?: boolean;
  /** 主题：light（默认）或 dark */
  theme?: CardsTheme;
  /** 连线模式下，点击目标卡片时的回调 */
  onLinkClick?: (
    targetCard: CardCanvasCard,
    sourceCard: CardCanvasCard
  ) => void;
  /**
   * 是否启用卡片直接编辑。默认 false。
   * 开启后：
   * - 标题在卡片上直接编辑（纯文本，Enter 提交 / Escape 还原）；
   * - 内容用 @hamster-note/notes 的 NoteContent 内联编辑（contentBlocks 为真相源）；
   * - 卡片右上角显示"更多"菜单（子卡布局选项）。
   */
  editable?: boolean;
  /**
   * 是否启用虚拟纸张平移/缩放。默认 false 以保持既有画布行为；
   * 传入配置对象时默认启用，可用 enabled: false 关闭。
   */
  virtualPaper?: boolean | CardCanvasVirtualPaperOptions;
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

function hasCardGeometryChanges(
  currentCards: readonly CardCanvasCard[],
  nextCards: readonly CardCanvasCard[]
): boolean {
  if (currentCards.length !== nextCards.length) {
    return true;
  }

  return currentCards.some((card, index) => {
    const nextCard = nextCards[index];
    return (
      nextCard === undefined ||
      card.id !== nextCard.id ||
      card.x !== nextCard.x ||
      card.y !== nextCard.y ||
      card.width !== nextCard.width ||
      card.height !== nextCard.height
    );
  });
}

function mergeCardPatch(
  card: CardCanvasCard,
  data: Partial<Omit<CardCanvasCard, 'id'>>
): CardCanvasCard {
  return { ...card, ...data };
}

/** 子卡布局选项的展示文案（更多菜单用） */
const CHILDREN_LAYOUT_MODE_LABELS: Record<CardChildrenLayoutMode, string> = {
  free: 'Free',
  'mind-map-horizontal': 'Mind-map horizontal',
  arrange: 'Arrange',
};

const CHILDREN_LAYOUT_MODES: readonly CardChildrenLayoutMode[] = [
  'free',
  'mind-map-horizontal',
  'arrange',
];

const CARD_MENU_POPOVER_ID = 'cards-card-canvas-children-layout-menu';

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
  onCommentCard,
  linkMode: linkModeProp,
  theme = 'light',
  onLinkClick,
  editable = false,
  virtualPaper,
}: CardCanvasProps) {
  const linkMode = linkModeProp ?? false;
  const [parentCandidateId, setParentCandidateId] = useState<
    string | undefined
  >();
  // 当前正在被拖拽的卡片 id（仅有一张卡片在拖拽时才有值），用于隐藏 Popover
  const [movingCardId, setMovingCardId] = useState<string | undefined>();
  // 连线拖拽实时状态：拖拽期间存储源头卡片、指针位置、目标卡片
  const [linkDragInfo, setLinkDragInfo] = useState<LinkDragInfo | null>(null);
  // 当前打开"更多"菜单的卡片 id
  const [menuCardId, setMenuCardId] = useState<string | undefined>();
  // 锚定模式的 Popover 由组件库通过 Portal 挂到 body；用状态保留卡片 DOM 引用以触发定位浮层渲染。
  const [popoverAnchors, setPopoverAnchors] = useState<
    ReadonlyMap<string, HTMLDivElement>
  >(new Map());
  const [menuAnchors, setMenuAnchors] = useState<
    ReadonlyMap<string, HTMLButtonElement>
  >(new Map());
  const [viewportScale, setViewportScale] = useState(1);

  const setPopoverAnchor = useCallback(
    (cardId: string, anchor: HTMLDivElement | null) => {
      setPopoverAnchors((anchors) => {
        const currentAnchor = anchors.get(cardId);
        if (currentAnchor === anchor) return anchors;

        const nextAnchors = new Map(anchors);
        if (anchor === null) {
          nextAnchors.delete(cardId);
        } else {
          nextAnchors.set(cardId, anchor);
        }
        return nextAnchors;
      });
    },
    []
  );

  const setMenuAnchor = useCallback(
    (cardId: string, anchor: HTMLButtonElement | null) => {
      setMenuAnchors((anchors) => {
        const currentAnchor = anchors.get(cardId);
        if (currentAnchor === anchor) return anchors;

        const nextAnchors = new Map(anchors);
        if (anchor === null) {
          nextAnchors.delete(cardId);
        } else {
          nextAnchors.set(cardId, anchor);
        }
        return nextAnchors;
      });
    },
    []
  );

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

  useEffect(() => {
    const normalizedCards = normalizeMindMapLayout(cards);
    if (hasCardGeometryChanges(cards, normalizedCards)) {
      onCardsChangeRef.current?.(normalizedCards);
    }
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
      // 如果点击在所有卡片、Popover 及其关联 portal 浮层之外，才清空选择。
      if (!isCardCanvasInteractivePointerTarget(event)) {
        onClearSelectionRef.current?.();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [onClearSelection, selected]);

  // 更多菜单打开时，点击菜单按钮/菜单浮层之外的位置关闭菜单
  useEffect(() => {
    if (menuCardId === undefined) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof HTMLElement &&
        event.target.closest(
          '[data-card-menu-button], [data-card-menu-popover]'
        )
      ) {
        return;
      }
      setMenuCardId(undefined);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [menuCardId]);

  const linkPairs = useMemo(() => buildCardLinkPairs(cards), [cards]);

  return (
    <div
      className={`cards-card-canvas__wrapper ${className}`}
      data-theme={theme}
    >
      <CardCanvasVirtualPaper
        virtualPaper={virtualPaper}
        onScaleChange={setViewportScale}
        containerStyle={{ width: '100%', height: '100%', overflow: 'visible' }}
      >
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
            {cards.map((childCard) => {
              if (!childCard.parent) return null;
              const parentCard = cards.find((c) => c.id === childCard.parent);
              if (
                !parentCard ||
                getMindMapLayoutMode(parentCard) !== 'mind-map-horizontal'
              )
                return null;

              const parentRightX = parentCard.x + parentCard.width;
              const parentCenterY = parentCard.y + parentCard.height / 2;
              const childCenterY = childCard.y + childCard.height / 2;
              const childLeftX = childCard.x;
              const midX = parentRightX + MIND_MAP_HORIZONTAL_GAP / 2;

              const d = `M ${parentRightX} ${parentCenterY} L ${midX} ${parentCenterY} L ${midX} ${childCenterY} L ${childLeftX} ${childCenterY}`;

              return (
                <path
                  key={`pc-${parentCard.id}-${childCard.id}`}
                  data-parent-child-connector
                  className="cards-card-canvas__parent-child-connector"
                  d={d}
                />
              );
            })}
          </svg>
          {cards.map((card) => {
            const showPopover =
              (renderPopover !== undefined || onCommentCard !== undefined) &&
              (selected?.includes(card.id) ?? false) &&
              !movingCardId;
            const popoverAnchor = popoverAnchors.get(card.id);
            const menuAnchor = menuAnchors.get(card.id);

            // set 回调：将部分数据合并到当前卡片，并触发 onCardsChange
            const setCard = (data: Partial<Omit<CardCanvasCard, 'id'>>) => {
              const mergedCard = mergeCardPatch(card, data);
              const next = cards.map((currentCard) =>
                currentCard.id === card.id ? mergedCard : currentCard
              );
              const nextCards = shouldNormalizeMindMapAfterCardUpdate(
                card,
                mergedCard,
                next
              )
                ? normalizeMindMapLayout(next)
                : next;
              onCardsChange?.(nextCards);
            };

            return (
              <Fragment key={card.id}>
                <CardCanvasItem
                  card={card}
                  cards={cards}
                  cardsRef={cardsRef}
                  onCardsChangeRef={onCardsChangeRef}
                  viewportScale={viewportScale}
                  isSelected={selected?.includes(card.id) ?? false}
                  onSelect={onSelect}
                  options={normalizedOptions}
                  renderCardTitle={renderCardTitle}
                  renderCardContent={renderCardContent}
                  isParentCandidate={parentCandidateId === card.id}
                  setParentCandidateId={setParentCandidateId}
                  linkMode={linkMode}
                  onLinkClick={onLinkClick}
                  editable={editable}
                  theme={theme}
                  onPatchCard={setCard}
                  isMenuOpen={menuCardId === card.id}
                  onToggleMenu={(open) =>
                    setMenuCardId(open ? card.id : undefined)
                  }
                  onMenuAnchorChange={setMenuAnchor}
                  onPopoverAnchorChange={setPopoverAnchor}
                  onDraggingChange={(isDragging) => {
                    setMovingCardId(isDragging ? card.id : undefined);
                    if (isDragging) setMenuCardId(undefined);
                  }}
                  isLinkSource={linkDragInfo?.sourceCardId === card.id}
                  isLinkTarget={linkDragInfo?.targetCardId === card.id}
                  onLinkDragStart={(sourceCardId) => {
                    // 初始化连线拖拽状态，圆圈起始位置取源头卡片中心
                    const sourceCard = cards.find((c) => c.id === sourceCardId);
                    setLinkDragInfo({
                      sourceCardId,
                      point: {
                        x: sourceCard ? sourceCard.x + sourceCard.width / 2 : 0,
                        y: sourceCard
                          ? sourceCard.y + sourceCard.height / 2
                          : 0,
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
                {showPopover && popoverAnchor !== undefined && (
                  // 共享组件的锚定模式会通过 Portal 挂到 body，避免被画布外层裁剪。
                  <Popover
                    anchor={popoverAnchor}
                    anchorOffset={8}
                    className="cards-card-canvas__popover"
                    theme={theme}
                  >
                    {onCommentCard === undefined ? null : (
                      <Button
                        data-card-comment-button
                        size="small"
                        variant="ghost"
                        onClick={() => onCommentCard(card)}
                      >
                        评论 ({card.comments?.length ?? 0})
                      </Button>
                    )}
                    {renderPopover?.(card, setCard)}
                  </Popover>
                )}
                {editable &&
                  menuCardId === card.id &&
                  menuAnchor !== undefined && (
                    // 菜单锚定到触发按钮，组件库会将其 Portal 到 body。
                    <Popover
                      anchor={menuAnchor}
                      anchorOffset={4}
                      placement="bottom-end"
                      id={CARD_MENU_POPOVER_ID}
                      className="cards-card-canvas__popover cards-card-canvas__card-menu-popover"
                      data-card-menu-popover
                      theme={theme}
                    >
                      <Menu
                        aria-label="子卡布局"
                        data-card-children-layout-mode-menu
                      >
                        <MenuLabel>子卡布局</MenuLabel>
                        {CHILDREN_LAYOUT_MODES.map((mode) => {
                          const isActive = getMindMapLayoutMode(card) === mode;
                          return (
                            <MenuItem
                              key={mode}
                              data-card-children-layout-mode-option={mode}
                              data-active={isActive ? 'true' : undefined}
                              shortcut={
                                isActive ? <Icon name="check" /> : undefined
                              }
                              onClick={() => {
                                setCard({ childrenLayoutMode: mode });
                                setMenuCardId(undefined);
                              }}
                            >
                              {CHILDREN_LAYOUT_MODE_LABELS[mode]}
                            </MenuItem>
                          );
                        })}
                      </Menu>
                    </Popover>
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
                  <svg
                    className="cards-card-canvas__link-drag-overlay"
                    aria-hidden="true"
                  >
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
      </CardCanvasVirtualPaper>
    </div>
  );
}
