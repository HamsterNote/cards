import { useEffect, useState } from 'react';
import { Button, CardCanvas, deleteCards } from '../index';
import type {
  CardCanvasCard,
  CardChildrenLayoutMode,
  CardsTheme,
} from '../index';
import { normalizeMindMapLayout } from '../utils/card-layout';

type LastLinkResult = {
  readonly sourceId: string;
  readonly sourceTitle: string;
  readonly targetId: string;
  readonly targetTitle: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isCardCanvasCard(value: unknown): value is CardCanvasCard {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.content === 'string' &&
    typeof value.x === 'number' &&
    typeof value.y === 'number' &&
    typeof value.width === 'number' &&
    typeof value.height === 'number'
  );
}

function isSetCardsEvent(
  event: Event
): event is CustomEvent<readonly CardCanvasCard[]> {
  return (
    event instanceof CustomEvent &&
    Array.isArray(event.detail) &&
    event.detail.every(isCardCanvasCard)
  );
}

export function Demo() {
  const [cards, setCards] = useState<CardCanvasCard[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [selectEventCount, setSelectEventCount] = useState(0);
  const [newCardTitle, setNewCardTitle] = useState('');
  const [newCardContent, setNewCardContent] = useState('');
  const [newCardTitleBgOverride, setNewCardTitleBgOverride] = useState<
    string | undefined
  >();
  const [newCardContentBgOverride, setNewCardContentBgOverride] = useState<
    string | undefined
  >();
  const [newCardParent, setNewCardParent] = useState('');
  const [requireSelectionToMoveResize, setRequireSelectionToMoveResize] =
    useState(false);
  const [selectOnMoveEnd, setSelectOnMoveEnd] = useState(false);
  const [selectNewCardOnAdd, setSelectNewCardOnAdd] = useState(true);
  const [linkMode, setLinkMode] = useState(false);
  const [theme, setTheme] = useState<CardsTheme>('light');
  const [linkCallbackEnabled, setLinkCallbackEnabled] = useState(true);
  const [lastLinkResult, setLastLinkResult] = useState<LastLinkResult | null>(
    null
  );

  useEffect(() => {
    const handleSetCards = (event: Event) => {
      if (isSetCardsEvent(event)) {
        setCards([...event.detail]);
      }
    };

    window.addEventListener('card-canvas-demo:set-cards', handleSetCards);
    return () => {
      window.removeEventListener('card-canvas-demo:set-cards', handleSetCards);
    };
  }, []);

  const handleAddCard = () => {
    if (!newCardTitle.trim() || !newCardContent.trim()) return;

    const nextIndex = cards.length + 1;
    const width = 180;
    const height = 120;
    const parentId = newCardParent.trim();
    const newCard: CardCanvasCard = {
      id: `card-${nextIndex}`,
      title: newCardTitle,
      content: newCardContent,
      x: -width / 2,
      y: -height / 2,
      width,
      height,
      zIndex: nextIndex,
      ...(newCardTitleBgOverride
        ? { titleStyle: { backgroundColor: newCardTitleBgOverride } }
        : {}),
      ...(newCardContentBgOverride
        ? { contentStyle: { backgroundColor: newCardContentBgOverride } }
        : {}),
      ...(parentId ? { parent: parentId } : {}),
    };

    setCards(normalizeMindMapLayout([...cards, newCard]));
    if (selectNewCardOnAdd) {
      setSelected([newCard.id]);
    }
    setNewCardTitle('');
    setNewCardContent('');
    setNewCardParent('');
  };

  const handleSelect = (id: string) => {
    setSelected([id]);
    setSelectEventCount((count) => count + 1);
  };

  const handleClearSelection = () => {
    setSelected([]);
  };

  const handleLinkClick = (
    targetCard: CardCanvasCard,
    sourceCard: CardCanvasCard
  ) => {
    setLastLinkResult({
      targetId: targetCard.id,
      targetTitle: targetCard.title,
      sourceId: sourceCard.id,
      sourceTitle: sourceCard.title,
    });
  };

  const handleDeleteSelected = async () => {
    if (selected.length === 0) return;

    const newCards = await deleteCards(
      cards,
      selected,
      async (_cards, _deleteIds, meta) => {
        if (meta.hasChildren) {
          return window.confirm('Delete this card and its child cards?');
        }
        return true;
      }
    );

    setCards(normalizeMindMapLayout(newCards));
    setSelected((prev) =>
      prev.filter((id) => newCards.some((card) => card.id === id))
    );
  };

  return (
    <main className="demo" data-theme={theme}>
      <header className="demo__header">
        <span className="demo__eyebrow">Component Library</span>
        <h1 className="demo__title">Cards</h1>
        <p className="demo__subtitle">React 19 + TypeScript 6 + Vite</p>
      </header>

      <section className="demo__section">
        <h2 className="demo__section-title">CardCanvas</h2>
        <div className="demo__row card-canvas-demo-layout">
          <div
            className="card-canvas-demo-settings"
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
          >
            <div className="demo__form-group">
              <label htmlFor="card-title">Title</label>
              <input
                id="card-title"
                data-card-title-input
                value={newCardTitle}
                onChange={(e) => setNewCardTitle(e.target.value)}
                placeholder="Card Title"
              />
            </div>
            <div className="demo__form-group">
              <label htmlFor="card-content">Content</label>
              <input
                id="card-content"
                data-card-content-input
                value={newCardContent}
                onChange={(e) => setNewCardContent(e.target.value)}
                placeholder="Card Content"
              />
            </div>
            <Button
              data-card-add-button
              variant="filled"
              size="md"
              theme={theme}
              onClick={handleAddCard}
            >
              Add Card
            </Button>
            <Button
              data-testid="delete-selected-card"
              variant="filled"
              size="md"
              theme={theme}
              disabled={selected.length === 0}
              onClick={handleDeleteSelected}
            >
              Delete Selected
            </Button>
            <div className="demo__form-group">
              <label htmlFor="card-title-bg">Title Background</label>
              <input
                id="card-title-bg"
                data-card-title-bg-input
                type="color"
                value={
                  newCardTitleBgOverride ??
                  (theme === 'dark' ? '#374151' : '#f9fafb')
                }
                onChange={(e) => setNewCardTitleBgOverride(e.target.value)}
              />
            </div>
            <div className="demo__form-group">
              <label htmlFor="card-content-bg">Content Background</label>
              <input
                id="card-content-bg"
                data-card-content-bg-input
                type="color"
                value={
                  newCardContentBgOverride ??
                  (theme === 'dark' ? '#1f2937' : '#ffffff')
                }
                onChange={(e) => setNewCardContentBgOverride(e.target.value)}
              />
            </div>
            <div className="demo__form-group">
              <label htmlFor="card-parent">Parent ID (optional)</label>
              <input
                id="card-parent"
                data-card-parent-input
                value={newCardParent}
                onChange={(e) => setNewCardParent(e.target.value)}
                placeholder="Parent ID"
              />
            </div>
            <div className="demo__form-group demo__form-group--checkbox">
              <label>
                <input
                  type="checkbox"
                  data-card-require-selection-toggle
                  checked={requireSelectionToMoveResize}
                  onChange={(e) =>
                    setRequireSelectionToMoveResize(e.target.checked)
                  }
                />
                Require selection before move/resize
              </label>
            </div>
            <div className="demo__form-group demo__form-group--checkbox">
              <label>
                <input
                  type="checkbox"
                  data-card-select-on-move-end-toggle
                  checked={selectOnMoveEnd}
                  onChange={(e) => setSelectOnMoveEnd(e.target.checked)}
                />
                Select moved card after drag
              </label>
            </div>
            <div className="demo__form-group demo__form-group--checkbox">
              <label>
                <input
                  type="checkbox"
                  data-card-select-new-card-toggle
                  checked={selectNewCardOnAdd}
                  onChange={(e) => setSelectNewCardOnAdd(e.target.checked)}
                />
                Select newly added card
              </label>
            </div>
            <div className="demo__form-group demo__form-group--checkbox">
              <label>
                <input
                  type="checkbox"
                  data-card-link-mode-toggle
                  checked={linkMode}
                  onChange={(e) => setLinkMode(e.target.checked)}
                />
                Link mode
              </label>
            </div>
            <div className="demo__form-group demo__form-group--checkbox">
              <label>
                <input
                  type="checkbox"
                  data-card-link-callback-enabled-toggle
                  checked={linkCallbackEnabled}
                  onChange={(e) => setLinkCallbackEnabled(e.target.checked)}
                />
                Enable link callback
              </label>
            </div>
            <div className="demo__form-group demo__form-group--checkbox">
              <label>
                <input
                  type="checkbox"
                  data-card-dark-theme-toggle
                  checked={theme === 'dark'}
                  onChange={(e) =>
                    setTheme(e.target.checked ? 'dark' : 'light')
                  }
                />
                Dark theme
              </label>
            </div>
            <div className="demo__data-display">
              <h3 className="demo__data-display-title">Last Link Result</h3>
              <div
                className="demo__data-display-content"
                data-card-link-callback-result
              >
                {lastLinkResult ? (
                  <>
                    <div data-card-link-source-id={lastLinkResult.sourceId}>
                      Source: {lastLinkResult.sourceTitle}
                    </div>
                    <div data-card-link-target-id={lastLinkResult.targetId}>
                      Target: {lastLinkResult.targetTitle}
                    </div>
                  </>
                ) : (
                  'None'
                )}
              </div>
            </div>
          </div>
          <div className="card-canvas-demo-stage">
            <div className="card-canvas-demo-stage-wrapper">
              <CardCanvas
                cards={cards}
                onCardsChange={setCards}
                selected={selected}
                onSelect={handleSelect}
                onClearSelection={handleClearSelection}
                className="card-canvas-demo-transform"
                options={{ requireSelectionToMoveResize, selectOnMoveEnd }}
                linkMode={linkMode}
                theme={theme}
                {...(linkCallbackEnabled
                  ? { onLinkClick: handleLinkClick }
                  : {})}
                renderCardTitle={(title: string) => (
                  <span data-card-rendered-title>{title}</span>
                )}
                renderCardContent={(content: string) => (
                  <span data-card-rendered-content>{content}</span>
                )}
                renderPopover={(card, set) => {
                  // 默认显示为 'arrange'（排列），与 getMindMapLayoutMode 保持一致
                  const currentLayoutMode: CardChildrenLayoutMode =
                    card.childrenLayoutMode ?? 'arrange';
                  const isDark = theme === 'dark';
                  const popoverBg = isDark ? '#1f2937' : '#ffffff';
                  const popoverBorder = isDark
                    ? '1px solid rgba(255,255,255,0.12)'
                    : '1px solid rgba(0,0,0,0.12)';
                  const popoverShadow = isDark
                    ? '0 4px 6px -1px rgba(0,0,0,0.4)'
                    : '0 4px 6px -1px rgba(0,0,0,0.1)';
                  const labelColor = isDark ? '#9ca3af' : '#6b7280';
                  const inputBorder = isDark
                    ? '1px solid rgba(255,255,255,0.12)'
                    : '1px solid #d1d5db';
                  const inputBg = isDark ? '#374151' : '#ffffff';
                  const inputColor = isDark ? '#e5e7eb' : '#0f0f0f';
                  return (
                    <div
                      className="card-canvas-demo-popover-content"
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        padding: 12,
                        backgroundColor: popoverBg,
                        border: popoverBorder,
                        borderRadius: 8,
                        boxShadow: popoverShadow,
                        minWidth: 160,
                      }}
                    >
                      <span style={{ fontSize: 12, color: labelColor }}>
                        标题
                      </span>
                      <input
                        value={card.title}
                        onChange={(e) => set({ title: e.target.value })}
                        style={{
                          padding: '4px 8px',
                          border: inputBorder,
                          borderRadius: 4,
                          backgroundColor: inputBg,
                          color: inputColor,
                        }}
                      />
                      <span style={{ fontSize: 12, color: labelColor }}>
                        内容
                      </span>
                      <input
                        value={card.content}
                        onChange={(e) => set({ content: e.target.value })}
                        style={{
                          padding: '4px 8px',
                          border: inputBorder,
                          borderRadius: 4,
                          backgroundColor: inputBg,
                          color: inputColor,
                        }}
                      />
                      <span style={{ fontSize: 12, color: labelColor }}>
                        子卡布局
                      </span>
                      <select
                        data-card-children-layout-mode-select
                        value={currentLayoutMode}
                        onChange={(event) => {
                          const nextMode: CardChildrenLayoutMode =
                            event.target.value === 'mind-map-horizontal'
                              ? 'mind-map-horizontal'
                              : event.target.value === 'arrange'
                                ? 'arrange'
                                : 'free';
                          set({ childrenLayoutMode: nextMode });
                        }}
                        style={{
                          padding: '4px 8px',
                          border: inputBorder,
                          borderRadius: 4,
                          backgroundColor: inputBg,
                          color: inputColor,
                        }}
                      >
                        <option value="free">Free</option>
                        <option value="mind-map-horizontal">
                          Mind-map horizontal
                        </option>
                        <option value="arrange">Arrange</option>
                      </select>
                    </div>
                  );
                }}
              />
            </div>
          </div>
        </div>
        <details className="demo__data-display" data-card-data-display open>
          <summary className="demo__data-display-title" data-card-data-toggle>
            Current Cards Data
          </summary>
          <pre className="demo__data-display-content" data-card-data-content>
            {JSON.stringify(cards, null, 2)}
          </pre>
        </details>
        <div className="demo__data-display" data-card-selection-display>
          <h3 className="demo__data-display-title">Selection</h3>
          <div className="demo__data-display-content">
            <div data-card-selected-display>{selected.join(', ')}</div>
            <div data-card-select-count>{selectEventCount}</div>
          </div>
        </div>
      </section>
    </main>
  );
}
