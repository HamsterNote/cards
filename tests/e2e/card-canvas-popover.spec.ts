import { expect, type Page, test } from '@playwright/test';
import { CARD_CANVAS_POPOVER_OVERLAY_ATTRIBUTE } from '../../src/utils/card-popover-interactions';
import {
  addCard,
  enableOption,
  getCardData,
  getCardDataById,
  getRequiredBox,
} from './helpers';

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

  test('creates a threaded comment in a dialog', async ({ page }) => {
    // Given: a newly selected card with its Popover actions visible.
    await addCard(page, 'Card A', 'Content A');
    const commentButton = page.locator('[data-card-comment-button]');
    await expect(commentButton).toBeVisible();

    // When: the user opens the comment details and submits a new comment.
    await commentButton.click();
    const commentDialog = page.getByRole('dialog', { name: '评论详情' });
    await expect(commentDialog).toBeVisible();
    expect(
      await commentDialog.evaluate(
        (element) => element.parentElement === document.body
      )
    ).toBe(true);
    await expect(
      commentDialog.locator('[data-card-comment-panel]')
    ).toBeVisible();
    await expect(
      page.locator('.cards-card-canvas__popover [data-card-comment-panel]')
    ).toHaveCount(0);
    await page.locator('[data-card-comment-input]').fill('Looks good to me');
    await page.locator('[data-card-comment-submit]').click();

    // Then: the comment is rendered and persisted in the card data.
    await expect(page.locator('[data-card-comment-content]')).toHaveText(
      'Looks good to me'
    );
    await expect(page.locator('[data-card-data-content]')).toContainText(
      'Looks good to me'
    );
    const commentDeleteButton = page.locator('[data-card-comment-delete]');
    await expect(commentDeleteButton).toHaveAttribute('aria-label', '删除评论');
    await expect(commentDeleteButton.locator('svg')).toHaveCount(1);
    await expect(commentDeleteButton).not.toHaveText(/删除/);
  });

  test('keeps the toolbar below card popovers and applies the theme accent', async ({
    page,
  }) => {
    // Given: the demo passes the blue accent prop and opens a selected-card Popover.
    await addCard(page, 'Card A', 'Content A');
    const toolbar = page.locator('[data-card-canvas-toolbar]');
    const popover = page.locator('.cards-card-canvas__popover');
    await expect(toolbar).toBeVisible();
    await expect(popover).toBeVisible();

    // Then: canvas and portaled actions inherit blue, while the toolbar stays underneath.
    await expect(toolbar).toHaveCSS('--hn-color-accent', '#60a5fa');
    await expect(popover).toHaveCSS('--hn-color-accent', '#60a5fa');
    const [toolbarZIndex, popoverZIndex] = await Promise.all([
      toolbar.evaluate((element) => Number(getComputedStyle(element).zIndex)),
      popover.evaluate((element) => Number(getComputedStyle(element).zIndex)),
    ]);
    expect(toolbarZIndex).toBeLessThan(popoverZIndex);
  });

  test('keeps small toolbar buttons the same height as small popover buttons', async ({
    page,
  }) => {
    // Given: both shared Popovers render their small Button variants.
    await addCard(page, 'Card A', 'Content A');
    const toolbarButton = page
      .locator('[data-card-canvas-toolbar] .hn-button')
      .first();
    const popoverButton = page.locator('[data-card-content-edit-button]');

    // Then: the canvas must not override one small Button to a taller visual size.
    const [toolbarBox, popoverBox] = await Promise.all([
      getRequiredBox(toolbarButton),
      getRequiredBox(popoverButton),
    ]);
    expect(toolbarBox.height).toBe(popoverBox.height);
  });

  test('applies light mode and accent tokens to the portaled content dialog panel', async ({
    page,
  }) => {
    // Given: the light canvas uses its blue accent and opens the content editor.
    await addCard(page, 'Card A', 'Content A');
    await page.locator('[data-card-content-edit-button]').click();
    const dialog = page.getByRole('dialog', { name: '编辑卡片内容' });

    // Then: the body-portaled panel receives both theme axes itself.
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveCSS('--hn-color-accent', '#60a5fa');
    await expect(dialog).toHaveCSS('--hn-color-surface', '#fff');
    await expect(dialog).toHaveCSS('--hn-color-text', '#18181b');
  });

  test('closes comment details with Escape without clearing card selection', async ({
    page,
  }) => {
    // Given: a selected card has opened its comment details Dialog.
    await addCard(page, 'Card A', 'Content A');
    await page.locator('[data-card-comment-button]').click();
    const commentDialog = page.getByRole('dialog', { name: '评论详情' });
    await expect(commentDialog).toBeVisible();

    // When: the user dismisses the Dialog with Escape.
    await page.keyboard.press('Escape');

    // Then: the Dialog closes while the selected card and its Popover remain available.
    await expect(commentDialog).toHaveCount(0);
    await expect(page.locator('[data-card-selected-display]')).toHaveText(
      'card-1'
    );
    await expect(page.locator('.cards-card-canvas__popover')).toBeVisible();
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

  test('allows choosing a child layout from the card more menu', async ({
    page,
  }) => {
    // Given: direct editing is enabled for a selected card.
    await addCard(page, 'Card A', 'Content A');
    await enableOption(page, '[data-card-editable-toggle]');
    await page
      .locator('[data-card-id="card-1"] [data-card-menu-button]')
      .click();
    const option = page.locator(
      '[data-card-children-layout-mode-option="mind-map-horizontal"]'
    );
    await expect(option).toBeVisible();

    // When: the horizontal mind-map menu item is chosen.
    await option.click();

    // Then: the chosen child-layout mode is written back to Demo card data.
    await expect(
      page.locator('[data-card-children-layout-mode-menu]')
    ).toHaveCount(0);
    const card = getCardDataById(await getCardData(page), 'card-1');
    expect(card.childrenLayoutMode).toBe('mind-map-horizontal');
  });

  test('mounts the card more menu in document body', async ({ page }) => {
    // Given: direct editing is enabled for a selected card.
    await addCard(page, 'Card A', 'Content A');
    await enableOption(page, '[data-card-editable-toggle]');

    // When: the user opens the card more menu.
    await page
      .locator('[data-card-id="card-1"] [data-card-menu-button]')
      .click();
    const menu = page.locator('[data-card-children-layout-mode-menu]');
    await expect(menu).toBeVisible();

    // Then: the shared anchored Popover escapes the overflow-hidden canvas stage.
    const isMountedInBody = await menu.evaluate((element) => {
      const popover = element.closest('.cards-card-canvas__popover');
      return popover?.parentElement === document.body;
    });
    expect(isMountedInBody).toBe(true);
  });

  test('mounts the selected card popover in document body', async ({
    page,
  }) => {
    // Given: a newly created card is selected by the demo.
    await addCard(page, 'Card A', 'Content A');
    const popover = page.locator('.cards-card-canvas__popover');
    await expect(popover).toBeVisible();

    // When: the selected card renders its custom Popover content.
    const isMountedInBody = await popover.evaluate(
      (element) => element.parentElement === document.body
    );

    // Then: the anchored shared Popover is outside the overflow-hidden canvas stage.
    expect(isMountedInBody).toBe(true);
  });

  test('hides the selected-card popover when virtual paper scrolls', async ({
    page,
  }) => {
    // Given: virtual paper contains a selected card with an open Popover.
    await enableOption(page, '[data-card-virtual-paper-toggle]');
    await addCard(page, 'Card A', 'Content A');
    const popover = page.locator('.cards-card-canvas__popover');
    await expect(popover).toBeVisible();
    const stageBox = await getRequiredBox(
      page.locator('.card-canvas-demo-stage')
    );
    await page.mouse.move(stageBox.x + 30, stageBox.y + 30);

    // When: the user scrolls to pan the virtual paper.
    await page.mouse.wheel(0, 80);

    // Then: the Popover hides without clearing the selected card.
    await expect(popover).toHaveCount(0);
    await expect(page.locator('[data-card-selected-display]')).toHaveText(
      'card-1'
    );
  });

  test('hides the selected-card popover when virtual paper zooms', async ({
    page,
  }) => {
    // Given: virtual paper contains a selected card with an open Popover.
    await enableOption(page, '[data-card-virtual-paper-toggle]');
    await addCard(page, 'Card A', 'Content A');
    const popover = page.locator('.cards-card-canvas__popover');
    await expect(popover).toBeVisible();
    const stageBox = await getRequiredBox(
      page.locator('.card-canvas-demo-stage')
    );
    await page.mouse.move(stageBox.x + 30, stageBox.y + 30);

    // When: the user holds Control and wheels to zoom the virtual paper.
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -80);
    await page.keyboard.up('Control');

    // Then: the Popover hides without clearing the selected card.
    await expect(popover).toHaveCount(0);
    await expect(page.locator('[data-card-selected-display]')).toHaveText(
      'card-1'
    );
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

  test('keeps the card when popover deletion is cancelled', async ({
    page,
  }) => {
    // Given: a selected card is showing a components delete button without summary copy.
    await addCard(page, 'Card A', 'Content A');
    const deleteButton = page.locator('[data-card-popover-delete-button]');
    await expect(deleteButton).toBeVisible();
    await expect(deleteButton.locator('svg')).toHaveCount(1);
    await expect(deleteButton).not.toHaveText(/Delete/);
    await expect(page.getByText('Selected: Card A')).toHaveCount(0);

    // When: the user starts deletion and cancels the components confirmation.
    await deleteButton.click();
    const dialog = page.getByRole('dialog', { name: 'Delete card?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    // Then: the card and its selection remain unchanged.
    await expect(page.locator('[data-card-id="card-1"]')).toBeVisible();
    await expect(page.locator('[data-card-selected-display]')).toHaveText(
      'card-1'
    );
  });

  test('deletes the card after popover deletion is confirmed', async ({
    page,
  }) => {
    // Given: a selected card is showing its Popover delete action.
    await addCard(page, 'Card A', 'Content A');
    const deleteButton = page.locator('[data-card-popover-delete-button]');
    await expect(deleteButton).toBeVisible();

    // When: the user confirms deletion through the components confirmation.
    await deleteButton.click();
    const dialog = page.getByRole('dialog', { name: 'Delete card?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Delete' }).click();

    // Then: the card and stale selection are removed.
    await expect(page.locator('[data-card-id="card-1"]')).toHaveCount(0);
    await expect(page.locator('[data-card-selected-display]')).toBeEmpty();
  });
});
