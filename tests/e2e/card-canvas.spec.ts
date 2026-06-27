import { test, expect, type Page } from '@playwright/test';

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
