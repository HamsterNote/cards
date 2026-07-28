import { expect, test } from '@playwright/test';
import {
  addCard,
  disableOption,
  dragLocatorBy,
  enableOption,
  expectCardPositionUnchanged,
  getCardData,
  getCardDataById,
  getRequiredBox,
} from './helpers';

test.describe('CardCanvas appearance and interaction boundaries', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('applies a selected palette color and compact embedded note spacing', async ({
    page,
  }) => {
    // Given: a selected card is rendered with the default color palette.
    await addCard(page, 'Palette card', 'Compact note body');
    const palette = page.getByRole('group', { name: '卡片颜色' });
    await expect(palette.locator('[data-card-color-option]')).toHaveCount(5);
    await expect(
      page.locator('.cards-card-canvas__embedded-note .hn-note-body')
    ).toHaveCSS('padding', '12px');

    // When: the user chooses purple.
    const purple = palette.getByRole('button', { name: '紫色' });
    await purple.click();

    // Then: the card persists the color and derives its visible surfaces from it.
    await expect(purple).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-card-data-content]')).toContainText(
      '"themeColor": "#8b5cf6"'
    );
    const card = page.locator('[data-card-id="card-1"]');
    await expect(card.locator('.cards-card-canvas__card-header')).toHaveCSS(
      'background-color',
      'rgb(139, 92, 246)'
    );
    await expect(card.locator('.cards-card-canvas__card-header')).toHaveCSS(
      'color',
      'rgb(0, 0, 0)'
    );
    await card.locator('.cards-card-canvas__card-header').click();
    const rose = palette.getByRole('button', { name: '玫红' });
    await rose.click();
    await expect(card.locator('.cards-card-canvas__card-header')).toHaveCSS(
      'color',
      'rgb(255, 255, 255)'
    );
    const lightBodyColor = await card
      .locator('.cards-card-canvas__card-content')
      .evaluate((element) => getComputedStyle(element).backgroundColor);
    await enableOption(page, '[data-card-dark-theme-toggle]');
    const darkBodyColor = await card
      .locator('.cards-card-canvas__card-content')
      .evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(darkBodyColor).not.toBe(lightBodyColor);
  });

  test('moves a card from its header but not from its body', async ({
    page,
  }) => {
    // Given: a card uses the host-rendered content path without an embedded note wrapper.
    await addCard(page, 'Drag boundary', 'Body must stay still');
    await disableOption(page, '[data-card-editable-toggle]');
    const card = page.locator('[data-card-id="card-1"]');
    const before = getCardDataById(await getCardData(page), 'card-1');

    // When: the user drags from the card body.
    await dragLocatorBy(
      page,
      card.locator('.cards-card-canvas__card-content'),
      { x: 90, y: 50 }
    );

    // Then: the position is unchanged, while the title remains the movement handle.
    const afterBodyDrag = getCardDataById(await getCardData(page), 'card-1');
    expectCardPositionUnchanged(before, afterBodyDrag);
    await dragLocatorBy(page, card.locator('.cards-card-canvas__card-header'), {
      x: 90,
      y: 50,
    });
    const afterHeaderDrag = getCardDataById(await getCardData(page), 'card-1');
    expect(afterHeaderDrag.x).toBeCloseTo(before.x + 90, 5);
    expect(afterHeaderDrag.y).toBeCloseTo(before.y + 50, 5);
  });

  test('starts a link drag from inert card content while link mode is active', async ({
    page,
  }) => {
    // Given: link mode is active on a card with host-rendered body content.
    await addCard(page, 'Link source', 'Body starts links');
    await disableOption(page, '[data-card-editable-toggle]');
    await enableOption(page, '[data-card-link-mode-toggle]');
    const card = page.locator('[data-card-id="card-1"]');
    const content = card.locator('.cards-card-canvas__card-content');

    // When: the user drags from the body.
    const contentBox = await getRequiredBox(content);
    await page.mouse.move(
      contentBox.x + contentBox.width / 2,
      contentBox.y + contentBox.height / 2
    );
    await page.mouse.down();
    await page.mouse.move(
      contentBox.x + contentBox.width / 2 + 40,
      contentBox.y + contentBox.height / 2 + 20,
      { steps: 6 }
    );

    // Then: body input stays inert while the card surface starts the link drag.
    await expect(content).toHaveCSS('pointer-events', 'none');
    await expect(content).toHaveCSS('user-select', 'none');
    await expect(card).toHaveClass(/cards-card-canvas__card--link-source/);
    await expect(
      page.locator('.cards-card-canvas__link-drag-overlay')
    ).toHaveCount(1);
    await page.mouse.up();
  });
});
