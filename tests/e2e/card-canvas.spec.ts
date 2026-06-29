import { test, expect, type Locator, type Page } from '@playwright/test';

type DragDelta = {
  readonly x: number;
  readonly y: number;
};

type DragPoint = {
  readonly x: number;
  readonly y: number;
};

type CardDragLocators = {
  readonly card: Locator;
  readonly handle: Locator;
};

type CardDataSnapshot = {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly parent?: string;
};

type HierarchyCardIds = {
  readonly parentId: string;
  readonly childId: string;
  readonly grandchildId: string;
};

function expectNotNull<T>(value: T | null): T {
  expect(value).not.toBeNull();
  if (value === null) {
    throw new Error('Expected value to be non-null');
  }
  return value;
}

async function addCard(
  page: Page,
  title = 'Test Card',
  content = 'Test content'
) {
  const cardCount = await page.locator('[data-card-id]').count();
  await page.locator('[data-card-title-input]').fill(title);
  await page.locator('[data-card-content-input]').fill(content);
  await page.getByRole('button', { name: 'Add Card' }).click();
  await expect(page.locator('[data-card-id]')).toHaveCount(cardCount + 1);
}

async function addCardWithParent(
  page: Page,
  parentId: string,
  title = 'Test Card',
  content = 'Test content'
) {
  const cardCount = await page.locator('[data-card-id]').count();
  await page.locator('[data-card-title-input]').fill(title);
  await page.locator('[data-card-content-input]').fill(content);
  await page.locator('[data-card-parent-input]').fill(parentId);
  await page.getByRole('button', { name: 'Add Card' }).click();
  await expect(page.locator('[data-card-id]')).toHaveCount(cardCount + 1);
  await page.locator('[data-card-parent-input]').fill('');
}

// Helper to locate the first card and its parts.
function getCardParts(page: Page) {
  const card = page.locator('[data-card-id]').first();
  const handle = card.locator('[data-card-resize-handle]');
  const header = card.locator('.cards-card-canvas__card-header');
  return { card, handle, header };
}

async function getRequiredBox(locator: Locator) {
  return expectNotNull(await locator.boundingBox());
}

async function dragLocatorBy(
  page: Page,
  locator: Locator,
  delta: DragDelta
) {
  await locator.scrollIntoViewIfNeeded();
  const box = await getRequiredBox(locator);
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + delta.x, startY + delta.y, { steps: 10 });
  await page.mouse.up();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isCardDataSnapshot(value: unknown): value is CardDataSnapshot {
  if (!isRecord(value)) return false;

  const parent = value.parent;
  return (
    typeof value.id === 'string' &&
    typeof value.x === 'number' &&
    typeof value.y === 'number' &&
    typeof value.width === 'number' &&
    typeof value.height === 'number' &&
    (parent === undefined || typeof parent === 'string')
  );
}

function parseCardData(text: string): CardDataSnapshot[] {
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed) || !parsed.every(isCardDataSnapshot)) {
    throw new Error('Expected Current Cards Data to contain card snapshots');
  }

  return parsed;
}

async function getCardData(page: Page): Promise<CardDataSnapshot[]> {
  return parseCardData(await page.locator('[data-card-data-content]').innerText());
}

function getCardDataById(
  cards: readonly CardDataSnapshot[],
  id: string
): CardDataSnapshot {
  const card = cards.find((candidate) => candidate.id === id);
  if (card === undefined) {
    throw new Error(`Expected card data for ${id}`);
  }

  return card;
}

function expectCardMovedBy(
  before: CardDataSnapshot,
  after: CardDataSnapshot,
  delta: DragDelta
) {
  expect(after.x).toBeCloseTo(before.x + delta.x, 5);
  expect(after.y).toBeCloseTo(before.y + delta.y, 5);
}

function expectCardPositionUnchanged(
  before: CardDataSnapshot,
  after: CardDataSnapshot
) {
  expect(after.x).toBeCloseTo(before.x, 5);
  expect(after.y).toBeCloseTo(before.y, 5);
}

function expectNoParent(card: CardDataSnapshot) {
  expect(Object.hasOwn(card, 'parent')).toBe(false);
}

async function createPositionedHierarchy(page: Page): Promise<HierarchyCardIds> {
  const firstNewCardIndex = (await page.locator('[data-card-id]').count()) + 1;
  const parentId = `card-${firstNewCardIndex}`;
  const childId = `card-${firstNewCardIndex + 1}`;
  const grandchildId = `card-${firstNewCardIndex + 2}`;

  await addCard(page, 'Card A', 'Content A');
  await dragLocatorBy(
    page,
    page.locator(`[data-card-id="${parentId}"] .cards-card-canvas__card-header`),
    { x: 520, y: 300 }
  );

  await addCardWithParent(page, parentId, 'Card B', 'Content B');
  const parentCard = page.locator(`[data-card-id="${parentId}"]`);
  const parentBox = await getRequiredBox(parentCard);
  const childCard = page.locator(`[data-card-id="${childId}"]`);
  const childHeader = childCard.locator('.cards-card-canvas__card-header');
  await dragCardCenterToPoint(
    page,
    { card: childCard, handle: childHeader },
    {
      x: parentBox.x + parentBox.width * 0.4,
      y: parentBox.y + parentBox.height * 0.72,
    }
  );

  await addCardWithParent(page, childId, 'Card C', 'Content C');

  return { parentId, childId, grandchildId };
}

async function dragCardCenterTo(
  page: Page,
  locators: CardDragLocators,
  targetLocator: Locator
) {
  await locators.handle.scrollIntoViewIfNeeded();
  const cardBox = await getRequiredBox(locators.card);
  const handleBox = await getRequiredBox(locators.handle);
  const targetBox = await getRequiredBox(targetLocator);
  const target = {
    x: targetBox.x + targetBox.width / 2,
    y: targetBox.y + targetBox.height / 2,
  };
  const cardCenter = {
    x: cardBox.x + cardBox.width / 2,
    y: cardBox.y + cardBox.height / 2,
  };
  const handleCenter = {
    x: handleBox.x + handleBox.width / 2,
    y: handleBox.y + handleBox.height / 2,
  };

  await page.mouse.move(handleCenter.x, handleCenter.y);
  await page.mouse.down();
  await page.mouse.move(
    handleCenter.x + target.x - cardCenter.x,
    handleCenter.y + target.y - cardCenter.y,
    { steps: 20 }
  );
}

async function dragCardCenterToPoint(
  page: Page,
  locators: CardDragLocators,
  target: DragPoint
) {
  await locators.handle.scrollIntoViewIfNeeded();
  const cardBox = await getRequiredBox(locators.card);
  const handleBox = await getRequiredBox(locators.handle);
  const cardCenter = {
    x: cardBox.x + cardBox.width / 2,
    y: cardBox.y + cardBox.height / 2,
  };
  const handleCenter = {
    x: handleBox.x + handleBox.width / 2,
    y: handleBox.y + handleBox.height / 2,
  };

  await page.mouse.move(handleCenter.x, handleCenter.y);
  await page.mouse.down();
  await page.mouse.move(
    handleCenter.x + target.x - cardCenter.x,
    handleCenter.y + target.y - cardCenter.y,
    { steps: 20 }
  );
  await page.mouse.up();
}

/**
 * Drag a card by its handle/header so the pointer ends at an absolute viewport
 * point, leaving the mouse button held down. Use this when you need to assert
 * state *during* a drag before releasing.
 */
async function dragHandleToPoint(page: Page, handle: Locator, target: DragPoint) {
  await handle.scrollIntoViewIfNeeded();
  const handleBox = await getRequiredBox(handle);
  const handleCenter = {
    x: handleBox.x + handleBox.width / 2,
    y: handleBox.y + handleBox.height / 2,
  };

  await page.mouse.move(handleCenter.x, handleCenter.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 20 });
}

async function enableOption(page: Page, selector: string) {
  const option = page.locator(selector);
  await expect(option).toBeVisible();
  await option.check();
}

async function disableOption(page: Page, selector: string) {
  const option = page.locator(selector);
  await expect(option).toBeVisible();
  await option.uncheck();
}

async function clearSelectionFromCanvas(page: Page) {
  const stage = page.locator('.card-canvas-demo-stage');
  const stageBox = await getRequiredBox(stage);
  await page.mouse.click(stageBox.x + 20, stageBox.y + 20);
  await expect(page.locator('[data-card-selected-display]')).toBeEmpty();
}

async function selectCardByContent(page: Page, id: string) {
  const card = page.locator(`[data-card-id="${id}"]`);
  await card.locator('.cards-card-canvas__card-content').dispatchEvent('click');
  await expect(card).toHaveClass(/cards-card-canvas__card--selected/);
  await expect(page.locator('[data-card-selected-display]')).toHaveText(id);
}

test.describe('Demo layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('uses the full viewport width while preserving the 240px settings sidebar', async ({
    page,
  }) => {
    const demo = page.locator('.demo');
    const settings = page.locator('.card-canvas-demo-settings');
    const stage = page.locator('.card-canvas-demo-stage');

    const demoBox = await demo.boundingBox();
    const settingsBox = await settings.boundingBox();
    const stageBox = await stage.boundingBox();

    const requiredDemoBox = expectNotNull(demoBox);
    const requiredSettingsBox = expectNotNull(settingsBox);
    const requiredStageBox = expectNotNull(stageBox);

    // Sidebar must stay exactly 240px wide.
    expect(requiredSettingsBox.width).toBe(240);

    // The demo container should span nearly the full viewport width (minus padding).
    expect(requiredDemoBox.width).toBeGreaterThan(1000);

    // The stage must fill the remaining horizontal space (tolerant of section padding/gap).
    expect(requiredStageBox.width).toBeGreaterThan(800);
  });

  test('removes the Button showcase while preserving Add Card', async ({
    page,
  }) => {
    await expect(page.getByRole('heading', { name: 'Button' })).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'CardCanvas' })
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Card' })).toBeVisible();
  });
});

test.describe('CardCanvas select-on-add toggle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('toggle defaults to checked and newly added cards are selected and centered', async ({
    page,
  }) => {
    const toggle = page.locator('[data-card-select-new-card-toggle]');
    await expect(toggle).toBeVisible();
    await expect(toggle).toBeChecked();

    await addCard(page, 'Card A', 'Content A');

    const card = page.locator('[data-card-id="card-1"]');
    await expect(card).toHaveClass(/cards-card-canvas__card--selected/);
    await expect(
      page.locator('.cards-card-canvas__card--selected')
    ).toHaveCount(1);
    await expect(page.locator('[data-card-selected-display]')).toHaveText(
      'card-1'
    );
    await expect(page.locator('[data-testid="delete-selected-card"]')).toBeEnabled();

    const cardData = await getCardData(page);
    const firstCard = getCardDataById(cardData, 'card-1');
    expect(firstCard.x).toBe(-90);
    expect(firstCard.y).toBe(-60);
    expect(firstCard.width).toBe(180);
    expect(firstCard.height).toBe(120);

    await expect(card).toHaveCSS('left', '-90px');
    await expect(card).toHaveCSS('top', '-60px');

    await addCard(page, 'Card B', 'Content B');

    const secondCard = page.locator('[data-card-id="card-2"]');
    await expect(secondCard).toHaveClass(/cards-card-canvas__card--selected/);
    await expect(card).not.toHaveClass(/cards-card-canvas__card--selected/);
    await expect(
      page.locator('.cards-card-canvas__card--selected')
    ).toHaveCount(1);
    await expect(page.locator('[data-card-selected-display]')).toHaveText(
      'card-2'
    );

    const cardsAfterSecondAdd = await getCardData(page);
    const secondCardData = getCardDataById(cardsAfterSecondAdd, 'card-2');
    expect(secondCardData.x).toBe(-90);
    expect(secondCardData.y).toBe(-60);
  });

  test('does not select newly added cards when the toggle is unchecked', async ({
    page,
  }) => {
    await disableOption(page, '[data-card-select-new-card-toggle]');

    await addCard(page, 'Card A', 'Content A');

    const firstCard = page.locator('[data-card-id="card-1"]');
    await expect(firstCard).not.toHaveClass(/cards-card-canvas__card--selected/);
    await expect(
      page.locator('.cards-card-canvas__card--selected')
    ).toHaveCount(0);
    await expect(page.locator('[data-card-selected-display]')).toBeEmpty();

    await firstCard.locator('.cards-card-canvas__card-content').click();
    await expect(firstCard).toHaveClass(/cards-card-canvas__card--selected/);
    await expect(page.locator('[data-card-selected-display]')).toHaveText(
      'card-1'
    );

    await addCard(page, 'Card B', 'Content B');

    await expect(firstCard).toHaveClass(/cards-card-canvas__card--selected/);
    await expect(
      page.locator('[data-card-id="card-2"]')
    ).not.toHaveClass(/cards-card-canvas__card--selected/);
    await expect(page.locator('[data-card-selected-display]')).toHaveText(
      'card-1'
    );
  });

  test('does not create cards or change selection when title or content is empty', async ({
    page,
  }) => {
    await page.locator('[data-card-title-input]').fill('');
    await page.locator('[data-card-content-input]').fill('');
    await page.getByRole('button', { name: 'Add Card' }).click();

    await expect(page.locator('[data-card-id]')).toHaveCount(0);
    await expect(page.locator('[data-card-data-content]')).toHaveText('[]');
    await expect(page.locator('[data-card-selected-display]')).toBeEmpty();

    await page.locator('[data-card-title-input]').fill('Only Title');
    await page.getByRole('button', { name: 'Add Card' }).click();

    await expect(page.locator('[data-card-id]')).toHaveCount(0);
  });
});

test.describe('CardCanvas selection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('has no selected cards by default', async ({ page }) => {
    await disableOption(page, '[data-card-select-new-card-toggle]');
    await addCard(page, 'Card A', 'Content A');
    await addCard(page, 'Card B', 'Content B');

    await expect(
      page.locator('.cards-card-canvas__card--selected')
    ).toHaveCount(0);
  });

  test('selects a card when its body is clicked and reflects controlled selected state', async ({
    page,
  }) => {
    await addCard(page, 'Card A', 'Content A');
    await addCard(page, 'Card B', 'Content B');

    const secondCard = page.locator('[data-card-id]').nth(1);
    const secondCardContent = secondCard.locator(
      '.cards-card-canvas__card-content'
    );

    await secondCardContent.click();

    await expect(secondCard).toHaveClass(/cards-card-canvas__card--selected/);
    await expect(
      page.locator('.cards-card-canvas__card--selected')
    ).toHaveCount(1);
    await expect(page.locator('[data-card-selected-display]')).toHaveText(
      'card-2'
    );
    await expect(page.locator('[data-card-select-count]')).toHaveText('1');
  });

  test('renders selected cards with an outline without changing border width or content size', async ({
    page,
  }) => {
    await addCard(page, 'Card A', 'Content A');
    await addCard(page, 'Card B', 'Content B');

    const firstCard = page.locator('[data-card-id]').first();
    const secondCard = page.locator('[data-card-id]').nth(1);
    const secondCardContent = secondCard.locator(
      '.cards-card-canvas__card-content'
    );

    const contentBoxBefore = await secondCardContent.boundingBox();
    const requiredContentBoxBefore = expectNotNull(contentBoxBefore);

    await secondCardContent.click();

    await expect(secondCard).toHaveClass(/cards-card-canvas__card--selected/);

    const selectedStyle = await secondCard.evaluate((element) => {
      const style = window.getComputedStyle(element);
      return {
        borderWidth: style.borderWidth,
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
      };
    });

    const unselectedStyle = await firstCard.evaluate((element) => {
      const style = window.getComputedStyle(element);
      return {
        borderWidth: style.borderWidth,
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
      };
    });

    expect(selectedStyle.borderWidth).toBe(unselectedStyle.borderWidth);

    expect(selectedStyle.outlineStyle).not.toBe('none');
    expect(selectedStyle.outlineWidth).not.toBe('0px');

    const contentBoxAfter = await secondCardContent.boundingBox();
    const requiredContentBoxAfter = expectNotNull(contentBoxAfter);
    expect(requiredContentBoxAfter.width).toBeCloseTo(requiredContentBoxBefore.width, 0.5);
    expect(requiredContentBoxAfter.height).toBeCloseTo(requiredContentBoxBefore.height, 0.5);
  });

  test('does not clear selection when clicking the settings panel', async ({
    page,
  }) => {
    await addCard(page, 'Card A', 'Content A');
    await addCard(page, 'Card B', 'Content B');

    const secondCard = page.locator('[data-card-id]').nth(1);
    const secondCardContent = secondCard.locator(
      '.cards-card-canvas__card-content'
    );

    await secondCardContent.click();
    await expect(secondCard).toHaveClass(/cards-card-canvas__card--selected/);

    await page.locator('[data-card-title-input]').click();

    await expect(page.locator('[data-card-selected-display]')).toHaveText(
      'card-2'
    );
    await expect(
      page.locator('.cards-card-canvas__card--selected')
    ).toHaveCount(1);
  });

  test('clears selection when clicking a blank area of the canvas stage', async ({
    page,
  }) => {
    await addCard(page, 'Card A', 'Content A');

    const firstCard = page.locator('[data-card-id]').first();
    const firstCardContent = firstCard.locator(
      '.cards-card-canvas__card-content'
    );

    await firstCardContent.click();
    await expect(firstCard).toHaveClass(/cards-card-canvas__card--selected/);

    const stage = page.locator('.card-canvas-demo-stage');
    const stageBox = await stage.boundingBox();
    const requiredStageBox = expectNotNull(stageBox);

    await page.mouse.click(requiredStageBox.x + 20, requiredStageBox.y + 20);

    await expect(page.locator('[data-card-selected-display]')).toBeEmpty();
    await expect(
      page.locator('.cards-card-canvas__card--selected')
    ).toHaveCount(0);
  });

  test('does not clear selection when clicking inside a card', async ({
    page,
  }) => {
    await addCard(page, 'Card A', 'Content A');

    const firstCard = page.locator('[data-card-id]').first();
    const firstCardContent = firstCard.locator(
      '.cards-card-canvas__card-content'
    );

    await firstCardContent.click();
    await expect(firstCard).toHaveClass(/cards-card-canvas__card--selected/);

    await firstCard.locator('.cards-card-canvas__card-header').click();
    await expect(page.locator('[data-card-selected-display]')).toHaveText(
      'card-1'
    );
    await expect(
      page.locator('.cards-card-canvas__card--selected')
    ).toHaveCount(1);

    await firstCardContent.click();
    await expect(page.locator('[data-card-selected-display]')).toHaveText(
      'card-1'
    );
    await expect(
      page.locator('.cards-card-canvas__card--selected')
    ).toHaveCount(1);

    await firstCard.locator('[data-card-resize-handle]').click();
    await expect(page.locator('[data-card-selected-display]')).toHaveText(
      'card-1'
    );
    await expect(
      page.locator('.cards-card-canvas__card--selected')
    ).toHaveCount(1);
  });
});

test.describe('CardCanvas custom rendering and options', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('renders card title and content through Demo render props', async ({
    page,
  }) => {
    await addCard(page, 'Rendered Title', 'Rendered Content');

    const card = page.locator('[data-card-id]').first();

    await expect(card.locator('[data-card-rendered-title]')).toHaveText(
      'Rendered Title'
    );
    await expect(card.locator('[data-card-rendered-content]')).toHaveText(
      'Rendered Content'
    );
  });

  test('applies zIndex to newly added cards and exposes it in Card Data JSON', async ({
    page,
  }) => {
    await addCard(page, 'Card A', 'Content A');
    await addCard(page, 'Card B', 'Content B');

    const cards = page.locator('[data-card-id]');

    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toHaveCSS('z-index', '1');
    await expect(cards.nth(1)).toHaveCSS('z-index', '2');
    await expect(page.locator('[data-card-data-content]')).toContainText(
      '"zIndex": 1'
    );
  });

  test('hides resize handles on unselected cards when selection is required', async ({
    page,
  }) => {
    await disableOption(page, '[data-card-select-new-card-toggle]');
    await addCard(page, 'Card A', 'Content A');
    await enableOption(page, '[data-card-require-selection-toggle]');

    const { card, handle } = getCardParts(page);

    await expect(handle).toBeHidden();
    await expect(handle).toHaveCSS('display', 'none');

    const content = card.locator('.cards-card-canvas__card-content');
    await content.click();

    await expect(card).toHaveClass(/cards-card-canvas__card--selected/);
    await expect(handle).toBeVisible();
    await expect(handle).not.toHaveCSS('display', 'none');
  });

  test('requires selection before moving or resizing when the option is enabled', async ({
    page,
  }) => {
    await disableOption(page, '[data-card-select-new-card-toggle]');
    await addCard(page, 'Card A', 'Content A');
    await enableOption(page, '[data-card-require-selection-toggle]');

    const { card, handle, header } = getCardParts(page);
    const content = card.locator('.cards-card-canvas__card-content');
    const boxBefore = await getRequiredBox(card);

    await dragLocatorBy(page, header, { x: 80, y: 40 });

    const boxAfterMoveAttempt = await getRequiredBox(card);
    expect(boxAfterMoveAttempt.x).toBeCloseTo(boxBefore.x, -1);
    expect(boxAfterMoveAttempt.y).toBeCloseTo(boxBefore.y, -1);
    expect(boxAfterMoveAttempt.width).toBeCloseTo(boxBefore.width, -1);
    expect(boxAfterMoveAttempt.height).toBeCloseTo(boxBefore.height, -1);

    await expect(handle).toBeHidden();

    await content.click();
    await expect(card).toHaveClass(/cards-card-canvas__card--selected/);

    await dragLocatorBy(page, header, { x: 80, y: 40 });

    const boxAfterSelectedMove = await getRequiredBox(card);
    expect(boxAfterSelectedMove.x).toBeCloseTo(boxBefore.x + 80, -1);
    expect(boxAfterSelectedMove.y).toBeCloseTo(boxBefore.y + 40, -1);

    await dragLocatorBy(page, handle, { x: 50, y: 30 });

    const boxAfterSelectedResize = await getRequiredBox(card);
    expect(boxAfterSelectedResize.width).toBeCloseTo(
      boxAfterSelectedMove.width + 50,
      -1
    );
    expect(boxAfterSelectedResize.height).toBeCloseTo(
      boxAfterSelectedMove.height + 30,
      -1
    );
  });

  test('does not select an unselected card after drag-like content pointer movement when selection is required', async ({
    page,
  }) => {
    await disableOption(page, '[data-card-select-new-card-toggle]');
    await addCard(page, 'Card A', 'Content A');
    await enableOption(page, '[data-card-require-selection-toggle]');

    const card = page.locator('[data-card-id]').first();
    const content = card.locator('.cards-card-canvas__card-content');
    const boxBefore = await getRequiredBox(card);

    // When: drag-like pointer movement on unselected card content
    await dragLocatorBy(page, content, { x: 12, y: 0 });

    const boxAfterMoveAttempt = await getRequiredBox(card);
    expect(boxAfterMoveAttempt.x).toBeCloseTo(boxBefore.x, -1);
    expect(boxAfterMoveAttempt.y).toBeCloseTo(boxBefore.y, -1);

    // Then: drag gesture must NOT select the card
    await expect(card).not.toHaveClass(/cards-card-canvas__card--selected/);
    await expect(page.locator('[data-card-selected-display]')).toBeEmpty();
    await expect(page.locator('[data-card-select-count]')).toHaveText('0');

    // And: a real click should still select
    await content.click();

    await expect(card).toHaveClass(/cards-card-canvas__card--selected/);
    await expect(page.locator('[data-card-selected-display]')).toHaveText(
      'card-1'
    );
    await expect(page.locator('[data-card-select-count]')).toHaveText('1');
  });

  test('selects a card when moving ends and selectOnMoveEnd is enabled', async ({
    page,
  }) => {
    await addCard(page, 'Card A', 'Content A');
    await enableOption(page, '[data-card-select-on-move-end-toggle]');

    const { card, header } = getCardParts(page);

    await dragLocatorBy(page, header, { x: 80, y: 40 });

    await expect(card).toHaveClass(/cards-card-canvas__card--selected/);
    await expect(page.locator('[data-card-selected-display]')).toHaveText(
      'card-1'
    );
  });

  test('does not select a card when resizing ends and selectOnMoveEnd is enabled', async ({
    page,
  }) => {
    await disableOption(page, '[data-card-select-new-card-toggle]');
    await addCard(page, 'Card A', 'Content A');
    await enableOption(page, '[data-card-select-on-move-end-toggle]');

    const { card, handle } = getCardParts(page);

    await dragLocatorBy(page, handle, { x: 80, y: 40 });

    await expect(card).not.toHaveClass(/cards-card-canvas__card--selected/);
    await expect(page.locator('[data-card-selected-display]')).toBeEmpty();
  });

  test('collapses and expands the Current Cards Data content', async ({
    page,
  }) => {
    await addCard(page, 'Card A', 'Content A');

    const toggle = page.locator('[data-card-data-toggle]');
    const content = page.locator('[data-card-data-content]');

    await expect(content).toBeVisible();

    await toggle.click();
    await expect(content).toBeHidden();

    await toggle.click();
    await expect(content).toBeVisible();
  });

  test('renders resize handles without an explicit z-index', async ({ page }) => {
    await addCard(page, 'Card A', 'Content A');

    const { handle } = getCardParts(page);

    await expect(handle).toHaveCSS('z-index', 'auto');
  });
});

test.describe('CardCanvas interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await addCard(page);
  });

  test('resizes from the bottom-right handle without moving the card', async ({
    page,
  }) => {
    const { card, handle } = getCardParts(page);

    const cardBoxBefore = expectNotNull(await card.boundingBox());
    const handleBox = expectNotNull(await handle.boundingBox());

    // Drag the resize handle 80px right and 40px down.
    await page.mouse.move(
      handleBox.x + handleBox.width / 2,
      handleBox.y + handleBox.height / 2
    );
    await page.mouse.down();
    await page.mouse.move(
      handleBox.x + handleBox.width / 2 + 80,
      handleBox.y + handleBox.height / 2 + 40,
      {
        steps: 10,
      }
    );
    await page.mouse.up();

    const cardBoxAfter = expectNotNull(await card.boundingBox());

    // Size should increase by roughly the drag delta.
    expect(cardBoxAfter.width).toBeCloseTo(cardBoxBefore.width + 80, -1);
    expect(cardBoxAfter.height).toBeCloseTo(cardBoxBefore.height + 40, -1);

    // Position should remain unchanged.
    expect(cardBoxAfter.x).toBeCloseTo(cardBoxBefore.x, -1);
    expect(cardBoxAfter.y).toBeCloseTo(cardBoxBefore.y, -1);
  });

  test('moves the card from the header without changing size', async ({
    page,
  }) => {
    const { card, header } = getCardParts(page);

    const cardBoxBefore = expectNotNull(await card.boundingBox());
    const headerBox = expectNotNull(await header.boundingBox());

    // Drag the card header 80px right and 40px down.
    await page.mouse.move(
      headerBox.x + headerBox.width / 2,
      headerBox.y + headerBox.height / 2
    );
    await page.mouse.down();
    await page.mouse.move(
      headerBox.x + headerBox.width / 2 + 80,
      headerBox.y + headerBox.height / 2 + 40,
      {
        steps: 10,
      }
    );
    await page.mouse.up();

    const cardBoxAfter = expectNotNull(await card.boundingBox());

    // Position should shift by roughly the drag delta.
    expect(cardBoxAfter.x).toBeCloseTo(cardBoxBefore.x + 80, -1);
    expect(cardBoxAfter.y).toBeCloseTo(cardBoxBefore.y + 40, -1);

    // Size should remain unchanged.
    expect(cardBoxAfter.width).toBeCloseTo(cardBoxBefore.width, -1);
    expect(cardBoxAfter.height).toBeCloseTo(cardBoxBefore.height, -1);
  });

  test('parent moves descendants by the same drag delta', async ({ page }) => {
    const hierarchyIds = await createPositionedHierarchy(page);

    const beforeCards = await getCardData(page);
    const beforeA = getCardDataById(beforeCards, hierarchyIds.parentId);
    const beforeB = getCardDataById(beforeCards, hierarchyIds.childId);
    const beforeC = getCardDataById(beforeCards, hierarchyIds.grandchildId);
    const delta = { x: 80, y: 40 };

    await dragLocatorBy(
      page,
      page.locator(
        `[data-card-id="${hierarchyIds.parentId}"] .cards-card-canvas__card-header`
      ),
      delta
    );

    const afterCards = await getCardData(page);
    expectCardMovedBy(
      beforeA,
      getCardDataById(afterCards, hierarchyIds.parentId),
      delta
    );
    expectCardMovedBy(
      beforeB,
      getCardDataById(afterCards, hierarchyIds.childId),
      delta
    );
    expectCardMovedBy(
      beforeC,
      getCardDataById(afterCards, hierarchyIds.grandchildId),
      delta
    );
  });

  test('child movement does not move its parent', async ({ page }) => {
    const hierarchyIds = await createPositionedHierarchy(page);

    const beforeCards = await getCardData(page);
    const beforeA = getCardDataById(beforeCards, hierarchyIds.parentId);
    const beforeB = getCardDataById(beforeCards, hierarchyIds.childId);
    const beforeC = getCardDataById(beforeCards, hierarchyIds.grandchildId);
    const delta = { x: 70, y: 30 };

    await dragLocatorBy(
      page,
      page.locator(
        `[data-card-id="${hierarchyIds.childId}"] .cards-card-canvas__card-header`
      ),
      delta
    );

    const afterCards = await getCardData(page);
    const afterA = getCardDataById(afterCards, hierarchyIds.parentId);
    expect(afterA.x).toBeCloseTo(beforeA.x, 5);
    expect(afterA.y).toBeCloseTo(beforeA.y, 5);
    expectCardMovedBy(
      beforeB,
      getCardDataById(afterCards, hierarchyIds.childId),
      delta
    );
    expectCardMovedBy(
      beforeC,
      getCardDataById(afterCards, hierarchyIds.grandchildId),
      delta
    );
  });

  test('resize parent keeps child and grandchild positions unchanged', async ({
    page,
  }) => {
    const hierarchyIds = await createPositionedHierarchy(page);

    const beforeCards = await getCardData(page);
    const beforeA = getCardDataById(beforeCards, hierarchyIds.parentId);
    const beforeB = getCardDataById(beforeCards, hierarchyIds.childId);
    const beforeC = getCardDataById(beforeCards, hierarchyIds.grandchildId);

    await dragLocatorBy(
      page,
      page.locator(`[data-card-id="${hierarchyIds.parentId}"] [data-card-resize-handle]`),
      { x: 60, y: 30 }
    );

    const afterCards = await getCardData(page);
    const afterA = getCardDataById(afterCards, hierarchyIds.parentId);
    const afterB = getCardDataById(afterCards, hierarchyIds.childId);
    const afterC = getCardDataById(afterCards, hierarchyIds.grandchildId);

    expect(afterA.width).toBeCloseTo(beforeA.width + 60, 5);
    expect(afterA.height).toBeCloseTo(beforeA.height + 30, 5);
    expect(afterB.x).toBeCloseTo(beforeB.x, 5);
    expect(afterB.y).toBeCloseTo(beforeB.y, 5);
    expect(afterC.x).toBeCloseTo(beforeC.x, 5);
    expect(afterC.y).toBeCloseTo(beforeC.y, 5);
  });

  test('valid parent candidate gets marker during drag', async ({ page }) => {
    await addCard(page, 'Child', 'Content');

    const card2 = page.locator('[data-card-id="card-2"]');
    const header2 = card2.locator('.cards-card-canvas__card-header');
    await dragLocatorBy(page, header2, { x: 300, y: 300 });

    const card1 = page.locator('[data-card-id="card-1"]');

    await dragCardCenterTo(page, { card: card2, handle: header2 }, card1);

    await expect(card1).toHaveAttribute('data-parent-candidate', 'true');
    await expect(card1).toHaveClass(/cards-card-canvas__card--parent-candidate/);

    await page.mouse.up();

    await expect(card1).not.toHaveAttribute('data-parent-candidate');
  });

  test('self/descendant candidates never get marker', async ({ page }) => {
    await addCardWithParent(page, 'card-1', 'Child', 'Content');

    const card1 = page.locator('[data-card-id="card-1"]');
    const card2 = page.locator('[data-card-id="card-2"]');
    const handle2 = card2.locator('[data-card-resize-handle]');
    const header2 = card2.locator('.cards-card-canvas__card-header');
    await dragLocatorBy(page, handle2, { x: -200, y: -200 });
    await dragCardCenterTo(page, { card: card2, handle: header2 }, card1);
    await page.mouse.up();

    const header1 = card1.locator('.cards-card-canvas__card-header');

    await dragLocatorBy(page, header1, { x: 10, y: 10 });

    await expect(card2).not.toHaveAttribute('data-parent-candidate');
  });

  test('overlapping candidates choose highest zIndex then later array order', async ({ page }) => {
    await addCard(page, 'Card 2', 'Content');

    const card1 = page.locator('[data-card-id="card-1"]');
    const card2 = page.locator('[data-card-id="card-2"]');

    const header2 = card2.locator('.cards-card-canvas__card-header');

    const box1 = await getRequiredBox(card1);
    const box2 = await getRequiredBox(card2);

    await dragLocatorBy(page, header2, { x: box1.x - box2.x, y: box1.y - box2.y });

    await addCard(page, 'Card 3', 'Content');
    const card3 = page.locator('[data-card-id="card-3"]');
    const header3 = card3.locator('.cards-card-canvas__card-header');

    await dragLocatorBy(page, header3, { x: 300, y: 300 });

    await dragCardCenterTo(page, { card: card3, handle: header3 }, card1);

    await expect(card2).toHaveAttribute('data-parent-candidate', 'true');
    await expect(card1).not.toHaveAttribute('data-parent-candidate');

    await page.mouse.up();
  });

  test('attach parent: drag B center into A and release writes B parent', async ({ page }) => {
    await addCard(page, 'Card B', 'Content B');

    const cardA = page.locator('[data-card-id="card-1"]');
    const cardB = page.locator('[data-card-id="card-2"]');
    const headerB = cardB.locator('.cards-card-canvas__card-header');

    await dragLocatorBy(page, headerB, { x: 320, y: 260 });

    await dragCardCenterTo(page, { card: cardB, handle: headerB }, cardA);
    const duringDragB = getCardDataById(await getCardData(page), 'card-2');
    await page.mouse.up();

    const afterCards = await getCardData(page);
    const afterB = getCardDataById(afterCards, 'card-2');

    expect(afterB.parent).toBe('card-1');
    expect(afterB.x).toBeCloseTo(duringDragB.x, 5);
    expect(afterB.y).toBeCloseTo(duringDragB.y, 5);
  });

  test('detach parent: drag B from inside A out to empty space removes parent property', async ({ page }) => {
    await addCardWithParent(page, 'card-1', 'Card B', 'Content B');

    const cardB = page.locator('[data-card-id="card-2"]');
    const headerB = cardB.locator('.cards-card-canvas__card-header');
    const beforeB = getCardDataById(await getCardData(page), 'card-2');
    const delta = { x: 520, y: 280 };

    await dragLocatorBy(page, headerB, delta);

    const cards = await getCardData(page);
    const cardAfterDetach = getCardDataById(cards, 'card-2');

    expectNoParent(cardAfterDetach);
    expectCardMovedBy(beforeB, cardAfterDetach, delta);
  });

  test('re-parent: drag B from A into C updates B parent to C', async ({ page }) => {
    await addCardWithParent(page, 'card-1', 'Card B', 'Content B');
    await addCard(page, 'Card C', 'Content C');

    const cardB = page.locator('[data-card-id="card-2"]');
    const headerB = cardB.locator('.cards-card-canvas__card-header');
    const cardC = page.locator('[data-card-id="card-3"]');
    const headerC = cardC.locator('.cards-card-canvas__card-header');

    await dragLocatorBy(page, headerC, { x: 520, y: 260 });
    await dragCardCenterTo(page, { card: cardB, handle: headerB }, cardC);
    const duringDragB = getCardDataById(await getCardData(page), 'card-2');
    await page.mouse.up();

    const cards = await getCardData(page);
    const afterB = getCardDataById(cards, 'card-2');
    expect(afterB.parent).toBe('card-3');
    expect(afterB.x).toBeCloseTo(duringDragB.x, 5);
    expect(afterB.y).toBeCloseTo(duringDragB.y, 5);
  });

  test('prevent cycle: dragging A over its descendant keeps A without parent', async ({ page }) => {
    await addCardWithParent(page, 'card-1', 'Card B', 'Content B');

    const cardA = page.locator('[data-card-id="card-1"]');
    const headerA = cardA.locator('.cards-card-canvas__card-header');
    const cardB = page.locator('[data-card-id="card-2"]');
    const headerB = cardB.locator('.cards-card-canvas__card-header');

    await dragCardCenterTo(page, { card: cardB, handle: headerB }, cardA);
    await page.mouse.up();
    await dragLocatorBy(page, headerA, { x: 8, y: 8 });

    const cards = await getCardData(page);
    const cardAfterCycleAttempt = getCardDataById(cards, 'card-1');

    expectNoParent(cardAfterCycleAttempt);
    expect(getCardDataById(cards, 'card-2').parent).toBe('card-1');
  });

  test('attach parent: overlapping candidates choose zIndex winner on release', async ({ page }) => {
    await addCard(page, 'Card 2', 'Content');

    const card1 = page.locator('[data-card-id="card-1"]');
    const card2 = page.locator('[data-card-id="card-2"]');
    const header2 = card2.locator('.cards-card-canvas__card-header');
    const box1 = await getRequiredBox(card1);
    const box2 = await getRequiredBox(card2);

    await dragLocatorBy(page, header2, { x: box1.x - box2.x, y: box1.y - box2.y });

    await addCard(page, 'Card 3', 'Content');
    const card3 = page.locator('[data-card-id="card-3"]');
    const header3 = card3.locator('.cards-card-canvas__card-header');

    await dragLocatorBy(page, header3, { x: 320, y: 260 });
    await dragCardCenterTo(page, { card: card3, handle: header3 }, card1);
    const duringDragCard3 = getCardDataById(await getCardData(page), 'card-3');
    await page.mouse.up();

    const cards = await getCardData(page);
    const afterCard3 = getCardDataById(cards, 'card-3');
    expect(afterCard3.parent).toBe('card-2');
    expect(afterCard3.x).toBeCloseTo(duringDragCard3.x, 5);
    expect(afterCard3.y).toBeCloseTo(duringDragCard3.y, 5);
  });

  test('clamps resize to the minimum card size', async ({ page }) => {
    const { card, handle } = getCardParts(page);

    const handleBox = expectNotNull(await handle.boundingBox());

    // Drag the resize handle far up-left to try to shrink below the minimum.
    await page.mouse.move(
      handleBox.x + handleBox.width / 2,
      handleBox.y + handleBox.height / 2
    );
    await page.mouse.down();
    await page.mouse.move(
      handleBox.x + handleBox.width / 2 - 500,
      handleBox.y + handleBox.height / 2 - 500,
      {
        steps: 10,
      }
    );
    await page.mouse.up();

    const cardBoxAfter = expectNotNull(await card.boundingBox());

    expect(cardBoxAfter.width).toBeGreaterThanOrEqual(79);
    expect(cardBoxAfter.width).toBeLessThanOrEqual(85);
    expect(cardBoxAfter.height).toBeGreaterThanOrEqual(79);
    expect(cardBoxAfter.height).toBeLessThanOrEqual(85);
  });

  test('does not lock card drag after a non-primary button press on the resize handle', async ({
    page,
  }) => {
    const { card, handle } = getCardParts(page);

    const handleBox = expectNotNull(await handle.boundingBox());

    // Right-click on the resize handle and release.
    await page.mouse.move(
      handleBox.x + handleBox.width / 2,
      handleBox.y + handleBox.height / 2
    );
    await page.mouse.down({ button: 'right' });
    await page.mouse.up({ button: 'right' });

    // Card drag from the header should still work afterwards.
    const cardBoxBefore = expectNotNull(await card.boundingBox());
    const header = page.locator('.cards-card-canvas__card-header').first();
    const headerBox = expectNotNull(await header.boundingBox());

    await page.mouse.move(
      headerBox.x + headerBox.width / 2,
      headerBox.y + headerBox.height / 2
    );
    await page.mouse.down();
    await page.mouse.move(
      headerBox.x + headerBox.width / 2 + 60,
      headerBox.y + headerBox.height / 2 + 40,
      { steps: 10 }
    );
    await page.mouse.up();

    const cardBoxAfter = expectNotNull(await card.boundingBox());
    expect(cardBoxAfter.x).toBeCloseTo(cardBoxBefore.x + 60, -1);
    expect(cardBoxAfter.y).toBeCloseTo(cardBoxBefore.y + 40, -1);
  });
});

test.describe('CardCanvas pointer-based parent grouping', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('marks parent candidate during drag when pointer is inside parent but card center is outside', async ({
    page,
  }) => {
    await addCard(page, 'Parent', 'Content');
    const card1 = page.locator('[data-card-id="card-1"]');
    const header1 = card1.locator('.cards-card-canvas__card-header');
    await dragLocatorBy(page, header1, { x: 300, y: 300 });
    const box1 = await getRequiredBox(card1);

    await addCard(page, 'Child', 'Content');
    const card2 = page.locator('[data-card-id="card-2"]');
    const header2 = card2.locator('.cards-card-canvas__card-header');

    // Pointer near the bottom of card-1: inside the parent.
    // The dragged card sits mostly below card-1, so its center is outside.
    const pointerTarget = {
      x: box1.x + box1.width / 2,
      y: box1.y + box1.height - 20,
    };
    await dragHandleToPoint(page, header2, pointerTarget);

    await expect(card1).toHaveAttribute('data-parent-candidate', 'true');
    await expect(card1).toHaveClass(/cards-card-canvas__card--parent-candidate/);

    await page.mouse.up();
  });

  test('does not mark parent candidate during drag when card center is inside parent but pointer is outside', async ({
    page,
  }) => {
    await addCard(page, 'Parent', 'Content');
    const card1 = page.locator('[data-card-id="card-1"]');
    const header1 = card1.locator('.cards-card-canvas__card-header');
    await dragLocatorBy(page, header1, { x: 300, y: 300 });
    const box1 = await getRequiredBox(card1);

    await addCard(page, 'Child', 'Content');
    const card2 = page.locator('[data-card-id="card-2"]');
    const header2 = card2.locator('.cards-card-canvas__card-header');

    // Pointer above card-1: outside the parent.
    // The dragged card extends downward so its center is still inside card-1.
    const pointerTarget = {
      x: box1.x + box1.width / 2,
      y: box1.y - 20,
    };
    await dragHandleToPoint(page, header2, pointerTarget);

    await expect(card1).not.toHaveAttribute('data-parent-candidate');
    await expect(card1).not.toHaveClass(/cards-card-canvas__card--parent-candidate/);

    await page.mouse.up();
  });

  test('assigns parent on release when pointer is inside parent but card center is outside', async ({
    page,
  }) => {
    await addCard(page, 'Parent', 'Content');
    const card1 = page.locator('[data-card-id="card-1"]');
    const header1 = card1.locator('.cards-card-canvas__card-header');
    await dragLocatorBy(page, header1, { x: 300, y: 300 });
    const box1 = await getRequiredBox(card1);

    await addCard(page, 'Child', 'Content');
    const card2 = page.locator('[data-card-id="card-2"]');
    const header2 = card2.locator('.cards-card-canvas__card-header');

    const pointerTarget = {
      x: box1.x + box1.width / 2,
      y: box1.y + box1.height - 20,
    };
    await dragHandleToPoint(page, header2, pointerTarget);
    await page.mouse.up();

    const cards = await getCardData(page);
    const child = getCardDataById(cards, 'card-2');
    expect(child.parent).toBe('card-1');
  });

  test('does not assign parent on release when card center is inside parent but pointer is outside', async ({
    page,
  }) => {
    await addCard(page, 'Parent', 'Content');
    const card1 = page.locator('[data-card-id="card-1"]');
    const header1 = card1.locator('.cards-card-canvas__card-header');
    await dragLocatorBy(page, header1, { x: 300, y: 300 });
    const box1 = await getRequiredBox(card1);

    await addCard(page, 'Child', 'Content');
    const card2 = page.locator('[data-card-id="card-2"]');
    const header2 = card2.locator('.cards-card-canvas__card-header');

    const pointerTarget = {
      x: box1.x + box1.width / 2,
      y: box1.y - 20,
    };
    await dragHandleToPoint(page, header2, pointerTarget);
    await page.mouse.up();

    const cards = await getCardData(page);
    const child = getCardDataById(cards, 'card-2');
    expectNoParent(child);
  });
});

test.describe('CardCanvas hierarchy regressions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('requires selection before moving a parent hierarchy when the option is enabled', async ({
    page,
  }) => {
    const hierarchyIds = await createPositionedHierarchy(page);
    await clearSelectionFromCanvas(page);
    await enableOption(page, '[data-card-require-selection-toggle]');

    const beforeCards = await getCardData(page);
    const beforeParent = getCardDataById(beforeCards, hierarchyIds.parentId);
    const beforeChild = getCardDataById(beforeCards, hierarchyIds.childId);
    const beforeGrandchild = getCardDataById(beforeCards, hierarchyIds.grandchildId);
    const parentCard = page.locator(`[data-card-id="${hierarchyIds.parentId}"]`);
    const parentHandle = parentCard.locator('[data-card-resize-handle]');

    await expect(parentHandle).toBeHidden();
    await dragLocatorBy(
      page,
      parentCard.locator('.cards-card-canvas__card-header'),
      { x: 80, y: 40 }
    );

    const afterCards = await getCardData(page);
    const afterParent = getCardDataById(afterCards, hierarchyIds.parentId);
    const afterChild = getCardDataById(afterCards, hierarchyIds.childId);
    const afterGrandchild = getCardDataById(afterCards, hierarchyIds.grandchildId);

    expectCardPositionUnchanged(beforeParent, afterParent);
    expectCardPositionUnchanged(beforeChild, afterChild);
    expectCardPositionUnchanged(beforeGrandchild, afterGrandchild);
    expect(afterParent.width).toBeCloseTo(beforeParent.width, 5);
    expect(afterParent.height).toBeCloseTo(beforeParent.height, 5);
    expect(afterChild.parent).toBe(hierarchyIds.parentId);
    expect(afterGrandchild.parent).toBe(hierarchyIds.childId);
    await expect(page.locator('[data-card-selected-display]')).toBeEmpty();
  });

  test('moves selected parent and descendants when selection is required', async ({
    page,
  }) => {
    const hierarchyIds = await createPositionedHierarchy(page);
    await enableOption(page, '[data-card-require-selection-toggle]');
    await selectCardByContent(page, hierarchyIds.parentId);

    const beforeCards = await getCardData(page);
    const beforeParent = getCardDataById(beforeCards, hierarchyIds.parentId);
    const beforeChild = getCardDataById(beforeCards, hierarchyIds.childId);
    const beforeGrandchild = getCardDataById(beforeCards, hierarchyIds.grandchildId);
    const delta = { x: 80, y: 40 };

    await dragLocatorBy(
      page,
      page.locator(
        `[data-card-id="${hierarchyIds.parentId}"] .cards-card-canvas__card-header`
      ),
      delta
    );

    const afterCards = await getCardData(page);
    const afterChild = getCardDataById(afterCards, hierarchyIds.childId);
    const afterGrandchild = getCardDataById(afterCards, hierarchyIds.grandchildId);

    expectCardMovedBy(
      beforeParent,
      getCardDataById(afterCards, hierarchyIds.parentId),
      delta
    );
    expectCardMovedBy(beforeChild, afterChild, delta);
    expectCardMovedBy(beforeGrandchild, afterGrandchild, delta);
    expect(afterChild.parent).toBe(hierarchyIds.parentId);
    expect(afterGrandchild.parent).toBe(hierarchyIds.childId);
  });

  test('selects the dragged hierarchy card after move end when the option is enabled', async ({
    page,
  }) => {
    const hierarchyIds = await createPositionedHierarchy(page);
    await clearSelectionFromCanvas(page);
    await enableOption(page, '[data-card-select-on-move-end-toggle]');

    const beforeCards = await getCardData(page);
    const beforeChild = getCardDataById(beforeCards, hierarchyIds.childId);
    const beforeGrandchild = getCardDataById(beforeCards, hierarchyIds.grandchildId);
    const selectCountBefore = Number.parseInt(
      await page.locator('[data-card-select-count]').innerText(),
      10
    );
    const delta = { x: 20, y: 10 };

    await dragLocatorBy(
      page,
      page.locator(
        `[data-card-id="${hierarchyIds.childId}"] .cards-card-canvas__card-header`
      ),
      delta
    );

    const afterCards = await getCardData(page);
    const afterChild = getCardDataById(afterCards, hierarchyIds.childId);
    const afterGrandchild = getCardDataById(afterCards, hierarchyIds.grandchildId);

    expectCardMovedBy(beforeChild, afterChild, delta);
    expectCardMovedBy(beforeGrandchild, afterGrandchild, delta);
    expect(afterChild.parent).toBe(hierarchyIds.parentId);
    expect(afterGrandchild.parent).toBe(hierarchyIds.childId);
    await expect(page.locator('[data-card-selected-display]')).toHaveText(
      hierarchyIds.childId
    );
    const selectCountAfter = Number.parseInt(
      await page.locator('[data-card-select-count]').innerText(),
      10
    );
    expect(selectCountAfter).toBeGreaterThan(selectCountBefore);
  });

  test('keeps selection stable after drag-like content and header movement in a hierarchy', async ({
    page,
  }) => {
    const hierarchyIds = await createPositionedHierarchy(page);
    await enableOption(page, '[data-card-require-selection-toggle]');
    await selectCardByContent(page, hierarchyIds.parentId);

    const childCard = page.locator(`[data-card-id="${hierarchyIds.childId}"]`);
    const childContent = childCard.locator('.cards-card-canvas__card-content');
    const childHeader = childCard.locator('.cards-card-canvas__card-header');
    const beforeCards = await getCardData(page);
    const beforeChild = getCardDataById(beforeCards, hierarchyIds.childId);

    await dragLocatorBy(page, childContent, { x: 12, y: 0 });
    await dragLocatorBy(page, childHeader, { x: 12, y: 0 });

    const afterCards = await getCardData(page);
    const afterChild = getCardDataById(afterCards, hierarchyIds.childId);

    expectCardPositionUnchanged(beforeChild, afterChild);
    expect(afterChild.parent).toBe(hierarchyIds.parentId);
    await expect(page.locator('[data-card-selected-display]')).toHaveText(
      hierarchyIds.parentId
    );
    await expect(childCard).not.toHaveClass(/cards-card-canvas__card--selected/);
  });

  test('keeps resize independent from parent attachment and child movement', async ({
    page,
  }) => {
    const hierarchyIds = await createPositionedHierarchy(page);
    await enableOption(page, '[data-card-require-selection-toggle]');
    await selectCardByContent(page, hierarchyIds.parentId);

    const beforeCards = await getCardData(page);
    const beforeParent = getCardDataById(beforeCards, hierarchyIds.parentId);
    const beforeChild = getCardDataById(beforeCards, hierarchyIds.childId);
    const beforeGrandchild = getCardDataById(beforeCards, hierarchyIds.grandchildId);
    const parentCard = page.locator(`[data-card-id="${hierarchyIds.parentId}"]`);

    await dragLocatorBy(page, parentCard.locator('[data-card-resize-handle]'), {
      x: 60,
      y: 30,
    });

    const afterCards = await getCardData(page);
    const afterParent = getCardDataById(afterCards, hierarchyIds.parentId);
    const afterChild = getCardDataById(afterCards, hierarchyIds.childId);
    const afterGrandchild = getCardDataById(afterCards, hierarchyIds.grandchildId);

    expect(afterParent.width).toBeCloseTo(beforeParent.width + 60, 5);
    expect(afterParent.height).toBeCloseTo(beforeParent.height + 30, 5);
    expectNoParent(afterParent);
    expectCardPositionUnchanged(beforeChild, afterChild);
    expectCardPositionUnchanged(beforeGrandchild, afterGrandchild);
    expect(afterChild.parent).toBe(hierarchyIds.parentId);
    expect(afterGrandchild.parent).toBe(hierarchyIds.childId);
    await expect(parentCard).not.toHaveAttribute('data-parent-candidate');
  });
});

test.describe('CardCanvas Delete Selected', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('leaf delete: select a single card, click delete, assert card gone and selection cleared', async ({ page }) => {
    await addCard(page, 'Card A', 'Content A');
    await addCard(page, 'Card B', 'Content B');

    const firstCard = page.locator('[data-card-id="card-1"]');
    const secondCard = page.locator('[data-card-id="card-2"]');

    await expect(firstCard).toBeVisible();
    await expect(secondCard).toBeVisible();

    const header2 = secondCard.locator('.cards-card-canvas__card-header');
    await dragLocatorBy(page, header2, { x: 300, y: 0 });

    await firstCard.locator('.cards-card-canvas__card-content').dispatchEvent('click');
    await expect(firstCard).toHaveClass(/cards-card-canvas__card--selected/);

    await page.getByTestId('delete-selected-card').click();
    await expect(firstCard).toHaveCount(0);
    await expect(secondCard).toBeVisible();

    await expect(page.locator('[data-card-selected-display]')).toBeEmpty();
  });

  test('parent cascade with dialog accept: create A with child B, select A, accept confirm, assert A/B gone and unrelated card remains', async ({ page }) => {
    await addCard(page, 'Card A', 'Content A');
    await addCardWithParent(page, 'card-1', 'Card B', 'Content B');

    const cardA = page.locator('[data-card-id="card-1"]');
    const cardB = page.locator('[data-card-id="card-2"]');

    await cardA.locator('.cards-card-canvas__card-content').dispatchEvent('click');
    await expect(cardA).toHaveClass(/cards-card-canvas__card--selected/);

    await disableOption(page, '[data-card-select-new-card-toggle]');
    await addCard(page, 'Card C', 'Content C');
    const cardC = page.locator('[data-card-id="card-3"]');
    await expect(page.locator('[data-card-selected-display]')).toHaveText('card-1');

    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toBe('Delete this card and its child cards?');
      await dialog.accept();
    });
    await page.getByTestId('delete-selected-card').click();

    await expect(cardA).toHaveCount(0);
    await expect(cardB).toHaveCount(0);
    await expect(cardC).toBeVisible();

    await expect(page.locator('[data-card-selected-display]')).toBeEmpty();
  });

  test('parent delete abort with dialog dismiss: same setup, dismiss confirm, assert A/B and selection unchanged', async ({ page }) => {
    await addCard(page, 'Card A', 'Content A');
    await addCardWithParent(page, 'card-1', 'Card B', 'Content B');

    const cardA = page.locator('[data-card-id="card-1"]');
    const cardB = page.locator('[data-card-id="card-2"]');

    await cardA.locator('.cards-card-canvas__card-content').dispatchEvent('click');
    await expect(cardA).toHaveClass(/cards-card-canvas__card--selected/);

    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toBe('Delete this card and its child cards?');
      await dialog.dismiss();
    });
    await page.getByTestId('delete-selected-card').click();

    await expect(cardA).toBeVisible();
    await expect(cardB).toBeVisible();

    await expect(page.locator('[data-card-selected-display]')).toHaveText('card-1');
  });

  test('selection cleanup after successful delete: assert data-card-selected-display reflects cleared selection', async ({ page }) => {
    await addCard(page, 'Card A', 'Content A');
    const firstCard = page.locator('[data-card-id="card-1"]');

    await firstCard.locator('.cards-card-canvas__card-content').click();
    await expect(page.locator('[data-card-selected-display]')).toHaveText('card-1');

    await page.getByTestId('delete-selected-card').click();

    await expect(firstCard).toHaveCount(0);
    await expect(page.locator('[data-card-selected-display]')).toBeEmpty();
  });
});
