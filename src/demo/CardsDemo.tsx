import { useEffect, useState } from 'react';
import { Button, CardCanvas, deleteCards } from '../index';
import type { CardCanvasCard, CardChildrenLayoutMode } from '../index';
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
  const [newCardTitleBg, setNewCardTitleBg] = useState('#f9fafb');
  const [newCardContentBg, setNewCardContentBg] = useState('#ffffff');
  const [newCardParent, setNewCardParent] = useState('');
  const [requireSelectionToMoveResize, setRequireSelectionToMoveResize] =
    useState(false);
  const [selectOnMoveEnd, setSelectOnMoveEnd] = useState(false);
  const [selectNewCardOnAdd, setSelectNewCardOnAdd] = useState(true);
  const [linkMode, setLinkMode] = useState(false);
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
      titleStyle: { backgroundColor: newCardTitleBg },
      contentStyle: { backgroundColor: newCardContentBg },
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
    <main className="demo">
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
              onClick={handleAddCard}
            >
              Add Card
            </Button>
            <Button
              data-testid="delete-selected-card"
              variant="filled"
              size="md"
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
                value={newCardTitleBg}
                onChange={(e) => setNewCardTitleBg(e.target.value)}
              />
            </div>
            <div className="demo__form-group">
              <label htmlFor="card-content-bg">Content Background</label>
              <input
                id="card-content-bg"
                data-card-content-bg-input
                type="color"
                value={newCardContentBg}
                onChange={(e) => setNewCardContentBg(e.target.value)}
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
                  const currentLayoutMode: CardChildrenLayoutMode =
                    card.childrenLayoutMode ?? 'free';
                  return (
                    <div
                      className="card-canvas-demo-popover-content"
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        padding: 12,
                        backgroundColor: '#ffffff',
                        border: '1px solid rgba(0,0,0,0.12)',
                        borderRadius: 8,
                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                        minWidth: 160,
                      }}
                    >
                      <span style={{ fontSize: 12, color: '#6b7280' }}>
                        标题
                      </span>
                      <input
                        value={card.title}
                        onChange={(e) => set({ title: e.target.value })}
                        style={{
                          padding: '4px 8px',
                          border: '1px solid #d1d5db',
                          borderRadius: 4,
                        }}
                      />
                      <span style={{ fontSize: 12, color: '#6b7280' }}>
                        内容
                      </span>
                      <input
                        value={card.content}
                        onChange={(e) => set({ content: e.target.value })}
                        style={{
                          padding: '4px 8px',
                          border: '1px solid #d1d5db',
                          borderRadius: 4,
                        }}
                      />
                      <span style={{ fontSize: 12, color: '#6b7280' }}>
                        子卡布局
                      </span>
                      <select
                        data-card-children-layout-mode-select
                        value={currentLayoutMode}
                        onChange={(event) => {
                          const nextMode: CardChildrenLayoutMode =
                            event.target.value === 'mind-map-horizontal'
                              ? 'mind-map-horizontal'
                              : 'free';
                          set({ childrenLayoutMode: nextMode });
                        }}
                        style={{
                          padding: '4px 8px',
                          border: '1px solid #d1d5db',
                          borderRadius: 4,
                        }}
                      >
                        <option value="free">Free</option>
                        <option value="mind-map-horizontal">
                          Mind-map horizontal
                        </option>
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
