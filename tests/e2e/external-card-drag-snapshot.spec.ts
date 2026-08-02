import { expect, test } from '@playwright/test';

const DRAG_URL = '/node_modules/.vite/deps/@system-ui-js_multi-drag.js';
const EXTERNAL_URL = '/src/components/ExternalCardDrag.ts';

test('external startup snapshots a card and locks the first active Finger', async ({
  page,
}) => {
  await page.goto('/');
  const snapshot = await page.evaluate(
    async (urls) => {
      const { prepareExternalCardDragStart } = await import(urls.external);
      const { Drag } = await import(urls.drag);
      const source = document.createElement('div');
      document.body.append(source);
      const drag = new Drag(source, { maxFingerCount: -1, setPose: () => {} });
      for (const pointerId of [61, 62])
        source.dispatchEvent(
          new PointerEvent('pointerdown', {
            bubbles: true,
            button: 0,
            pointerId,
            pointerType: 'touch',
          })
        );
      const card = {
        id: 'snapshot-card',
        title: 'Initial title',
        content: 'Initial content',
        x: 999,
        y: 888,
        width: 120,
        height: 80,
        contentStyle: { color: 'rgb(10, 20, 30)' },
      };
      const result = prepareExternalCardDragStart(
        { card, drag },
        {
          editable: true,
          onCardsChange: () => {},
          cards: [],
          activeCandidateCardIds: new Set<string>(),
          activeDrags: new Set(),
        }
      );
      card.title = 'Mutated title';
      card.contentStyle.color = 'rgb(40, 50, 60)';
      drag.destroy();
      source.remove();
      if (!result.ok) return result;
      return {
        ok: true,
        anchor: result.preparation.anchor,
        card: result.preparation.card,
        pointerId: result.preparation.finger.pointerId,
      };
    },
    { external: EXTERNAL_URL, drag: DRAG_URL }
  );
  expect(snapshot).toEqual({
    ok: true,
    anchor: { x: 0.5, y: 0.5 },
    card: {
      id: 'snapshot-card',
      title: 'Initial title',
      content: 'Initial content',
      x: 999,
      y: 888,
      width: 120,
      height: 80,
      contentStyle: { color: 'rgb(10, 20, 30)' },
    },
    pointerId: 61,
  });
});

test('returns typed rejection for throwing top-level fields and freezes the captured startup snapshot', async ({
  page,
}) => {
  await page.goto('/');
  const result = await page.evaluate(
    async (urls) => {
      const { prepareExternalCardDragStart } = await import(urls.external);
      const { Drag } = await import(urls.drag);
      const source = document.createElement('div');
      document.body.append(source);
      const drag = new Drag(source, { setPose: () => {} });
      source.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          button: 0,
          pointerId: 71,
        })
      );
      const context = {
        editable: true,
        onCardsChange: () => {},
        cards: [],
        activeCandidateCardIds: new Set<string>(),
        activeDrags: new Set(),
      };
      const card = {
        id: 'atomic-snapshot',
        title: 'before',
        content: 'before',
        x: 0,
        y: 0,
        width: 120,
        height: 80,
      };
      let titleReads = 0;
      const statefulCard = {
        ...card,
        get id() {
          titleReads += 1;
          return titleReads <= 2 ? 'stateful-card' : '';
        },
        get width() {
          return 120;
        },
        get height() {
          return 80;
        },
      };
      const throwingAnchorInput = Object.defineProperty(
        { drag, card },
        'anchor',
        {
          get() {
            throw new TypeError('anchor getter');
          },
        }
      );
      const throwingCardInput = Object.defineProperty({ drag }, 'card', {
        get() {
          throw new TypeError('card getter');
        },
      });
      const anchor = { x: 0.25, y: 0.75 };
      const accepted = prepareExternalCardDragStart(
        { card, drag, anchor },
        context
      );
      anchor.x = 0.9;
      anchor.y = 0.1;
      const output = {
        throwingAnchor: prepareExternalCardDragStart(
          throwingAnchorInput,
          context
        ),
        throwingCard: prepareExternalCardDragStart(throwingCardInput, context),
        statefulCard: prepareExternalCardDragStart(
          { card: statefulCard, drag },
          context
        ),
        accepted: accepted.ok
          ? {
              anchor: accepted.preparation.anchor,
              card: accepted.preparation.card,
            }
          : accepted,
      };
      drag.destroy();
      source.remove();
      return output;
    },
    { external: EXTERNAL_URL, drag: DRAG_URL }
  );
  expect(result).toEqual({
    throwingAnchor: { ok: false, reason: 'invalid-anchor' },
    throwingCard: { ok: false, reason: 'invalid-card' },
    statefulCard: { ok: false, reason: 'invalid-card' },
    accepted: {
      anchor: { x: 0.25, y: 0.75 },
      card: {
        id: 'atomic-snapshot',
        title: 'before',
        content: 'before',
        x: 0,
        y: 0,
        width: 120,
        height: 80,
      },
    },
  });
});
