import { expect, test } from '@playwright/test';
import type { Finger } from '@system-ui-js/multi-drag';

const MULTI_DRAG_MODULE_URL =
  '/node_modules/.vite/deps/@system-ui-js_multi-drag.js';
const EXTERNAL_CARD_DRAG_MODULE_URL = '/src/components/ExternalCardDrag.ts';

test.describe('external card drag startup seam', () => {
  test('characterizes multi-drag finger ordering for simultaneous pointers', async ({
    page,
  }) => {
    // Given: a real host-owned Drag configured to accept multiple pointers.
    await page.goto('/');

    // When: two pointers begin on its DOM source in sequence.
    const pointerIds = await page.evaluate(async (multiDragModuleUrl) => {
      const { Drag } = await import(multiDragModuleUrl);
      const source = document.createElement('div');
      document.body.append(source);
      const drag = new Drag(source, { maxFingerCount: -1, setPose: () => {} });

      source.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          button: 0,
          pointerId: 41,
          pointerType: 'touch',
        })
      );
      source.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          button: 0,
          pointerId: 42,
          pointerType: 'touch',
        })
      );

      const result = drag
        .getFingers()
        .map((finger: Finger) => finger.pointerId);
      drag.destroy();
      source.remove();
      return result;
    }, MULTI_DRAG_MODULE_URL);

    // Then: getFingers preserves pointer-start order for the startup adapter.
    expect(pointerIds).toEqual([41, 42]);
  });

  test('returns the first applicable startup rejection reason', async ({
    page,
  }) => {
    // Given: one real host Drag and inputs that overlap individual startup failures.
    await page.goto('/');

    // When: the public startup seam evaluates each invalid request.
    const reasons = await page.evaluate(
      async ({ externalCardDragModuleUrl, multiDragModuleUrl }) => {
        const { prepareExternalCardDragStart } = await import(
          externalCardDragModuleUrl
        );
        const { Drag } = await import(multiDragModuleUrl);
        const source = document.createElement('div');
        document.body.append(source);
        const drag = new Drag(source, { setPose: () => {} });
        const makeCard = (id: string) => ({
          id,
          title: `Title ${id}`,
          content: `Content ${id}`,
          x: 0,
          y: 0,
          width: 120,
          height: 80,
        });
        const onCardsChange = () => {};
        const baseContext: {
          editable: boolean;
          onCardsChange: (() => void) | undefined;
          cards: ReturnType<typeof makeCard>[];
          activeCandidateCardIds: Set<string>;
          activeDrags: Set<InstanceType<typeof Drag>>;
        } = {
          editable: true,
          onCardsChange,
          cards: [],
          activeCandidateCardIds: new Set<string>(),
          activeDrags: new Set(),
        };
        const reasonFor = (
          input: {
            card: ReturnType<typeof makeCard>;
            drag: InstanceType<typeof Drag>;
            anchor?: { x: number; y: number };
          },
          context: typeof baseContext
        ) => {
          const result = prepareExternalCardDragStart(input, context);
          return result.ok ? 'accepted' : result.reason;
        };

        const result = {
          notEditable: reasonFor(
            {
              card: { ...makeCard('not-editable'), width: 0 },
              drag,
              anchor: { x: -1, y: 2 },
            },
            { ...baseContext, editable: false, onCardsChange: undefined }
          ),
          missingOnCardsChange: reasonFor(
            {
              card: { ...makeCard('missing-callback'), width: 0 },
              drag,
              anchor: { x: -1, y: 2 },
            },
            { ...baseContext, onCardsChange: undefined }
          ),
          invalidAnchor: reasonFor(
            {
              card: { ...makeCard('invalid-anchor'), width: 0 },
              drag,
              anchor: { x: Number.NaN, y: 0.5 },
            },
            baseContext
          ),
          invalidCard: reasonFor(
            {
              card: { ...makeCard('invalid-card'), width: 0 },
              drag,
            },
            baseContext
          ),
          duplicateCardId: reasonFor(
            { card: makeCard('duplicate-card-id'), drag },
            {
              ...baseContext,
              cards: [makeCard('duplicate-card-id')],
            }
          ),
          duplicateCandidateCardId: reasonFor(
            { card: makeCard('duplicate-candidate-card-id'), drag },
            {
              ...baseContext,
              activeCandidateCardIds: new Set(['duplicate-candidate-card-id']),
            }
          ),
          dragAlreadyActive: reasonFor(
            { card: makeCard('drag-already-active'), drag },
            { ...baseContext, activeDrags: new Set([drag]) }
          ),
          missingActivePointer: reasonFor(
            { card: makeCard('missing-active-pointer'), drag },
            baseContext
          ),
          cloneFailure: reasonFor(
            { card: new Proxy(makeCard('clone-failure'), {}), drag },
            baseContext
          ),
        };
        drag.destroy();
        source.remove();
        return result;
      },
      {
        externalCardDragModuleUrl: EXTERNAL_CARD_DRAG_MODULE_URL,
        multiDragModuleUrl: MULTI_DRAG_MODULE_URL,
      }
    );

    // Then: each reason is exact and overlapping input follows documented precedence.
    expect(reasons).toEqual({
      notEditable: 'not-editable',
      missingOnCardsChange: 'missing-on-cards-change',
      invalidAnchor: 'invalid-anchor',
      invalidCard: 'invalid-card',
      duplicateCardId: 'duplicate-card-id',
      duplicateCandidateCardId: 'duplicate-card-id',
      dragAlreadyActive: 'drag-already-active',
      missingActivePointer: 'missing-active-pointer',
      cloneFailure: 'invalid-card',
    });
  });

  test('rejects every invalid anchor and Card geometry boundary', async ({
    page,
  }) => {
    // Given: a real active Drag and otherwise valid startup dependencies.
    await page.goto('/');

    // When: each documented finite-range and positive-geometry boundary is evaluated.
    const reasons = await page.evaluate(
      async ({ externalCardDragModuleUrl, multiDragModuleUrl }) => {
        const { prepareExternalCardDragStart } = await import(
          externalCardDragModuleUrl
        );
        const { Drag } = await import(multiDragModuleUrl);
        const source = document.createElement('div');
        document.body.append(source);
        const drag = new Drag(source, { setPose: () => {} });
        source.dispatchEvent(
          new PointerEvent('pointerdown', {
            bubbles: true,
            button: 0,
            pointerId: 51,
            pointerType: 'mouse',
          })
        );
        const makeCard = (id: string) => ({
          id,
          title: `Title ${id}`,
          content: `Content ${id}`,
          x: 0,
          y: 0,
          width: 120,
          height: 80,
        });
        const context = {
          editable: true,
          onCardsChange: () => {},
          cards: [],
          activeCandidateCardIds: new Set<string>(),
          activeDrags: new Set<InstanceType<typeof Drag>>(),
        };
        const reasonFor = (input: {
          card: ReturnType<typeof makeCard>;
          anchor?: { x: number; y: number };
        }) => {
          const result = prepareExternalCardDragStart(
            { ...input, drag },
            context
          );
          return result.ok ? 'accepted' : result.reason;
        };

        const result = {
          anchorBelowRange: reasonFor({
            card: makeCard('anchor-below-range'),
            anchor: { x: -Number.EPSILON, y: 0.5 },
          }),
          anchorAboveRange: reasonFor({
            card: makeCard('anchor-above-range'),
            anchor: { x: 0.5, y: 1 + Number.EPSILON },
          }),
          anchorInfinite: reasonFor({
            card: makeCard('anchor-infinite'),
            anchor: { x: Infinity, y: 0.5 },
          }),
          emptyCardId: reasonFor({ card: makeCard('') }),
          zeroWidth: reasonFor({
            card: { ...makeCard('zero-width'), width: 0 },
          }),
          negativeHeight: reasonFor({
            card: { ...makeCard('negative-height'), height: -1 },
          }),
          infiniteWidth: reasonFor({
            card: { ...makeCard('infinite-width'), width: Infinity },
          }),
          nanHeight: reasonFor({
            card: { ...makeCard('nan-height'), height: Number.NaN },
          }),
        };
        drag.destroy();
        source.remove();
        return result;
      },
      {
        externalCardDragModuleUrl: EXTERNAL_CARD_DRAG_MODULE_URL,
        multiDragModuleUrl: MULTI_DRAG_MODULE_URL,
      }
    );

    // Then: no boundary is silently clamped, coerced, or accepted.
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

  test('snapshots the card and locks the first active Finger', async ({
    page,
  }) => {
    // Given: a real Drag with two active touch Fingers and a deeply mutable caller Card.
    await page.goto('/');

    // When: startup preparation succeeds before the caller mutates its input Card.
    const snapshot = await page.evaluate(
      async ({ externalCardDragModuleUrl, multiDragModuleUrl }) => {
        const { prepareExternalCardDragStart } = await import(
          externalCardDragModuleUrl
        );
        const { Drag } = await import(multiDragModuleUrl);
        const source = document.createElement('div');
        document.body.append(source);
        const drag = new Drag(source, {
          maxFingerCount: -1,
          setPose: () => {},
        });
        source.dispatchEvent(
          new PointerEvent('pointerdown', {
            bubbles: true,
            button: 0,
            pointerId: 61,
            pointerType: 'touch',
          })
        );
        source.dispatchEvent(
          new PointerEvent('pointerdown', {
            bubbles: true,
            button: 0,
            pointerId: 62,
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
          ok: result.ok,
          anchor: result.preparation.anchor,
          card: result.preparation.card,
          pointerId: result.preparation.finger.pointerId,
        };
      },
      {
        externalCardDragModuleUrl: EXTERNAL_CARD_DRAG_MODULE_URL,
        multiDragModuleUrl: MULTI_DRAG_MODULE_URL,
      }
    );

    // Then: snapshot ownership and the default anchor are isolated from caller mutation.
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
});
