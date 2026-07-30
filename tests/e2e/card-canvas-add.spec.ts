import { expect, test } from '@playwright/test';

test('creates a visible draft when the empty canvas toolbar add button is clicked', async ({
  page,
}) => {
  // Given: the user opens an empty canvas without preparing the Demo side form.
  await page.goto('/?onSelect=false');
  const addButton = page.locator('[data-card-canvas-add-button]');
  await expect(page.locator('[data-card-id]')).toHaveCount(0);

  // When: the user directly activates the bottom toolbar add action.
  await expect(addButton).toBeEnabled();
  await addButton.click();

  // Then: one draft card is visible and its title editor receives keyboard focus.
  const card = page.locator('[data-card-id]');
  await expect(card).toHaveCount(1);
  await expect(card).toBeInViewport();
  await expect(card.locator('[data-card-title-edit]')).toBeFocused();
});

test('preserves an untouched empty card after selection leaves it', async ({
  page,
}) => {
  // Given: the toolbar created a selected blank card.
  await page.goto('/?onSelect=false');
  await page.locator('[data-card-canvas-add-button]').click();
  await expect(page.locator('[data-card-id]')).toHaveCount(1);

  // When: the user clicks a blank area of the canvas.
  const stage = page.locator('.card-canvas-demo-stage');
  const box = await stage.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) throw new Error('Expected canvas stage bounds');
  await page.mouse.click(box.x + 20, box.y + 20);

  // Then: the untouched empty card remains on the canvas.
  await expect(page.locator('[data-card-id]')).toHaveCount(1);
});
