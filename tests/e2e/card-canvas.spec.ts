import { test, expect, type Locator, type Page } from '@playwright/test';

type DragDelta = {
  readonly x: number;
  readonly y: number;
};

async function addCard(
  page: Page,
  title = 'Test Card',
  content = 'Test content'
) {
  await page.locator('[data-card-title-input]').fill(title);
  await page.locator('[data-card-content-input]').fill(content);
  await page.getByRole('button', { name: 'Add Card' }).click();
}

// Helper to locate the first card and its parts.
function getCardParts(page: Page) {
  const card = page.locator('[data-card-id]').first();
  const handle = card.locator('[data-card-resize-handle]');
  const header = card.locator('.cards-card-canvas__card-header');
  return { card, handle, header };
}

async function getRequiredBox(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) {
    throw new Error('Expected locator to have a bounding box');
  }
  return box;
}

async function dragLocatorBy(
  page: Page,
  locator: Locator,
  delta: DragDelta
) {
  const box = await getRequiredBox(locator);
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + delta.x, startY + delta.y, { steps: 10 });
  await page.mouse.up();
}

async function enableOption(page: Page, selector: string) {
  const option = page.locator(selector);
  await expect(option).toBeVisible();
  await option.check();
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

    expect(demoBox).not.toBeNull();
    expect(settingsBox).not.toBeNull();
    expect(stageBox).not.toBeNull();

    // Sidebar must stay exactly 240px wide.
    expect(settingsBox!.width).toBe(240);

    // The demo container should span nearly the full viewport width (minus padding).
    expect(demoBox!.width).toBeGreaterThan(1000);

    // The stage must fill the remaining horizontal space (tolerant of section padding/gap).
    expect(stageBox!.width).toBeGreaterThan(800);
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

test.describe('CardCanvas selection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('has no selected cards by default', async ({ page }) => {
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
    expect(contentBoxBefore).not.toBeNull();

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
    expect(contentBoxAfter).not.toBeNull();
    expect(contentBoxAfter!.width).toBeCloseTo(contentBoxBefore!.width, 0.5);
    expect(contentBoxAfter!.height).toBeCloseTo(contentBoxBefore!.height, 0.5);
  });

  test('clears selection when clicking the settings panel', async ({
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

    await expect(page.locator('[data-card-selected-display]')).toBeEmpty();
    await expect(
      page.locator('.cards-card-canvas__card--selected')
    ).toHaveCount(0);
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
    expect(stageBox).not.toBeNull();

    await page.mouse.click(stageBox!.x + 20, stageBox!.y + 20);

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

    const cardBoxBefore = await card.boundingBox();
    const handleBox = await handle.boundingBox();
    expect(cardBoxBefore).not.toBeNull();
    expect(handleBox).not.toBeNull();

    // Drag the resize handle 80px right and 40px down.
    await page.mouse.move(
      handleBox!.x + handleBox!.width / 2,
      handleBox!.y + handleBox!.height / 2
    );
    await page.mouse.down();
    await page.mouse.move(
      handleBox!.x + handleBox!.width / 2 + 80,
      handleBox!.y + handleBox!.height / 2 + 40,
      {
        steps: 10,
      }
    );
    await page.mouse.up();

    const cardBoxAfter = await card.boundingBox();
    expect(cardBoxAfter).not.toBeNull();

    // Size should increase by roughly the drag delta.
    expect(cardBoxAfter!.width).toBeCloseTo(cardBoxBefore!.width + 80, -1);
    expect(cardBoxAfter!.height).toBeCloseTo(cardBoxBefore!.height + 40, -1);

    // Position should remain unchanged.
    expect(cardBoxAfter!.x).toBeCloseTo(cardBoxBefore!.x, -1);
    expect(cardBoxAfter!.y).toBeCloseTo(cardBoxBefore!.y, -1);
  });

  test('moves the card from the header without changing size', async ({
    page,
  }) => {
    const { card, header } = getCardParts(page);

    const cardBoxBefore = await card.boundingBox();
    const headerBox = await header.boundingBox();
    expect(cardBoxBefore).not.toBeNull();
    expect(headerBox).not.toBeNull();

    // Drag the card header 80px right and 40px down.
    await page.mouse.move(
      headerBox!.x + headerBox!.width / 2,
      headerBox!.y + headerBox!.height / 2
    );
    await page.mouse.down();
    await page.mouse.move(
      headerBox!.x + headerBox!.width / 2 + 80,
      headerBox!.y + headerBox!.height / 2 + 40,
      {
        steps: 10,
      }
    );
    await page.mouse.up();

    const cardBoxAfter = await card.boundingBox();
    expect(cardBoxAfter).not.toBeNull();

    // Position should shift by roughly the drag delta.
    expect(cardBoxAfter!.x).toBeCloseTo(cardBoxBefore!.x + 80, -1);
    expect(cardBoxAfter!.y).toBeCloseTo(cardBoxBefore!.y + 40, -1);

    // Size should remain unchanged.
    expect(cardBoxAfter!.width).toBeCloseTo(cardBoxBefore!.width, -1);
    expect(cardBoxAfter!.height).toBeCloseTo(cardBoxBefore!.height, -1);
  });

  test('clamps resize to the minimum card size', async ({ page }) => {
    const { card, handle } = getCardParts(page);

    const handleBox = await handle.boundingBox();
    expect(handleBox).not.toBeNull();

    // Drag the resize handle far up-left to try to shrink below the minimum.
    await page.mouse.move(
      handleBox!.x + handleBox!.width / 2,
      handleBox!.y + handleBox!.height / 2
    );
    await page.mouse.down();
    await page.mouse.move(
      handleBox!.x + handleBox!.width / 2 - 500,
      handleBox!.y + handleBox!.height / 2 - 500,
      {
        steps: 10,
      }
    );
    await page.mouse.up();

    const cardBoxAfter = await card.boundingBox();
    expect(cardBoxAfter).not.toBeNull();

    expect(cardBoxAfter!.width).toBeGreaterThanOrEqual(79);
    expect(cardBoxAfter!.width).toBeLessThanOrEqual(85);
    expect(cardBoxAfter!.height).toBeGreaterThanOrEqual(79);
    expect(cardBoxAfter!.height).toBeLessThanOrEqual(85);
  });

  test('does not lock card drag after a non-primary button press on the resize handle', async ({
    page,
  }) => {
    const { card, handle } = getCardParts(page);

    const handleBox = await handle.boundingBox();
    expect(handleBox).not.toBeNull();

    // Right-click on the resize handle and release.
    await page.mouse.move(
      handleBox!.x + handleBox!.width / 2,
      handleBox!.y + handleBox!.height / 2
    );
    await page.mouse.down({ button: 'right' });
    await page.mouse.up({ button: 'right' });

    // Card drag from the header should still work afterwards.
    const cardBoxBefore = await card.boundingBox();
    const header = page.locator('.cards-card-canvas__card-header').first();
    const headerBox = await header.boundingBox();
    expect(cardBoxBefore).not.toBeNull();
    expect(headerBox).not.toBeNull();

    await page.mouse.move(
      headerBox!.x + headerBox!.width / 2,
      headerBox!.y + headerBox!.height / 2
    );
    await page.mouse.down();
    await page.mouse.move(
      headerBox!.x + headerBox!.width / 2 + 60,
      headerBox!.y + headerBox!.height / 2 + 40,
      { steps: 10 }
    );
    await page.mouse.up();

    const cardBoxAfter = await card.boundingBox();
    expect(cardBoxAfter).not.toBeNull();
    expect(cardBoxAfter!.x).toBeCloseTo(cardBoxBefore!.x + 60, -1);
    expect(cardBoxAfter!.y).toBeCloseTo(cardBoxBefore!.y + 40, -1);
  });
});
