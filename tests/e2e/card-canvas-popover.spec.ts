import { expect, test, type Page } from '@playwright/test';
import { CARD_CANVAS_POPOVER_OVERLAY_ATTRIBUTE } from '../../src/utils/card-popover-interactions';
import { addCard, getCardData, getCardDataById, getRequiredBox } from './helpers';

async function clickBlankCanvas(page: Page): Promise<void> {
  const stageBox = await getRequiredBox(
    page.locator('.card-canvas-demo-stage')
  );
  await page.mouse.click(stageBox.x + 20, stageBox.y + 20);
}

test.describe('CardCanvas popover interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('keeps selection when clicking an aria-associated portaled overlay from the popover', async ({
    page,
  }) => {
    // Given: a selected card is showing its renderPopover.
    await addCard(page, 'Card A', 'Content A');
    await expect(page.locator('.cards-card-canvas__popover')).toBeVisible();
    await expect(page.locator('[data-card-selected-display]')).toHaveText(
      'card-1'
    );

    await page.evaluate(() => {
      const popover = document.querySelector('.cards-card-canvas__popover');
      if (!(popover instanceof HTMLElement)) {
        throw new Error('Expected card popover to exist');
      }

      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.textContent = 'Test Select Trigger';
      trigger.setAttribute('aria-controls', 'card-canvas-test-listbox');
      popover.append(trigger);

      const overlay = document.createElement('div');
      overlay.id = 'card-canvas-test-listbox';
      overlay.setAttribute('role', 'listbox');
      overlay.setAttribute('data-testid', 'card-canvas-test-listbox');

      const option = document.createElement('button');
      option.type = 'button';
      option.textContent = 'Mind-map horizontal';
      option.setAttribute('role', 'option');
      option.setAttribute('data-testid', 'card-canvas-test-option');
      overlay.append(option);

      document.body.append(overlay);
    });

    // When: a portaled Select-like option associated with the Popover is clicked.
    await page.getByTestId('card-canvas-test-option').click();

    // Then: the click is treated as part of Popover interaction, so selection remains.
    await expect(page.locator('[data-card-selected-display]')).toHaveText(
      'card-1'
    );
    await expect(page.locator('.cards-card-canvas__popover')).toBeVisible();

    // And: true blank-canvas clicks still close the Popover by clearing selection.
    await clickBlankCanvas(page);
    await expect(page.locator('[data-card-selected-display]')).toBeEmpty();
    await expect(page.locator('.cards-card-canvas__popover')).toHaveCount(0);
  });

  test('allows choosing the Demo child layout select inside the popover', async ({
    page,
  }) => {
    // Given: a selected card is showing the Demo-owned Popover controls.
    await addCard(page, 'Card A', 'Content A');
    const layoutSelect = page.locator('[data-card-children-layout-mode-select]');
    await expect(layoutSelect).toBeVisible();
    await expect(layoutSelect).toHaveValue('arrange');

    // When: the native select is opened and changed through normal user input.
    // 默认值是 'arrange'（最后一个选项），ArrowDown 不会循环，所以用 ArrowUp 上移到 'mind-map-horizontal'
    await layoutSelect.click();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');

    // Then: the chosen child-layout mode is written back to Demo card data.
    await expect(layoutSelect).toHaveValue('mind-map-horizontal');
    const card = getCardDataById(await getCardData(page), 'card-1');
    expect(card.childrenLayoutMode).toBe('mind-map-horizontal');
  });

  test('keeps selection when clicking a marked portaled overlay from the popover', async ({
    page,
  }) => {
    // Given: a selected card is showing its renderPopover.
    await addCard(page, 'Card A', 'Content A');
    await expect(page.locator('.cards-card-canvas__popover')).toBeVisible();
    await expect(page.locator('[data-card-selected-display]')).toHaveText(
      'card-1'
    );

    await page.evaluate((overlayAttribute) => {
      const overlay = document.createElement('div');
      overlay.setAttribute(overlayAttribute, '');
      overlay.setAttribute('role', 'listbox');
      overlay.setAttribute('data-testid', 'marked-card-canvas-test-listbox');

      const option = document.createElement('button');
      option.type = 'button';
      option.textContent = 'Marked overlay option';
      option.setAttribute('role', 'option');
      option.setAttribute('data-testid', 'marked-card-canvas-test-option');
      overlay.append(option);

      document.body.append(overlay);
    }, CARD_CANVAS_POPOVER_OVERLAY_ATTRIBUTE);

    // When: a Select-like option inside the marked portal is clicked.
    await page.getByTestId('marked-card-canvas-test-option').click();

    // Then: the explicit overlay marker keeps the interaction inside the Popover boundary.
    await expect(page.locator('[data-card-selected-display]')).toHaveText(
      'card-1'
    );
    await expect(page.locator('.cards-card-canvas__popover')).toBeVisible();

    // And: true blank-canvas clicks still close the Popover by clearing selection.
    await clickBlankCanvas(page);
    await expect(page.locator('[data-card-selected-display]')).toBeEmpty();
    await expect(page.locator('.cards-card-canvas__popover')).toHaveCount(0);
  });

  test('keeps selection when clicking an unassociated body-portaled overlay from the popover', async ({
    page,
  }) => {
    await addCard(page, 'Card A', 'Content A');
    await expect(page.locator('.cards-card-canvas__popover')).toBeVisible();
    await expect(page.locator('[data-card-selected-display]')).toHaveText(
      'card-1'
    );

    await page.evaluate(() => {
      const overlay = document.createElement('div');
      overlay.setAttribute('role', 'listbox');
      overlay.setAttribute(
        'data-testid',
        'unassociated-card-canvas-test-listbox'
      );

      const option = document.createElement('button');
      option.type = 'button';
      option.textContent = 'Unassociated overlay option';
      option.setAttribute('role', 'option');
      option.setAttribute(
        'data-testid',
        'unassociated-card-canvas-test-option'
      );
      overlay.append(option);

      document.body.append(overlay);
    });

    await page.getByTestId('unassociated-card-canvas-test-option').click();

    await expect(page.locator('[data-card-selected-display]')).toHaveText(
      'card-1'
    );
    await expect(page.locator('.cards-card-canvas__popover')).toBeVisible();

    await clickBlankCanvas(page);
    await expect(page.locator('[data-card-selected-display]')).toBeEmpty();
    await expect(page.locator('.cards-card-canvas__popover')).toHaveCount(0);
  });

  test('keeps selection when clicking the demo popover background', async ({
    page,
  }) => {
    // Given: a selected card is showing the Demo popover.
    await addCard(page, 'Card A', 'Content A');
    const popoverContent = page.locator('.card-canvas-demo-popover-content');
    await expect(popoverContent).toBeVisible();

    // When: the user clicks a non-control area inside the popover.
    await popoverContent.click({ position: { x: 4, y: 4 } });

    // Then: the click stays inside the popover and selection remains active.
    await expect(page.locator('[data-card-selected-display]')).toHaveText(
      'card-1'
    );
    await expect(page.locator('.cards-card-canvas__popover')).toBeVisible();
  });
});
