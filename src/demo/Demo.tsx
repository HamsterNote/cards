import { Button } from '../index';

export function Demo() {
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
    </main>
  );
}
