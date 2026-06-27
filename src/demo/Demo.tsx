import { useState } from 'react';
import { Button, CardCanvas } from '../index';
import type { CardCanvasCard } from '../index';

export function Demo() {
  const [cards, setCards] = useState<CardCanvasCard[]>([]);
  const [newCardTitle, setNewCardTitle] = useState('');
  const [newCardContent, setNewCardContent] = useState('');

  const handleAddCard = () => {
    if (!newCardTitle.trim() || !newCardContent.trim()) return;

    const newCard: CardCanvasCard = {
      id: Date.now().toString(36),
      title: newCardTitle,
      content: newCardContent,
      x: 0,
      y: 0,
      width: 180,
      height: 120,
    };

    setCards([...cards, newCard]);
    setNewCardTitle('');
    setNewCardContent('');
  };

  return (
    <main className="demo">
      <header className="demo__header">
        <span className="demo__eyebrow">Component Library</span>
        <h1 className="demo__title">Cards</h1>
        <p className="demo__subtitle">React 19 + TypeScript 6 + Vite</p>
      </header>

      <section className="demo__section">
        <h2 className="demo__section-title">Button</h2>
        <div className="demo__row">
          <Button variant="filled" size="md">
            Filled
          </Button>
          <Button variant="outlined" size="md">
            Outlined
          </Button>
          <Button variant="ghost" size="sm">
            Ghost
          </Button>
        </div>
      </section>

      <section className="demo__section">
        <h2 className="demo__section-title">CardCanvas</h2>
        <div className="demo__row">
          <div className="card-canvas-demo-settings">
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
          </div>
          <div className="card-canvas-demo-stage">
            <div className="card-canvas-demo-stage-wrapper">
              <CardCanvas cards={cards} onCardsChange={setCards} />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
