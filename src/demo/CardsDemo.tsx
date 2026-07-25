import {
  Button as ComponentsButton,
  Dialog,
  confirm,
} from '@hamster-note/components';
import { useEffect, useState } from 'react';
import {
  Button,
  CardCanvas,
  CardComments,
  type CardCanvasCard,
  type CardsTheme,
  deleteCards,
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
  const [commentingCardId, setCommentingCardId] = useState<string>();
  const [editable, setEditable] = useState(false);
  const [virtualPaper, setVirtualPaper] = useState(false);
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
    setCommentingCardId(undefined);
    setSelectEventCount((count) => count + 1);
  };

  const handleClearSelection = () => {
    setSelected([]);
    setCommentingCardId(undefined);
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

  const handleDeleteCards = async (deleteIds: readonly string[]) => {
    const newCards = await deleteCards(
      cards,
      deleteIds,
      async (_cards, _deleteIds, meta) =>
        confirm({
          title: 'Delete card?',
          description: meta.hasChildren
            ? 'Delete this card and its child cards? This action cannot be undone.'
            : 'This action cannot be undone.',
          confirmText: 'Delete',
          cancelText: 'Cancel',
          tone: 'danger',
        })
    );

    if (newCards === cards) return;

    setCards(normalizeMindMapLayout(newCards));
    setSelected((prev) =>
      prev.filter((id) => newCards.some((card) => card.id === id))
    );
    setCommentingCardId((cardId) =>
      cardId !== undefined && newCards.some((card) => card.id === cardId)
        ? cardId
        : undefined
    );
  };

  const commentingCard =
    commentingCardId === undefined
      ? undefined
      : cards.find((card) => card.id === commentingCardId);

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
              onClick={() => handleDeleteCards(selected)}
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
                  data-card-editable-toggle
                  checked={editable}
                  onChange={(event) => setEditable(event.target.checked)}
                />
                Edit cards directly
              </label>
            </div>
            <div className="demo__form-group demo__form-group--checkbox">
              <label>
                <input
                  type="checkbox"
                  data-card-virtual-paper-toggle
                  checked={virtualPaper}
                  onChange={(event) => setVirtualPaper(event.target.checked)}
                />
                Enable virtual paper
              </label>
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
                editable={editable}
                virtualPaper={virtualPaper}
                theme={theme}
                {...(linkCallbackEnabled
                  ? { onLinkClick: handleLinkClick }
                  : {})}
                {...(!editable
                  ? {
                      renderCardTitle: (title: string) => (
                        <span data-card-rendered-title>{title}</span>
                      ),
                      renderCardContent: (content: string) => (
                        <span data-card-rendered-content>{content}</span>
                      ),
                    }
                  : {})}
                onCommentCard={(card) => setCommentingCardId(card.id)}
                renderPopover={(card) => (
                  <>
                    <ComponentsButton
                      data-card-popover-delete-button
                      size="small"
                      variant="ghost"
                      onClick={() => handleDeleteCards([card.id])}
                    >
                      Delete
                    </ComponentsButton>
                  </>
                )}
              />
              <Dialog
                onClose={() => setCommentingCardId(undefined)}
                open={commentingCard !== undefined}
                title="评论详情"
              >
                {commentingCard === undefined ? null : (
                  <CardComments
                    comments={commentingCard.comments ?? []}
                    onCommentsChange={(comments) =>
                      setCards((currentCards) =>
                        currentCards.map((card) =>
                          card.id === commentingCard.id
                            ? { ...card, comments }
                            : card
                        )
                      )
                    }
                  />
                )}
              </Dialog>
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
