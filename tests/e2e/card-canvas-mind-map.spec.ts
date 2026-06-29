import { test, expect, type Page } from '@playwright/test';
import {
  addCardWithParent,
  getCardData,
  getCardDataById,
  type CardDataSnapshot,
  waitForAnimationFrame,
} from './helpers';
import {
  MIND_MAP_HORIZONTAL_GAP,
  MIND_MAP_VERTICAL_GAP,
} from '../../src/utils/card-layout';
import type { CardChildrenLayoutMode } from '../../src';

type DemoCardInput = {
  readonly id: string;
  readonly parent?: string;
  readonly title: string;
  readonly content: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly childrenLayoutMode?: CardChildrenLayoutMode;
};

const parentCard: DemoCardInput = Object.freeze({
  id: 'parent-card',
  title: 'Parent',
  content: 'Parent content',
  x: 120,
  y: 80,
  width: 220,
  height: 160,
});

const childCard: DemoCardInput = Object.freeze({
  id: 'child-card',
  parent: parentCard.id,
  title: 'Child',
  content: 'Child content',
  x: 150,
  y: 130,
  width: 140,
  height: 90,
});

async function loadFrozenCards(
  page: Page,
  cards: readonly DemoCardInput[]
): Promise<void> {
  await page.evaluate((nextCards) => {
    const frozenCards = nextCards.map((card) => Object.freeze({ ...card }));
    window.dispatchEvent(
      new CustomEvent('card-canvas-demo:set-cards', {
        detail: Object.freeze(frozenCards),
      })
    );
  }, cards);
}

function expectModeAbsent(card: CardDataSnapshot): void {
  expect(Object.hasOwn(card, 'childrenLayoutMode')).toBe(false);
}

function expectedChildX(parent: CardDataSnapshot | DemoCardInput): number {
  return parent.x + parent.width + MIND_MAP_HORIZONTAL_GAP;
}

function expectedChildY(
  parent: CardDataSnapshot | DemoCardInput,
  siblings: readonly (CardDataSnapshot | DemoCardInput)[],
  index: number
): number {
  const child = siblings[index];
  if (child === undefined) throw new Error(`Missing child at index ${index}`);

  const blockHeight =
    siblings.reduce((height, sibling) => height + sibling.height, 0) +
    MIND_MAP_VERTICAL_GAP * (siblings.length - 1);
  let slotTop = parent.y + parent.height / 2 - blockHeight / 2;
  for (let i = 0; i < index; i += 1) {
    const previous = siblings[i];
    if (previous !== undefined) {
      slotTop += previous.height + MIND_MAP_VERTICAL_GAP;
    }
  }

  return slotTop;
}

async function selectCard(page: Page, cardId: string): Promise<void> {
  await page
    .locator(`[data-card-id="${cardId}"] .cards-card-canvas__card-content`)
    .click({ force: true });
}

async function deleteSelectedCard(page: Page): Promise<void> {
  await page.getByTestId('delete-selected-card').click();
}

test.describe('CardCanvas mind-map data contract', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('treats missing childrenLayoutMode as free mode without serializing the field', async ({
    page,
  }) => {
    // Given: parent/child cards are frozen and intentionally omit childrenLayoutMode.
    await loadFrozenCards(page, [parentCard, childCard]);
    await expect(page.locator('[data-card-id]')).toHaveCount(2);

    // When: the demo serializes the current cards data.
    const serializedCards = await page.locator('[data-card-data-content]').innerText();
    const cards = await getCardData(page);
    const child = getCardDataById(cards, childCard.id);

    // Then: free-mode coordinates and hierarchy are preserved without adding the optional field.
    expect(child.x).toBe(childCard.x);
    expect(child.y).toBe(childCard.y);
    expect(child.parent).toBe(parentCard.id);
    expectModeAbsent(getCardDataById(cards, parentCard.id));
    expectModeAbsent(child);
    expect(serializedCards).not.toContain('childrenLayoutMode');
  });

  test('rejects unknown childrenLayoutMode values in helper parsing', async ({
    page,
  }) => {
    // Given: helper input carries an unknown mode value from serialized card data.
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent('card-canvas-demo:set-cards', {
          detail: [
            {
              id: 'card-with-invalid-mode',
              title: 'Invalid Mode',
              content: 'Invalid mode content',
              x: 0,
              y: 0,
              width: 180,
              height: 120,
              childrenLayoutMode: 'vertical',
            },
          ],
        })
      );
    });
    await expect(page.locator('[data-card-id]')).toHaveCount(1);
    await expect(page.locator('[data-card-data-content]')).toContainText(
      'vertical'
    );

    const readInvalidCardData = async (): Promise<readonly CardDataSnapshot[]> =>
      getCardData(page);

    await expect(readInvalidCardData()).rejects.toThrow(
      /childrenLayoutMode|card snapshots/
    );
  });

  test('normalizes stale external mind-map cards once without oscillating', async ({
    page,
  }) => {
    // Given: external controlled data marks a parent as mind-map but sends stale child coordinates.
    const staleChild = Object.freeze({ ...childCard, x: -300, y: 500 });
    const mindMapParent = Object.freeze({
      ...parentCard,
      childrenLayoutMode: 'mind-map-horizontal' as const,
    });

    // When: the demo receives the replacement and CardCanvas writes back canonical data.
    const result = await page.evaluate(async (nextCards) => {
      const dataNode = document.querySelector('[data-card-data-content]');
      if (dataNode === null) throw new Error('Missing cards data display');
      const states: string[] = [];
      const observer = new MutationObserver(() => {
        states.push(dataNode.textContent ?? '');
      });
      observer.observe(dataNode, { childList: true, characterData: true, subtree: true });
      window.dispatchEvent(
        new CustomEvent('card-canvas-demo:set-cards', {
          detail: Object.freeze(nextCards.map((card) => Object.freeze({ ...card }))),
        })
      );
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      observer.disconnect();
      return { states, text: dataNode.textContent ?? '' };
    }, [mindMapParent, staleChild]);

    // Then: final coordinates are canonical and no repeated write-back loop appears.
    expect(result.states.length).toBeLessThanOrEqual(2);
    const cards = await getCardData(page);
    const child = getCardDataById(cards, childCard.id);
    expect(child.x).toBeCloseTo(expectedChildX(parentCard), 5);
    expect(child.y).toBeCloseTo(expectedChildY(parentCard, [childCard], 0), 5);
    const normalizedText = await page.locator('[data-card-data-content]').innerText();
    await waitForAnimationFrame(page);
    expect(await page.locator('[data-card-data-content]').innerText()).toBe(normalizedText);
  });

  test('toggles a selected parent to mind-map and back to explicit free', async ({
    page,
  }) => {
    // Given: a free parent with one child is selected in the Demo.
    const detachedChild = Object.freeze({ ...childCard, x: 520, y: 120 });
    await loadFrozenCards(page, [parentCard, detachedChild]);
    await selectCard(page, parentCard.id);

    // When: the popover mode control switches to horizontal mind-map.
    await page.locator('[data-card-children-layout-mode-select]').selectOption('mind-map-horizontal');

    // Then: mode is persisted and child coordinates are normalized.
    let cards = await getCardData(page);
    let parent = getCardDataById(cards, parentCard.id);
    let child = getCardDataById(cards, childCard.id);
    expect(parent.childrenLayoutMode).toBe('mind-map-horizontal');
    expect(child.x).toBeCloseTo(expectedChildX(parent), 5);
    expect(child.y).toBeCloseTo(expectedChildY(parent, [detachedChild], 0), 5);

    // When: the mode switches back to free.
    await page.locator('[data-card-children-layout-mode-select]').selectOption('free');

    // Then: explicit free is written and existing coordinates are not erased.
    cards = await getCardData(page);
    parent = getCardDataById(cards, parentCard.id);
    child = getCardDataById(cards, childCard.id);
    expect(parent.childrenLayoutMode).toBe('free');
    expect(child.x).toBeCloseTo(expectedChildX(parent), 5);
    expect(child.y).toBeCloseTo(expectedChildY(parent, [detachedChild], 0), 5);
  });

  test('adds a Demo child under a mind-map parent at canonical coordinates', async ({
    page,
  }) => {
    // Given: a single mind-map parent exists in controlled Demo state.
    const mindMapParent = Object.freeze({
      ...parentCard,
      childrenLayoutMode: 'mind-map-horizontal' as const,
    });
    await loadFrozenCards(page, [mindMapParent]);

    // When: the Demo Parent ID flow adds a child under that parent.
    await addCardWithParent(page, parentCard.id, 'Added child', 'Added content');

    // Then: the new child is parented and immediately canonicalized to the right side.
    const cards = await getCardData(page);
    const child = getCardDataById(cards, 'card-2');
    expect(child.parent).toBe(parentCard.id);
    expect(child.x).toBeCloseTo(expectedChildX(mindMapParent), 5);
    expect(child.y).toBeCloseTo(expectedChildY(mindMapParent, [child], 0), 5);
  });

  test('clicking outside card/popover clears selection when popover pointerEvents is auto', async ({
    page,
  }) => {
    // Given: a parent card is selected
    await loadFrozenCards(page, [parentCard]);
    await selectCard(page, parentCard.id);
    await expect(page.locator('[data-card-selected-display]')).toHaveText(parentCard.id);
    
    const select = page.locator('[data-card-children-layout-mode-select]');
    await expect(select).toBeVisible();
    
    // When: clicking on an empty area of the canvas
    await page.mouse.click(0, 0);
    
    // Then: selection display is cleared
    await expect(page.locator('[data-card-selected-display]')).toHaveText('');
  });

  test('deleting a direct child reflows remaining mind-map siblings', async ({
    page,
  }) => {
    // Given: a mind-map parent has three direct children.
    const parent = Object.freeze({ ...parentCard, childrenLayoutMode: 'mind-map-horizontal' as const });
    const first = Object.freeze({ ...childCard, id: 'child-1', height: 80 });
    const second = Object.freeze({ ...childCard, id: 'child-2', height: 100 });
    const third = Object.freeze({ ...childCard, id: 'child-3', height: 120 });
    await loadFrozenCards(page, [parent, first, second, third]);
    await waitForAnimationFrame(page);

    // When: the first direct child is deleted through the Demo flow.
    await selectCard(page, first.id);
    await deleteSelectedCard(page);

    // Then: remaining siblings are canonicalized around the parent center.
    const cards = await getCardData(page);
    const secondAfter = getCardDataById(cards, second.id);
    const thirdAfter = getCardDataById(cards, third.id);
    expect(cards.some((card) => card.id === first.id)).toBe(false);
    expect(secondAfter.y).toBeCloseTo(expectedChildY(parent, [second, third], 0), 5);
    expect(thirdAfter.y).toBeCloseTo(expectedChildY(parent, [second, third], 1), 5);
  });

  test('deleting a nested descendant preserves cascade and reflows ancestors', async ({
    page,
  }) => {
    // Given: a root mind-map has a nested mind-map branch whose subtree affects root spacing.
    const root = Object.freeze({ ...parentCard, childrenLayoutMode: 'mind-map-horizontal' as const });
    const branch = Object.freeze({ ...childCard, id: 'branch', height: 80, childrenLayoutMode: 'mind-map-horizontal' as const });
    const nested = Object.freeze({ ...childCard, id: 'nested', parent: branch.id, height: 120 });
    const nestedSibling = Object.freeze({ ...childCard, id: 'nested-sibling', parent: branch.id, height: 120 });
    const leaf = Object.freeze({ ...childCard, id: 'leaf', parent: nested.id, height: 60 });
    const rootSibling = Object.freeze({ ...childCard, id: 'root-sibling', height: 80 });
    await loadFrozenCards(page, [root, branch, nested, nestedSibling, leaf, rootSibling]);
    await waitForAnimationFrame(page);
    const before = getCardDataById(await getCardData(page), rootSibling.id);

    // When: deleting the nested card cascades to its child leaf.
    page.once('dialog', (dialog) => dialog.accept());
    await selectCard(page, nested.id);
    await deleteSelectedCard(page);

    // Then: cascade semantics are intact and the root-level sibling reflows.
    const cards = await getCardData(page);
    expect(cards.some((card) => card.id === nested.id)).toBe(false);
    expect(cards.some((card) => card.id === leaf.id)).toBe(false);
    expect(getCardDataById(cards, branch.id).parent).toBe(root.id);
    const after = getCardDataById(cards, rootSibling.id);
    expect(after.y).not.toBeCloseTo(before.y, 5);
  });
});
