import { useState } from 'react';
import { Button, CardCanvas, deleteCards } from '../index';
import type { CardCanvasCard } from '../index';

export function Demo() {
  const [cards, setCards] = useState<CardCanvasCard[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [selectEventCount, setSelectEventCount] = useState(0);
  const [newCardTitle, setNewCardTitle] = useState('');
  const [newCardContent, setNewCardContent] = useState('');
  const [newCardTitleBg, setNewCardTitleBg] = useState('#f9fafb');
  const [newCardContentBg, setNewCardContentBg] = useState('#ffffff');
  const [newCardParent, setNewCardParent] = useState('');
  const [requireSelectionToMoveResize, setRequireSelectionToMoveResize] = useState(false);
  const [selectOnMoveEnd, setSelectOnMoveEnd] = useState(false);

  const handleAddCard = () => {
    if (!newCardTitle.trim() || !newCardContent.trim()) return;

    const nextIndex = cards.length + 1;
    const newCard: CardCanvasCard = {
      id: `card-${nextIndex}`,
      title: newCardTitle,
      content: newCardContent,
      x: 0,
      y: 0,
      width: 180,
      height: 120,
      zIndex: nextIndex,
      titleStyle: { backgroundColor: newCardTitleBg },
      contentStyle: { backgroundColor: newCardContentBg },
    };

    if (newCardParent.trim()) {
      newCard.parent = newCardParent.trim();
    }

    setCards([...cards, newCard]);
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

  const handleDeleteSelected = async () => {
    if (selected.length === 0) return;

    const newCards = await deleteCards(cards, selected, async (_cards, _deleteIds, meta) => {
      if (meta.hasChildren) {
        return window.confirm("Delete this card and its child cards?");
      }
      return true;
    });

    setCards(newCards);
    setSelected((prev) => prev.filter((id) => newCards.some((card) => card.id === id)));
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
                  onChange={(e) => setRequireSelectionToMoveResize(e.target.checked)}
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
                renderCardTitle={(title: string) => <span data-card-rendered-title>{title}</span>}
                renderCardContent={(content: string) => <span data-card-rendered-content>{content}</span>}
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
