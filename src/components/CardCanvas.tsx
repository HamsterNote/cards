import {
  Button,
  Icon,
  Menu,
  MenuItem,
  MenuSubmenu,
  Popover,
  ThemeProvider,
} from '@hamster-note/components';
// 共享组件库样式：提供 .hn-popover 浮层外观（背景/边框/阴影/主题变量）。
// 样式会被打进本库的 dist/cards.css，使用方无需再单独引入。
import '@hamster-note/components/styles.css';
import {
  type CSSProperties,
  Fragment,
  forwardRef,
  type ReactNode,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  type CardsTheme,
  type CardsThemeAccent,
  getThemeAccentStyle,
} from '../theme';
import type { CardContentBlock } from '../types/card-content';
import {
  createParagraphBlocksFromText,
  extractPlainTextFromBlocks,
} from '../utils/card-content-blocks';
import {
  getMindMapLayoutMode,
  MIND_MAP_HORIZONTAL_GAP,
  normalizeMindMapLayout,
  shouldNormalizeMindMapAfterCardUpdate,
} from '../utils/card-layout';
import { mergeCardPatch } from '../utils/card-patch';
import { isCardCanvasInteractivePointerTarget } from '../utils/card-popover-interactions';
import './CardCanvas.css';
import { CardCanvasItem } from './CardCanvasItem';
import {
  CardCanvasMiniMap,
  type CardCanvasMiniMapOptions,
} from './CardCanvasMiniMap';
import { CardCanvasToolbar } from './CardCanvasToolbar';
import {
  type CardCanvasViewport,
  CardCanvasVirtualPaper,
  type CardCanvasVirtualPaperOptions,
} from './CardCanvasVirtualPaper';
import type { CardComment } from './CardComments';
import { CardContentDialog } from './CardContentDialog';
import { CardLinkConnectors } from './CardLinkConnectors';
import type { CardCanvasHandle } from './ExternalCardDrag';
import { ExternalCardPreview } from './ExternalCardPreview';
import { useExternalCardDragSessions } from './useExternalCardDragSessions';

// 子卡布局模式：
// - 'free'：自由放置，子卡片可在任意位置
// - 'mind-map-horizontal'：导图横向布局，子卡片在父卡右侧垂直居中排列
// - 'arrange'：排列布局，子卡片在父卡内容区内从左到右、从上到下流式排列
export type CardChildrenLayoutMode = 'free' | 'mind-map-horizontal' | 'arrange';

/** 卡片颜色选择项；宿主可通过 colorOptions 替换默认浅色调色板。 */
export interface CardCanvasColorOption {
  readonly name: string;
  readonly value: string;
}

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
  /** 隐藏标题栏、仅展示正文的 headless 卡片形态。 */
  headless?: boolean;
  /**
   * 富文本内容块。提供后卡片内容区会用内置富文本视图渲染，
   * 并在正文 Dialog 中作为编辑真相源。
   */
  contentBlocks?: readonly CardContentBlock[];
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
  /** 卡片主题色：标题直接使用，正文按 light/dark 主题派生浅色或深色背景 */
  themeColor?: string;
  /** 卡片 Z 轴层级 */
  zIndex?: number;
  childrenLayoutMode?: CardChildrenLayoutMode;
  /** 该卡片链接的目标卡片 id 列表（link-mode 专用） */
  linkedCardIds?: readonly string[];
  /** 卡片关联的线程评论 */
  comments?: readonly CardComment[];
  /** 锁定后卡片不可移动、缩放或删除 */
  lock?: boolean;
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
  /** 请求宿主新增卡片；底部工具栏应与宿主的其他新增入口复用同一业务逻辑。 */
  onAddCard?: () => void;
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
  /** 选中卡片 Popover 中显示的颜色选项；传入空数组可隐藏颜色选择。 */
  colorOptions?: readonly CardCanvasColorOption[];
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
  /** 连线模式变化回调；与 linkMode 一起传入时用于受控模式。 */
  onLinkModeChange?: (enabled: boolean) => void;
  /** 主题：light（默认）或 dark */
  theme?: CardsTheme;
  /** 共享组件的 accent 主题色；支持组件库预设名或任意 CSS 颜色。 */
  themeColor?: CardsThemeAccent;
  /** 连线模式下，点击目标卡片时的回调 */
  onLinkClick?: (
    targetCard: CardCanvasCard,
    sourceCard: CardCanvasCard
  ) => void;
  /**
   * 是否启用卡片编辑。默认 true。
   * 开启后：
   * - 标题在卡片上直接编辑（纯文本，Enter 提交 / Escape 还原）；
   * - 内容在卡片上只读，通过选中 Popover 的编辑按钮打开 Dialog 修改；
   * - 选中 Popover 提供 headless 与子卡布局选项。
   */
  editable?: boolean;
  /**
   * 是否启用虚拟纸张平移/缩放。默认 false 以保持既有画布行为；
   * 传入配置对象时默认启用，可用 enabled: false 关闭。
   */
  virtualPaper?: boolean | CardCanvasVirtualPaperOptions;
  /** MiniMap 配置。默认关闭，且仅在 virtual paper 启用时生效。 */
  minimap?: false | CardCanvasMiniMapOptions;
  /** MiniMap 显隐变化回调；与 minimap.enabled 一起传入时用于受控模式。 */
  onMiniMapChange?: (enabled: boolean) => void;
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

const DEFAULT_VIEWPORT: CardCanvasViewport = { scale: 1, x: 0, y: 0 };
const DEFAULT_MINIMAP_OPTIONS: CardCanvasMiniMapOptions = {};
const POPOVER_RESTORE_DEBOUNCE_MS = 160;
function isVirtualPaperEnabled(
  virtualPaper: boolean | CardCanvasVirtualPaperOptions | undefined
): boolean {
  if (virtualPaper === true) return true;
  if (virtualPaper === false || virtualPaper === undefined) return false;
  return virtualPaper.enabled !== false;
}

const DEFAULT_CARD_COLOR_OPTIONS: readonly CardCanvasColorOption[] = [
  { name: '蓝色', value: '#60a5fa' },
  { name: '紫色', value: '#a78bfa' },
  { name: '绿色', value: '#4ade80' },
  { name: '橙色', value: '#fb923c' },
  { name: '玫红', value: '#fb7185' },
];

export const CardCanvas = forwardRef<CardCanvasHandle, CardCanvasProps>(
  function CardCanvas(
    {
      cards,
      onCardsChange,
      onAddCard,
      className = '',
      children,
      selected,
      onSelect,
      onClearSelection,
      options = {},
      colorOptions = DEFAULT_CARD_COLOR_OPTIONS,
      renderCardTitle,
      renderCardContent,
      renderPopover,
      onCommentCard,
      linkMode: linkModeProp,
      onLinkModeChange,
      theme = 'light',
      themeColor = 'violet',
      onLinkClick,
      editable = true,
      virtualPaper,
      minimap,
      onMiniMapChange,
    }: CardCanvasProps,
    ref
  ) {
    const themeAccentStyle = getThemeAccentStyle(themeColor);
    const canAddCard = editable && onAddCard !== undefined;
    const canMutateLinks = editable && onCardsChange !== undefined;
    const [uncontrolledLinkMode, setUncontrolledLinkMode] = useState(false);
    const linkMode = linkModeProp ?? uncontrolledLinkMode;
    const [uncontrolledMiniMapEnabled, setUncontrolledMiniMapEnabled] =
      useState<boolean>();
    // 当前正在被拖拽的卡片 id（仅有一张卡片在拖拽时才有值），用于隐藏 Popover
    const [movingCardId, setMovingCardId] = useState<string | undefined>();
    // 连线拖拽实时状态：拖拽期间存储源头卡片、指针位置、目标卡片
    const [linkDragInfo, setLinkDragInfo] = useState<LinkDragInfo | null>(null);
    const [contentEditorCardId, setContentEditorCardId] = useState<
      string | undefined
    >();
    // 锚定模式的 Popover 由组件库通过 Portal 挂到 body；用状态保留卡片 DOM 引用以触发定位浮层渲染。
    const [popoverAnchors, setPopoverAnchors] = useState<
      ReadonlyMap<string, HTMLDivElement>
    >(new Map());
    const [viewport, setViewport] = useState(DEFAULT_VIEWPORT);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const externalPlacementCardIdsRef = useRef(new Set<string>());
    const virtualPaperEnabled = isVirtualPaperEnabled(virtualPaper);
    const minimapOptions =
      minimap === undefined || minimap === false ? undefined : minimap;
    const minimapRequested =
      minimapOptions?.enabled ??
      uncontrolledMiniMapEnabled ??
      minimapOptions !== undefined;
    const minimapEnabled =
      virtualPaperEnabled && minimap !== false && minimapRequested;
    const minimapToggleEnabled = virtualPaperEnabled && minimap !== false;
    const [popoverVisible, setPopoverVisible] = useState(true);
    const popoverRestoreTimeoutRef = useRef<number | undefined>(undefined);
    const previousCardIdsRef = useRef<ReadonlySet<string>>(
      new Set(cards.map((card) => card.id))
    );
    const [newCardId, setNewCardId] = useState<string>();

    useEffect(() => {
      const previousCardIds = previousCardIdsRef.current;
      const addedCard = cards.find((card) => !previousCardIds.has(card.id));
      previousCardIdsRef.current = new Set(cards.map((card) => card.id));
      if (
        addedCard !== undefined &&
        externalPlacementCardIdsRef.current.delete(addedCard.id)
      ) {
        setNewCardId(undefined);
        return;
      }
      setNewCardId(addedCard?.id);
    }, [cards]);

    const handleLinkModeChange = useCallback(
      (enabled: boolean) => {
        if (linkModeProp === undefined) {
          setUncontrolledLinkMode(enabled);
        }
        onLinkModeChange?.(enabled);
      },
      [linkModeProp, onLinkModeChange]
    );

    const handleMiniMapChange = useCallback(
      (enabled: boolean) => {
        if (minimapOptions?.enabled === undefined) {
          setUncontrolledMiniMapEnabled(enabled);
        }
        onMiniMapChange?.(enabled);
      },
      [minimapOptions?.enabled, onMiniMapChange]
    );

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

    const normalizedOptions: Required<CardCanvasOptions> = {
      requireSelectionToMoveResize:
        options.requireSelectionToMoveResize ?? false,
      selectOnMoveEnd: options.selectOnMoveEnd ?? false,
    };

    const onCardsChangeRef = useRef(onCardsChange);
    const cardsRef = useRef(cards);
    useLayoutEffect(() => {
      onCardsChangeRef.current = onCardsChange;
    }, [onCardsChange]);
    useLayoutEffect(() => {
      cardsRef.current = cards;
    }, [cards]);

    const commitCards = useCallback((nextCards: CardCanvasCard[]) => {
      cardsRef.current = nextCards;
      onCardsChangeRef.current?.(nextCards);
    }, []);
    const getCards = useCallback(() => cardsRef.current, []);
    const markExternalPlacement = useCallback(
      (cardId: string) => externalPlacementCardIdsRef.current.add(cardId),
      []
    );

    const {
      handle: externalCardDragHandle,
      parentCandidateIds,
      previews: externalPreviews,
      setCardDragParentCandidate,
    } = useExternalCardDragSessions({
      editable,
      getCards,
      commitCards,
      canCommit: onCardsChange !== undefined,
      onPlaced: markExternalPlacement,
      onSelect,
      scale: viewport.scale,
      wrapperRef,
      containerRef,
    });
    useImperativeHandle(ref, () => externalCardDragHandle, [
      externalCardDragHandle,
    ]);

    useEffect(() => {
      if (popoverAnchors.size === 0) return;

      // 锚点 Popover 监听 scroll 重新计算位置；画布 transform 本身不会触发该浏览器事件。
      window.dispatchEvent(new CustomEvent('scroll', { detail: viewport }));
    }, [popoverAnchors.size, viewport]);

    useEffect(
      () => () => {
        if (popoverRestoreTimeoutRef.current !== undefined) {
          window.clearTimeout(popoverRestoreTimeoutRef.current);
        }
      },
      []
    );

    const handleVirtualPaperInteraction = useCallback(() => {
      setPopoverVisible(false);
      if (popoverRestoreTimeoutRef.current !== undefined) {
        window.clearTimeout(popoverRestoreTimeoutRef.current);
      }
      popoverRestoreTimeoutRef.current = window.setTimeout(() => {
        popoverRestoreTimeoutRef.current = undefined;
        setPopoverVisible(true);
      }, POPOVER_RESTORE_DEBOUNCE_MS);
    }, []);

    useEffect(() => {
      const normalizedCards = normalizeMindMapLayout(cards);
      if (hasCardGeometryChanges(cards, normalizedCards)) {
        commitCards(normalizedCards);
      }
    }, [cards, commitCards]);

    // Ref to hold the latest onClearSelection to avoid stale closures in event listeners
    const onClearSelectionRef = useRef(onClearSelection);
    const handledBlankPointerEventsRef = useRef(new WeakSet<PointerEvent>());
    useEffect(() => {
      onClearSelectionRef.current = onClearSelection;
    }, [onClearSelection]);

    const clearSelectionAfterTitleCommit = useCallback(() => {
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLElement &&
        activeElement.matches('[data-card-title-edit]')
      ) {
        activeElement.blur();
        requestAnimationFrame(() => onClearSelectionRef.current?.());
        return;
      }
      onClearSelectionRef.current?.();
    }, []);

    // Install a pointerdown listener on document to clear selection when clicking outside cards
    useEffect(() => {
      // Only install when onClearSelection is provided and something is selected
      if (!onClearSelection || !selected || selected.length === 0) return;

      const handlePointerDown = (event: PointerEvent) => {
        if (handledBlankPointerEventsRef.current.has(event)) {
          return;
        }
        // 如果点击在所有卡片、Popover 及其关联 portal 浮层之外，才清空选择。
        if (!isCardCanvasInteractivePointerTarget(event)) {
          clearSelectionAfterTitleCommit();
        }
      };

      document.addEventListener('pointerdown', handlePointerDown);
      return () => {
        document.removeEventListener('pointerdown', handlePointerDown);
      };
    }, [clearSelectionAfterTitleCommit, onClearSelection, selected]);

    const handleSelectCard = useCallback(
      (cardId: string) => {
        setPopoverVisible(true);
        onSelect?.(cardId);
      },
      [onSelect]
    );

    const handlePatchCard = useCallback(
      (cardId: string, data: Partial<Omit<CardCanvasCard, 'id'>>) => {
        const currentCards = getCards();
        const currentCard = currentCards.find((card) => card.id === cardId);
        if (currentCard === undefined) {
          return;
        }

        const mergedCard = mergeCardPatch(currentCard, data);
        const next = currentCards.map((card) =>
          card.id === cardId ? mergedCard : card
        );
        const nextCards = shouldNormalizeMindMapAfterCardUpdate(
          currentCard,
          mergedCard,
          next
        )
          ? normalizeMindMapLayout(next)
          : next;
        commitCards(nextCards);
      },
      [commitCards, getCards]
    );

    const contentEditorCard = editable
      ? cards.find((card) => card.id === contentEditorCardId)
      : undefined;

    return (
      <ThemeProvider accent={themeColor} mode={theme}>
        <div
          ref={wrapperRef}
          className={`cards-card-canvas__wrapper ${className}`}
          data-card-canvas
          data-theme={theme}
          style={themeAccentStyle}
          onPointerDownCapture={(event) => {
            if (
              event.target instanceof Element &&
              event.target.closest('[data-card-virtual-paper="true"]') !==
                null &&
              !isCardCanvasInteractivePointerTarget(event.nativeEvent)
            ) {
              handledBlankPointerEventsRef.current.add(event.nativeEvent);
              clearSelectionAfterTitleCommit();
            }
          }}
        >
          <CardCanvasVirtualPaper
            virtualPaper={virtualPaper}
            viewport={viewport}
            onViewportChange={setViewport}
            onInteraction={handleVirtualPaperInteraction}
            containerStyle={{
              width: '100%',
              height: '100%',
              overflow: 'visible',
            }}
          >
            <div ref={containerRef} className="cards-card-canvas__container">
              <CardLinkConnectors
                cards={cards}
                getCards={getCards}
                theme={theme}
                themeColor={themeColor}
                {...(canMutateLinks ? { commitCards } : {})}
              />
              <svg className="cards-card-canvas__connectors" aria-hidden="true">
                {cards.map((childCard) => {
                  if (!childCard.parent) return null;
                  const parentCard = cards.find(
                    (c) => c.id === childCard.parent
                  );
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
                  popoverVisible &&
                  contentEditorCard === undefined &&
                  (editable ||
                    colorOptions.length > 0 ||
                    renderPopover !== undefined ||
                    onCommentCard !== undefined) &&
                  (selected?.includes(card.id) ?? false) &&
                  !movingCardId;
                const popoverAnchor = popoverAnchors.get(card.id);

                // set 回调：将部分数据合并到当前卡片，并触发 onCardsChange
                const setCard = (data: Partial<Omit<CardCanvasCard, 'id'>>) =>
                  handlePatchCard(card.id, data);

                return (
                  <Fragment key={card.id}>
                    <CardCanvasItem
                      card={card}
                      cards={cards}
                      getCards={getCards}
                      commitCards={canMutateLinks ? commitCards : undefined}
                      viewportScale={viewport.scale}
                      isSelected={selected?.includes(card.id) ?? false}
                      onSelect={handleSelectCard}
                      onEditContent={
                        editable
                          ? (cardId) => setContentEditorCardId(cardId)
                          : undefined
                      }
                      options={normalizedOptions}
                      renderCardTitle={renderCardTitle}
                      renderCardContent={renderCardContent}
                      isParentCandidate={parentCandidateIds.has(card.id)}
                      setParentCandidateId={setCardDragParentCandidate}
                      linkMode={linkMode}
                      onLinkClick={onLinkClick}
                      editable={editable}
                      focusTitle={
                        card.id === newCardId &&
                        (selected?.includes(card.id) ?? false)
                      }
                      theme={theme}
                      onPatchCard={setCard}
                      onPopoverAnchorChange={setPopoverAnchor}
                      onDraggingChange={(isDragging) => {
                        setMovingCardId(isDragging ? card.id : undefined);
                      }}
                      isLinkSource={linkDragInfo?.sourceCardId === card.id}
                      isLinkTarget={linkDragInfo?.targetCardId === card.id}
                      onLinkDragStart={(sourceCardId) => {
                        // 初始化连线拖拽状态，圆圈起始位置取源头卡片中心
                        const sourceCard = cards.find(
                          (c) => c.id === sourceCardId
                        );
                        setLinkDragInfo({
                          sourceCardId,
                          point: {
                            x: sourceCard
                              ? sourceCard.x + sourceCard.width / 2
                              : 0,
                            y: sourceCard
                              ? sourceCard.y + sourceCard.height / 2
                              : 0,
                          },
                          targetCardId: undefined,
                        });
                      }}
                      onLinkDragMove={(point, targetCardId) => {
                        setLinkDragInfo((prev) =>
                          prev === null
                            ? prev
                            : { ...prev, point, targetCardId }
                        );
                      }}
                      onLinkDragEnd={(linked) => {
                        setLinkDragInfo(null);
                        if (linked) handleLinkModeChange(false);
                      }}
                    />
                    {showPopover && popoverAnchor !== undefined && (
                      // 共享组件的锚定模式会通过 Portal 挂到 body，避免被画布外层裁剪。
                      <Popover
                        anchor={popoverAnchor}
                        anchorOffset={8}
                        className="cards-card-canvas__popover"
                        placement="top-start"
                        style={themeAccentStyle}
                        theme={theme}
                      >
                        <ThemeProvider accent={themeColor} mode={theme}>
                          {colorOptions.length > 0 ? (
                            <fieldset
                              className="cards-card-canvas__color-options"
                              aria-label="卡片颜色"
                              data-card-color-options
                            >
                              {colorOptions.map((colorOption) => {
                                const isActive =
                                  card.themeColor?.toLowerCase() ===
                                  colorOption.value.toLowerCase();
                                return (
                                  <button
                                    key={`${colorOption.name}-${colorOption.value}`}
                                    type="button"
                                    className="cards-card-canvas__color-option"
                                    data-card-color-option={colorOption.value}
                                    aria-label={colorOption.name}
                                    aria-pressed={isActive}
                                    title={colorOption.name}
                                    style={{
                                      backgroundColor: colorOption.value,
                                    }}
                                    onClick={() =>
                                      setCard({ themeColor: colorOption.value })
                                    }
                                  >
                                    <span className="cards-card-canvas__color-option-mark" />
                                  </button>
                                );
                              })}
                            </fieldset>
                          ) : null}
                          {editable ? (
                            <>
                              <Button
                                data-card-headless-toggle
                                size="small"
                                variant="ghost"
                                aria-label={
                                  card.headless === true
                                    ? '显示标题栏'
                                    : '隐藏标题栏'
                                }
                                aria-pressed={card.headless === true}
                                onClick={() => {
                                  const nextHeadless = card.headless !== true;
                                  const contentBlocksContainOnlyText =
                                    card.contentBlocks?.every(
                                      (block) =>
                                        'text' in block &&
                                        typeof block.text === 'string'
                                    ) ?? true;
                                  const contentBlocksAreBlank =
                                    card.contentBlocks === undefined ||
                                    card.contentBlocks.length === 0 ||
                                    (contentBlocksContainOnlyText &&
                                      extractPlainTextFromBlocks(
                                        card.contentBlocks
                                      ).trim() === '');
                                  setCard(
                                    nextHeadless &&
                                      card.content.trim() === '' &&
                                      contentBlocksAreBlank
                                      ? {
                                          headless: true,
                                          content: card.title,
                                          ...(card.contentBlocks === undefined
                                            ? {}
                                            : {
                                                contentBlocks:
                                                  createParagraphBlocksFromText(
                                                    card.id,
                                                    card.title
                                                  ),
                                              }),
                                        }
                                      : { headless: nextHeadless }
                                  );
                                }}
                              >
                                <Icon name="type" />
                                <span className="cards-card-canvas__action-label">
                                  {card.headless === true
                                    ? '显示标题栏'
                                    : '隐藏标题栏'}
                                </span>
                              </Button>
                              <Button
                                data-card-content-edit-button
                                size="small"
                                variant="ghost"
                                aria-label="编辑内容"
                                onClick={() => setContentEditorCardId(card.id)}
                              >
                                <Icon name="edit" />
                                <span className="cards-card-canvas__action-label">
                                  编辑内容
                                </span>
                              </Button>
                              <Menu
                                aria-label="卡片操作"
                                className="cards-card-canvas__popover-menu"
                              >
                                <MenuSubmenu
                                  aria-label="子卡布局"
                                  panelTheme={theme}
                                  label={
                                    <>
                                      <Icon name="sort" />
                                      <span className="cards-card-canvas__action-label">
                                        子卡布局
                                      </span>
                                    </>
                                  }
                                  data-card-children-layout-button
                                >
                                  {CHILDREN_LAYOUT_MODES.map((mode) => {
                                    const isActive =
                                      getMindMapLayoutMode(card) === mode;
                                    return (
                                      <MenuItem
                                        key={mode}
                                        data-card-children-layout-mode-option={
                                          mode
                                        }
                                        data-active={
                                          isActive ? 'true' : undefined
                                        }
                                        shortcut={
                                          isActive ? (
                                            <Icon name="check" />
                                          ) : undefined
                                        }
                                        onClick={() =>
                                          setCard({ childrenLayoutMode: mode })
                                        }
                                      >
                                        {CHILDREN_LAYOUT_MODE_LABELS[mode]}
                                      </MenuItem>
                                    );
                                  })}
                                </MenuSubmenu>
                              </Menu>
                            </>
                          ) : null}
                          {onCommentCard === undefined ? null : (
                            <Button
                              data-card-comment-button
                              size="small"
                              variant="ghost"
                              aria-label={`评论 (${card.comments?.length ?? 0})`}
                              onClick={() => onCommentCard(card)}
                            >
                              <Icon name="comment" />
                              <span className="cards-card-canvas__action-label">
                                评论 ({card.comments?.length ?? 0})
                              </span>
                            </Button>
                          )}
                          {renderPopover?.(card, setCard)}
                        </ThemeProvider>
                      </Popover>
                    )}
                  </Fragment>
                );
              })}
              {Array.from(externalPreviews.entries()).map(
                ([cardId, preview]) => (
                  <ExternalCardPreview
                    key={cardId}
                    card={preview.card}
                    position={preview.position}
                    renderCardTitle={renderCardTitle}
                    renderCardContent={renderCardContent}
                    theme={theme}
                  />
                )
              )}
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
          {minimapEnabled ? (
            <CardCanvasMiniMap
              cards={cards}
              contentRef={containerRef}
              hostRef={wrapperRef}
              options={minimapOptions ?? DEFAULT_MINIMAP_OPTIONS}
              viewport={viewport}
              onInteraction={handleVirtualPaperInteraction}
              onViewportChange={setViewport}
            />
          ) : null}
          {editable && contentEditorCard === undefined ? (
            <CardCanvasToolbar
              addEnabled={canAddCard}
              linkMode={linkMode}
              linkModeEnabled={canMutateLinks}
              minimapEnabled={minimapEnabled}
              minimapToggleEnabled={minimapToggleEnabled}
              theme={theme}
              onAddCard={() => onAddCard?.()}
              onLinkModeChange={handleLinkModeChange}
              onMiniMapChange={handleMiniMapChange}
            />
          ) : null}
          {editable && contentEditorCard !== undefined ? (
            <CardContentDialog
              key={contentEditorCard.id}
              card={contentEditorCard}
              onClose={() => setContentEditorCardId(undefined)}
              onSave={(content) =>
                handlePatchCard(contentEditorCard.id, content)
              }
              theme={theme}
              themeColor={themeColor}
            />
          ) : null}
        </div>
      </ThemeProvider>
    );
  }
);
