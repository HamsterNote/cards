import { expect, test } from '@playwright/test';
import {
  addCard,
  disableOption,
  dragLocatorBy,
  enableOption,
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
      '"themeColor": "#a78bfa"'
    );
    const card = page.locator('[data-card-id="card-1"]');
    await expect(card.locator('.cards-card-canvas__card-header')).toHaveCSS(
      'background-color',
      'rgb(167, 139, 250)'
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
      'rgb(0, 0, 0)'
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

  test('moves a card from its body and prevents body text selection', async ({
    page,
  }) => {
    // Given: an editable card is unselected so its Popover cannot cover the body drag target.
    await addCard(page, 'Drag boundary', 'Body must stay still');
    const card = page.locator('[data-card-id="card-1"]');
    await page
      .locator('.card-canvas-demo-stage')
      .click({ position: { x: 20, y: 20 } });
    await expect(page.locator('[data-card-selected-display]')).toBeEmpty();
    const before = getCardDataById(await getCardData(page), 'card-1');
    const beforePosition = { x: before.x, y: before.y };

    // When: the user drags from the card body.
    await dragLocatorBy(
      page,
      card.locator('.cards-card-canvas__card-content'),
      { x: 90, y: 50 }
    );

    // Then: the whole card moves and its read-only body cannot start a text selection.
    const afterBodyDrag = getCardDataById(await getCardData(page), 'card-1');
    expect(afterBodyDrag.x).toBeCloseTo(beforePosition.x + 90, 5);
    expect(afterBodyDrag.y).toBeCloseTo(beforePosition.y + 50, 5);
    await expect(card.locator('.cards-card-canvas__card-content')).toHaveCSS(
      'user-select',
      'none'
    );
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

  test('keeps host interactive controls out of the whole-card drag surface', async ({
    page,
  }) => {
    // Given: a host-rendered button lives inside an editable card body.
    await addCard(page, 'Interactive boundary', 'Host content');
    const card = page.locator('[data-card-id="card-1"]');
    await page.evaluate(() => {
      const content = document.querySelector(
        '[data-card-id="card-1"] .cards-card-canvas__card-content'
      );
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Host action';
      button.dataset.hostAction = '';
      button.addEventListener('click', () => {
        button.dataset.clicked = 'true';
      });
      content?.append(button);
    });
    const hostAction = card.locator('[data-host-action]');
    const before = getCardDataById(await getCardData(page), 'card-1');

    // When: the host control is clicked and then receives a drag gesture.
    await hostAction.click();
    await dragLocatorBy(page, hostAction, { x: 70, y: 35 });

    // Then: the control remains interactive and the card model does not move.
    await expect(hostAction).toHaveAttribute('data-clicked', 'true');
    const after = getCardDataById(await getCardData(page), 'card-1');
    expect(after.x).toBeCloseTo(before.x, 5);
    expect(after.y).toBeCloseTo(before.y, 5);
  });
});
