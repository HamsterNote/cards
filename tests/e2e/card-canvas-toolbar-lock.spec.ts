import { expect, type Page, test } from '@playwright/test';
import {
  dragLocatorBy,
  getCardData,
  getCardDataById,
  getRequiredBox,
  waitForAnimationFrame,
} from './helpers';

async function clickBlankCanvas(page: Page): Promise<void> {
  const stageBox = await getRequiredBox(
    page.locator('.card-canvas-demo-stage')
  );
  await page.mouse.click(stageBox.x + 20, stageBox.y + 20);
}

async function addCardFromDemoForm(
  page: Page,
  title = 'Toolbar card',
  content = 'Toolbar content'
): Promise<void> {
  const count = await page.locator('[data-card-id]').count();
  await page.locator('[data-card-title-input]').fill(title);
  await page.locator('[data-card-content-input]').fill(content);
  await page.locator('[data-card-add-button]').click();
  await expect(page.locator('[data-card-id]')).toHaveCount(count + 1);
}

async function saveCardBody(page: Page, content: string): Promise<void> {
  await page.locator('[data-card-content-edit-button]').click();
  const dialog = page.getByRole('dialog', { name: '编辑卡片内容' });
  const paragraph = dialog
    .locator(
      '[data-card-content-dialog-editor] [contenteditable="true"]:visible'
    )
    .first();
  await paragraph.fill(content);
  await dialog.getByRole('button', { name: '保存' }).click();
}

test.describe('CardCanvas toolbar and lock behavior', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('enables direct editing by default', async ({ page }) => {
    // Given: the demo is loaded without changing the editable option.
    const editableToggle = page.locator('[data-card-editable-toggle]');

    // When: a card is added through the existing demo form.
    await page.locator('[data-card-title-input]').fill('Editable by default');
    await page.locator('[data-card-content-input]').fill('Content');
    await page.getByRole('button', { name: 'Add Card' }).click();

    // Then: direct editing is enabled and the title editor is rendered.
    await expect(editableToggle).toBeChecked();
    await expect(page.locator('[data-card-title-edit]')).toBeVisible();
  });

  test('adds the host card from the Demo form and keeps it after deselection', async ({
    page,
  }) => {
    // Given: the Demo form contains a valid card for the shared host action.
    const stage = page.locator('.card-canvas-demo-stage');
    const stageBox = await getRequiredBox(stage);

    // When: the user submits the Demo form.
    await addCardFromDemoForm(page, 'Kept card', 'Host-owned content');

    // Then: the host-created card is visible and selected.
    const card = page.locator('[data-card-id]');
    const cardBox = await getRequiredBox(card);
    expect(cardBox.x + cardBox.width / 2).toBeGreaterThan(stageBox.x);
    expect(cardBox.x + cardBox.width / 2).toBeLessThan(
      stageBox.x + stageBox.width
    );
    expect(cardBox.y + cardBox.height / 2).toBeGreaterThan(stageBox.y);
    expect(cardBox.y + cardBox.height / 2).toBeLessThan(
      stageBox.y + stageBox.height
    );
    await expect(card).toHaveClass(/cards-card-canvas__card--selected/);
    await expect(page.locator('[data-card-selected-display]')).not.toBeEmpty();
    await expect(card).toContainText('Kept card');
    await expect(card).toContainText('Host-owned content');

    // And: clearing selection does not discard host-owned data.
    await clickBlankCanvas(page);
    await expect(page.locator('[data-card-id]')).toHaveCount(1);
  });

  test('uses the host validation for an incomplete Demo form request', async ({
    page,
  }) => {
    // Given: only the title half of the Demo form is complete.
    const titleInput = page.locator('[data-card-title-input]');
    await titleInput.fill('Incomplete card');

    // When: the user submits the incomplete Demo form.
    await page.locator('[data-card-add-button]').click();

    // Then: Demo validation rejects the request without clearing its input.
    await expect(page.locator('[data-card-id]')).toHaveCount(0);
    await expect(titleInput).toHaveValue('Incomplete card');
  });

  test('preserves a host card when controlled selection is cleared', async ({
    page,
  }) => {
    // Given: a selected card was created by the shared Demo action.
    await addCardFromDemoForm(page, 'Persistent card');

    // When: the host clears the controlled selected ids without a pointer event.
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent('card-canvas-demo:set-selected', { detail: [] })
      );
    });

    // Then: only selection changes; the host-owned card remains.
    await expect(page.locator('[data-card-id]')).toHaveCount(1);
    await expect(page.locator('[data-card-id]')).toContainText(
      'Persistent card'
    );
    await expect(page.locator('[data-card-selected-display]')).toBeEmpty();
  });

  test('commits a live card title when controlled selection is cleared', async ({
    page,
  }) => {
    // Given: a host-created card has a title edit that has not blurred yet.
    await addCardFromDemoForm(page, 'Original title');
    await page.locator('[data-card-title-edit]').fill('Committed live title');

    // When: the host clears controlled selection without moving browser focus.
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent('card-canvas-demo:set-selected', { detail: [] })
      );
    });

    // Then: the visible title is committed to the controlled card model.
    await expect(page.locator('[data-card-id]')).toContainText(
      'Committed live title'
    );
  });

  test('preserves an existing card when another Demo form card is added', async ({
    page,
  }) => {
    // Given: the Demo form has already created one host card.
    await addCardFromDemoForm(page, 'First form card');

    // When: the user immediately submits another card from the Demo form.
    await addCardFromDemoForm(page, 'Second form card');

    // Then: both host-created cards remain in the controlled collection.
    await expect(page.locator('[data-card-id]')).toHaveCount(2);
    await expect(page.locator('[data-card-id]')).toContainText([
      'First form card',
      'Second form card',
    ]);
  });

  test('invokes the host add action from the keyboard', async ({ page }) => {
    // Given: the empty canvas toolbar add button.
    const addButton = page.locator('[data-card-canvas-add-button]');

    // When: the user activates the toolbar action with Enter.
    await addButton.focus();
    await page.keyboard.press('Enter');

    // Then: a blank draft is created and its title editor receives focus.
    await expect(page.locator('[data-card-id]')).toHaveCount(1);
    await expect(page.locator('[data-card-title-edit]')).toBeFocused();
  });

  test('preserves edited body content when controlled selection is cleared', async ({
    page,
  }) => {
    // Given: a host-created card has edited body text.
    await addCardFromDemoForm(page, 'Edited body card');
    await saveCardBody(page, 'Updated body');

    // When: the host clears controlled selection immediately after the edit.
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent('card-canvas-demo:set-selected', { detail: [] })
      );
    });

    // Then: the host-owned card and its edited content remain.
    await expect(page.locator('[data-card-id]')).toHaveCount(1);
    await expect(page.locator('[data-card-note-content]')).toContainText(
      'Updated body'
    );
  });

  test('keeps a host card whose body is cleared before deselection', async ({
    page,
  }) => {
    // Given: a host-created card body is edited and then cleared.
    await addCardFromDemoForm(page, 'Title keeps this card');
    await page.locator('[data-card-content-edit-button]').click();
    const dialog = page.getByRole('dialog', { name: '编辑卡片内容' });
    const paragraph = dialog
      .locator(
        '[data-card-content-dialog-editor] [contenteditable="true"]:visible'
      )
      .first();
    await paragraph.fill('Temporary body');
    await paragraph.fill('');
    await dialog.getByRole('button', { name: '保存' }).click();

    // When: the host clears controlled selection after the empty body is saved.
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent('card-canvas-demo:set-selected', { detail: [] })
      );
    });

    // Then: draft cleanup no longer deletes host-owned cards.
    await expect(page.locator('[data-card-id]')).toHaveCount(1);
    await expect(page.locator('[data-card-id]')).toContainText(
      'Title keeps this card'
    );
  });

  test('renders plain fallback content as text instead of HTML', async ({
    page,
  }) => {
    // Given: untrusted plain content contains an HTML image payload.
    const payload = '<img src=x onerror="window.__cardXss = true">';
    await page.evaluate((content) => {
      window.dispatchEvent(
        new CustomEvent('card-canvas-demo:set-cards', {
          detail: [
            {
              id: 'plain-text-card',
              title: 'Plain text',
              content,
              x: -90,
              y: -60,
              width: 180,
              height: 120,
            },
          ],
        })
      );
    }, payload);

    // When: editable fallback blocks render the plain content.
    const content = page.locator(
      '[data-card-id="plain-text-card"] .cards-card-canvas__card-content'
    );

    // Then: no executable element is created and the literal payload is visible.
    await expect(content.locator('img')).toHaveCount(0);
    await expect(content).toContainText(payload);
    expect(
      await page.evaluate(() => Reflect.get(window, '__cardXss') === true)
    ).toBe(false);
  });

  test('keeps special-character edits as a plain-text content mirror', async ({
    page,
  }) => {
    // Given: the content Dialog receives HTML-significant plain text.
    const payload = `<tag data-label="quoted">Tom & Jerry's</tag>`;
    await addCardFromDemoForm(page);
    const cardId = await page
      .locator('[data-card-id]')
      .getAttribute('data-card-id');
    expect(cardId).not.toBeNull();
    if (cardId === null) throw new Error('Expected toolbar card id');

    // When: the user saves the body from the content Dialog.
    await saveCardBody(page, payload);

    // Then: rendering stays safe while card.content preserves the original text.
    await expect(page.locator('[data-card-note-content] tag')).toHaveCount(0);
    await expect
      .poll(
        async () => getCardDataById(await getCardData(page), cardId).content
      )
      .toBe(payload);
  });

  test('prevents locked cards from moving, resizing, or being deleted', async ({
    page,
  }) => {
    // Given: a selected locked card injected through the demo boundary.
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent('card-canvas-demo:set-cards', {
          detail: [
            {
              id: 'locked-card',
              title: 'Locked',
              content: 'Protected',
              x: -90,
              y: -60,
              width: 180,
              height: 120,
              lock: true,
            },
          ],
        })
      );
    });
    const card = page.locator('[data-card-id="locked-card"]');
    await expect(card).toBeVisible();
    await card.click();
    const before = getCardDataById(await getCardData(page), 'locked-card');

    // When: the user attempts to drag the card and use both delete actions.
    await dragLocatorBy(page, card.locator('.cards-card-canvas__card-header'), {
      x: 80,
      y: 50,
    });
    const after = getCardDataById(await getCardData(page), 'locked-card');

    // Then: geometry is unchanged and destructive actions are disabled.
    expect(after.x).toBe(before.x);
    expect(after.y).toBe(before.y);
    await expect(card).toHaveAttribute('data-card-lock', 'true');
    await expect(card.locator('.cards-card-canvas__resize-handle')).toHaveCount(
      0
    );
    await expect(
      page.locator('[data-card-popover-delete-button]')
    ).toBeDisabled();
    await expect(page.getByTestId('delete-selected-card')).toBeDisabled();
    await expect(card).toBeVisible();
  });

  test('rebinds resize behavior after a card is unlocked', async ({ page }) => {
    // Given: a locked card has rendered without a resize handle.
    const lockedCard = {
      id: 'toggle-lock-card',
      title: 'Toggle lock',
      content: 'Unlock me',
      x: -90,
      y: -60,
      width: 180,
      height: 120,
      lock: true,
    };
    await page.evaluate((card) => {
      window.dispatchEvent(
        new CustomEvent('card-canvas-demo:set-cards', { detail: [card] })
      );
    }, lockedCard);
    const card = page.locator('[data-card-id="toggle-lock-card"]');
    await expect(card.locator('.cards-card-canvas__resize-handle')).toHaveCount(
      0
    );

    // When: the host unlocks the same card and the user drags its new handle.
    await page.evaluate((card) => {
      window.dispatchEvent(
        new CustomEvent('card-canvas-demo:set-cards', {
          detail: [{ ...card, lock: false }],
        })
      );
    }, lockedCard);
    const handle = card.locator('.cards-card-canvas__resize-handle');
    await expect(handle).toBeVisible();
    await dragLocatorBy(page, handle, { x: 40, y: 30 });

    // Then: the re-created handle is wired and changes card dimensions.
    const resized = getCardDataById(await getCardData(page), lockedCard.id);
    expect(resized.width).toBeGreaterThan(lockedCard.width);
    expect(resized.height).toBeGreaterThan(lockedCard.height);
  });

  test('hides the selected popover while virtual paper pans', async ({
    page,
  }) => {
    // Given: a selected card and its anchored Popover on virtual paper.
    await page.locator('[data-card-title-input]').fill('Popover anchor');
    await page.locator('[data-card-content-input]').fill('Content');
    await page.getByRole('button', { name: 'Add Card' }).click();
    await page.locator('[data-card-virtual-paper-toggle]').check();
    const card = page.locator('[data-card-id="card-1"]');
    const popover = page.locator(
      '.cards-card-canvas__popover:has([data-card-headless-toggle])'
    );
    const cardBefore = await getRequiredBox(card);
    await expect(popover).toBeVisible();
    const stageBox = await getRequiredBox(
      page.locator('.card-canvas-demo-stage')
    );

    // When: a trackpad-like wheel gesture pans the virtual paper.
    await page.mouse.move(
      stageBox.x + stageBox.width / 2,
      stageBox.y + stageBox.height / 2
    );
    await page.mouse.wheel(70, 45);
    await waitForAnimationFrame(page);
    const cardAfter = await getRequiredBox(card);

    // Then: the card pans while the stale anchored Popover closes.
    const cardDeltaX = cardAfter.x - cardBefore.x;
    const cardDeltaY = cardAfter.y - cardBefore.y;
    expect(Math.abs(cardDeltaX) + Math.abs(cardDeltaY)).toBeGreaterThan(5);
    await expect(popover).toHaveCount(0);
    await expect(page.locator('[data-card-selected-display]')).toHaveText(
      'card-1'
    );
  });
});
