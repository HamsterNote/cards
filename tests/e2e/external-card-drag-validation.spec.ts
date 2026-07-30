import { expect, test } from '@playwright/test';

const MULTI_DRAG_MODULE_URL =
  '/node_modules/.vite/deps/@system-ui-js_multi-drag.js';
const EXTERNAL_CARD_DRAG_MODULE_URL = '/src/components/ExternalCardDrag.ts';

test.describe('external card drag validation seam', () => {
  test('rejects invalid anchor and Card geometry boundaries', async ({
    page,
  }) => {
    await page.goto('/');
    const reasons = await page.evaluate(
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
            pointerId: 51,
          })
        );
        const card = (id: string) => ({
          id,
          title: id,
          content: id,
          x: 0,
          y: 0,
          width: 120,
          height: 80,
        });
        const reason = (input: {
          card: ReturnType<typeof card>;
          anchor?: { x: number; y: number };
        }) => {
          const result = prepareExternalCardDragStart(
            { ...input, drag },
            {
              editable: true,
              onCardsChange: () => {},
              cards: [],
              activeCandidateCardIds: new Set<string>(),
              activeDrags: new Set(),
            }
          );
          return result.ok ? 'accepted' : result.reason;
        };
        const result = {
          anchorBelowRange: reason({
            card: card('below'),
            anchor: { x: -Number.EPSILON, y: 0.5 },
          }),
          anchorAboveRange: reason({
            card: card('above'),
            anchor: { x: 0.5, y: 1 + Number.EPSILON },
          }),
          anchorInfinite: reason({
            card: card('infinite'),
            anchor: { x: Infinity, y: 0.5 },
          }),
          emptyCardId: reason({ card: card('') }),
          zeroWidth: reason({ card: { ...card('zero'), width: 0 } }),
          negativeHeight: reason({ card: { ...card('negative'), height: -1 } }),
          infiniteWidth: reason({ card: { ...card('wide'), width: Infinity } }),
          nanHeight: reason({ card: { ...card('nan'), height: Number.NaN } }),
        };
        drag.destroy();
        source.remove();
        return result;
      },
      { external: EXTERNAL_CARD_DRAG_MODULE_URL, drag: MULTI_DRAG_MODULE_URL }
    );
    expect(reasons).toEqual({
      anchorBelowRange: 'invalid-anchor',
      anchorAboveRange: 'invalid-anchor',
      anchorInfinite: 'invalid-anchor',
      emptyCardId: 'invalid-card',
      zeroWidth: 'invalid-card',
      negativeHeight: 'invalid-card',
      infiniteWidth: 'invalid-card',
      nanHeight: 'invalid-card',
    });
  });
});
