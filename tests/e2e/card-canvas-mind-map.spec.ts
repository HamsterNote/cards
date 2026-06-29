import { test, expect, type Page } from '@playwright/test';
import {
  addCardWithParent,
  cardLocatorSelector,
  dragCardCenterToPoint,
  dragLocatorBy,
  expectCardMovedBy,
  expectNoParent,
  getCardData,
  getCardDataById,
  getRequiredBox,
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

function expectNoVerticalOverlap(cards: readonly CardDataSnapshot[]): void {
  for (let index = 1; index < cards.length; index += 1) {
    const previous = cards[index - 1];
    const current = cards[index];
    if (previous === undefined || current === undefined) {
      throw new Error(`Missing sibling while checking overlap at ${index}`);
    }

    expect(current.y).toBeGreaterThanOrEqual(previous.y + previous.height);
  }
}

async function dragCardCenterOntoCard(
  page: Page,
  draggedCardId: string,
  targetCardId: string
): Promise<void> {
  const draggedCard = page.locator(cardLocatorSelector(draggedCardId));
  const draggedHandle = draggedCard.locator('.cards-card-canvas__card-header');
  await draggedHandle.scrollIntoViewIfNeeded();
  const targetBox = await getRequiredBox(page.locator(cardLocatorSelector(targetCardId)));
  await dragCardCenterToPoint(
    page,
    { card: draggedCard, handle: draggedHandle },
    {
      x: targetBox.x + targetBox.width / 2,
      y: targetBox.y + targetBox.height / 2,
    }
  );
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

  test('attaches a free card into a mind-map parent without expanding the parent', async ({
    page,
  }) => {
    // Given: a frozen mind-map parent already owns siblings and a separate free card.
    const parent = Object.freeze({ ...parentCard, childrenLayoutMode: 'mind-map-horizontal' as const });
    const first = Object.freeze({ ...childCard, id: 'first-child', height: 80 });
    const second = Object.freeze({ ...childCard, id: 'second-child', height: 90 });
    const free = Object.freeze({
      ...childCard,
      id: 'free-child',
      parent: undefined,
      x: 620,
      y: 360,
      height: 100,
    });
    await loadFrozenCards(page, [parent, first, second, free]);
    await waitForAnimationFrame(page);
    const beforeParent = getCardDataById(await getCardData(page), parent.id);

    // When: the free card is dropped onto the mind-map parent.
    await dragCardCenterOntoCard(page, free.id, parent.id);
    await waitForAnimationFrame(page);

    // Then: hierarchy is written, parent dimensions are stable, and siblings reflow to the right.
    const cards = await getCardData(page);
    const parentAfter = getCardDataById(cards, parent.id);
    const firstAfter = getCardDataById(cards, first.id);
    const secondAfter = getCardDataById(cards, second.id);
    const freeAfter = getCardDataById(cards, free.id);
    expect(freeAfter.parent).toBe(parent.id);
    expect(parentAfter.width).toBeCloseTo(beforeParent.width, 5);
    expect(parentAfter.height).toBeCloseTo(beforeParent.height, 5);
    expect(freeAfter.x).toBeGreaterThan(parentAfter.x + parentAfter.width);
    expect(firstAfter.x).toBeCloseTo(expectedChildX(parentAfter), 5);
    expect(secondAfter.x).toBeCloseTo(expectedChildX(parentAfter), 5);
    expect(freeAfter.x).toBeCloseTo(expectedChildX(parentAfter), 5);
    expect(firstAfter.y).toBeCloseTo(expectedChildY(parentAfter, [first, second, free], 0), 5);
    expect(secondAfter.y).toBeCloseTo(expectedChildY(parentAfter, [first, second, free], 1), 5);
    expect(freeAfter.y).toBeCloseTo(expectedChildY(parentAfter, [first, second, free], 2), 5);
    expectNoVerticalOverlap([firstAfter, secondAfter, freeAfter]);
  });

  test('keeps containment expansion when attaching to a free parent', async ({
    page,
  }) => {
    // Given: a frozen free parent and a large free card that will protrude after drop.
    const freeParent = Object.freeze({ ...parentCard });
    const freeChild = Object.freeze({
      ...childCard,
      id: 'free-mode-child',
      parent: undefined,
      x: 560,
      y: 340,
      width: 180,
      height: 140,
    });
    await loadFrozenCards(page, [freeParent, freeChild]);
    const parentBefore = getCardDataById(await getCardData(page), freeParent.id);
    const child = page.locator(cardLocatorSelector(freeChild.id));
    await child.locator('.cards-card-canvas__card-header').scrollIntoViewIfNeeded();
    const parentBox = await getRequiredBox(page.locator(cardLocatorSelector(freeParent.id)));

    // When: the child center is dropped near the free parent's bottom-right interior.
    await dragCardCenterToPoint(
      page,
      { card: child, handle: child.locator('.cards-card-canvas__card-header') },
      { x: parentBox.x + parentBox.width - 4, y: parentBox.y + parentBox.height - 4 }
    );

    // Then: the legacy free-mode attach path still expands the parent to contain the child.
    const cards = await getCardData(page);
    const parentAfter = getCardDataById(cards, freeParent.id);
    const childAfter = getCardDataById(cards, freeChild.id);
    expect(childAfter.parent).toBe(freeParent.id);
    expect(parentAfter.width).toBeGreaterThan(parentBefore.width);
    expect(parentAfter.height).toBeGreaterThan(parentBefore.height);
  });

  test('re-parents a child between mind-map parents and reflows both sibling groups', async ({
    page,
  }) => {
    // Given: two frozen mind-map parents each have direct children.
    const oldParent = Object.freeze({ ...parentCard, childrenLayoutMode: 'mind-map-horizontal' as const });
    const stayingChild = Object.freeze({ ...childCard, id: 'staying-child', height: 80 });
    const movingChild = Object.freeze({ ...childCard, id: 'moving-child', height: 110 });
    const newParent = Object.freeze({
      ...parentCard,
      id: 'new-parent',
      title: 'New Parent',
      x: 560,
      y: 100,
      childrenLayoutMode: 'mind-map-horizontal' as const,
    });
    const newSibling = Object.freeze({
      ...childCard,
      id: 'new-sibling',
      parent: newParent.id,
      height: 90,
    });
    await loadFrozenCards(page, [oldParent, stayingChild, movingChild, newParent, newSibling]);
    await waitForAnimationFrame(page);

    // When: a child from the old parent is dropped onto the new mind-map parent.
    await dragCardCenterOntoCard(page, movingChild.id, newParent.id);
    await waitForAnimationFrame(page);

    // Then: the old group collapses to one centered child and the new group is laid out together.
    const cards = await getCardData(page);
    const oldParentAfter = getCardDataById(cards, oldParent.id);
    const newParentAfter = getCardDataById(cards, newParent.id);
    const stayingAfter = getCardDataById(cards, stayingChild.id);
    const movingAfter = getCardDataById(cards, movingChild.id);
    const newSiblingAfter = getCardDataById(cards, newSibling.id);
    expect(movingAfter.parent).toBe(newParent.id);
    expect(stayingAfter.parent).toBe(oldParent.id);
    expect(stayingAfter.x).toBeCloseTo(expectedChildX(oldParentAfter), 5);
    expect(stayingAfter.y).toBeCloseTo(expectedChildY(oldParentAfter, [stayingChild], 0), 5);
    expect(movingAfter.x).toBeCloseTo(expectedChildX(newParentAfter), 5);
    expect(newSiblingAfter.x).toBeCloseTo(expectedChildX(newParentAfter), 5);
    expect(movingAfter.y).toBeCloseTo(expectedChildY(newParentAfter, [movingChild, newSibling], 0), 5);
    expect(newSiblingAfter.y).toBeCloseTo(expectedChildY(newParentAfter, [movingChild, newSibling], 1), 5);
    expectNoVerticalOverlap([movingAfter, newSiblingAfter]);
  });

  test('snaps a small empty-canvas drag of a managed child back to mind-map layout', async ({
    page,
  }) => {
    // Given: a mind-map parent owns two managed children in canonical positions.
    const parent = Object.freeze({ ...parentCard, childrenLayoutMode: 'mind-map-horizontal' as const });
    const movingChild = Object.freeze({ ...childCard, id: 'small-drag-child', height: 90 });
    const sibling = Object.freeze({ ...childCard, id: 'small-drag-sibling', height: 110 });
    await loadFrozenCards(page, [parent, movingChild, sibling]);
    await waitForAnimationFrame(page);
    const beforeCards = await getCardData(page);
    const parentBefore = getCardDataById(beforeCards, parent.id);

    // When: the child moves less than the detach threshold and is released over empty canvas.
    await dragLocatorBy(
      page,
      page.locator(`${cardLocatorSelector(movingChild.id)} .cards-card-canvas__card-header`),
      { x: 20, y: 10 }
    );
    await waitForAnimationFrame(page);

    // Then: it keeps its parent and returns to the canonical sibling slot.
    const cards = await getCardData(page);
    const childAfter = getCardDataById(cards, movingChild.id);
    const siblingAfter = getCardDataById(cards, sibling.id);
    expect(childAfter.parent).toBe(parent.id);
    expect(childAfter.x).toBeCloseTo(expectedChildX(parentBefore), 5);
    expect(childAfter.y).toBeCloseTo(expectedChildY(parentBefore, [movingChild, sibling], 0), 5);
    expect(siblingAfter.y).toBeCloseTo(expectedChildY(parentBefore, [movingChild, sibling], 1), 5);
  });

  test('detaches a large empty-canvas drag of a managed child and reflows old siblings', async ({
    page,
  }) => {
    // Given: a managed child and a sibling are laid out by a mind-map parent.
    const parent = Object.freeze({ ...parentCard, childrenLayoutMode: 'mind-map-horizontal' as const });
    const movingChild = Object.freeze({ ...childCard, id: 'large-drag-child', height: 90 });
    const sibling = Object.freeze({ ...childCard, id: 'large-drag-sibling', height: 110 });
    await loadFrozenCards(page, [parent, movingChild, sibling]);
    await waitForAnimationFrame(page);
    const beforeCards = await getCardData(page);
    const parentBefore = getCardDataById(beforeCards, parent.id);
    const movingBefore = getCardDataById(beforeCards, movingChild.id);

    // When: the child moves past the detach threshold and is released over empty canvas.
    await dragLocatorBy(
      page,
      page.locator(`${cardLocatorSelector(movingChild.id)} .cards-card-canvas__card-header`),
      { x: 80, y: 0 }
    );
    await waitForAnimationFrame(page);

    // Then: the child keeps the release coordinates while the old parent's remaining child reflows.
    const cards = await getCardData(page);
    const movingAfter = getCardDataById(cards, movingChild.id);
    const siblingAfter = getCardDataById(cards, sibling.id);
    expectNoParent(movingAfter);
    expect(movingAfter.x).toBeCloseTo(movingBefore.x + 80, 5);
    expect(movingAfter.y).toBeCloseTo(movingBefore.y, 5);
    expect(siblingAfter.parent).toBe(parent.id);
    expect(siblingAfter.x).toBeCloseTo(expectedChildX(parentBefore), 5);
    expect(siblingAfter.y).toBeCloseTo(expectedChildY(parentBefore, [sibling], 0), 5);
  });

  test('re-parents a managed child over a valid parent even below detach threshold', async ({
    page,
  }) => {
    // Given: the new mind-map parent begins just outside the dragged child's start point.
    const oldParent = Object.freeze({ ...parentCard, childrenLayoutMode: 'mind-map-horizontal' as const });
    const movingChild = Object.freeze({ ...childCard, id: 'threshold-reparent-child', height: 90 });
    const oldSibling = Object.freeze({ ...childCard, id: 'threshold-old-sibling', height: 100 });
    const newParent = Object.freeze({
      ...parentCard,
      id: 'threshold-new-parent',
      title: 'Threshold New Parent',
      x: 470,
      y: 80,
      childrenLayoutMode: 'mind-map-horizontal' as const,
    });
    await loadFrozenCards(page, [oldParent, movingChild, oldSibling, newParent]);
    await waitForAnimationFrame(page);

    // When: a below-threshold move releases the child over that valid parent candidate.
    await dragLocatorBy(
      page,
      page.locator(`${cardLocatorSelector(movingChild.id)} .cards-card-canvas__card-header`),
      { x: 20, y: 10 }
    );
    await waitForAnimationFrame(page);

    // Then: re-parenting wins over snap-back threshold handling.
    const cards = await getCardData(page);
    const oldParentAfter = getCardDataById(cards, oldParent.id);
    const newParentAfter = getCardDataById(cards, newParent.id);
    const movingAfter = getCardDataById(cards, movingChild.id);
    const oldSiblingAfter = getCardDataById(cards, oldSibling.id);
    expect(movingAfter.parent).toBe(newParent.id);
    expect(oldSiblingAfter.parent).toBe(oldParent.id);
    expect(oldSiblingAfter.y).toBeCloseTo(expectedChildY(oldParentAfter, [oldSibling], 0), 5);
    expect(movingAfter.x).toBeCloseTo(expectedChildX(newParentAfter), 5);
    expect(movingAfter.y).toBeCloseTo(expectedChildY(newParentAfter, [movingChild], 0), 5);
  });

  test('moves a dragged mind-map parent and all descendants by the exact delta', async ({
    page,
  }) => {
    // Given: a root mind-map parent has children and a nested grandchild branch.
    const root = Object.freeze({ ...parentCard, childrenLayoutMode: 'mind-map-horizontal' as const });
    const branch = Object.freeze({
      ...childCard,
      id: 'delta-branch',
      height: 90,
      childrenLayoutMode: 'mind-map-horizontal' as const,
    });
    const rootSibling = Object.freeze({ ...childCard, id: 'delta-root-sibling', height: 100 });
    const grandchild = Object.freeze({
      ...childCard,
      id: 'delta-grandchild',
      parent: branch.id,
      height: 80,
    });
    await loadFrozenCards(page, [root, branch, rootSibling, grandchild]);
    await waitForAnimationFrame(page);
    const beforeCards = await getCardData(page);

    // When: the root parent is dragged by a fixed canvas delta.
    const delta = { x: 100, y: 20 };
    await dragLocatorBy(
      page,
      page.locator(`${cardLocatorSelector(root.id)} .cards-card-canvas__card-header`),
      delta
    );
    await waitForAnimationFrame(page);

    // Then: parent, children, and grandchild all receive exactly the same persisted delta.
    const afterCards = await getCardData(page);
    for (const cardId of [root.id, branch.id, rootSibling.id, grandchild.id]) {
      expectCardMovedBy(
        getCardDataById(beforeCards, cardId),
        getCardDataById(afterCards, cardId),
        delta
      );
    }
  });
});
