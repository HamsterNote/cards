import { expect, test, type Page } from '@playwright/test';
import {
  addCard,
  cardLocatorSelector,
  connectorEndpoints,
  disableOption,
  dragHandleToPoint,
  dragLocatorBy,
  enableOption,
  expectConnectorMatchesCardCenters,
  expectCardPositionUnchanged,
  expectNoParent,
  getCardData,
  getCardDataById,
  getRequiredBox,
  linkDragHeaderToCard,
  linkedIds,
  waitForAnimationFrame,
} from './helpers';

const LINK_MODE_SELECTOR = '[data-card-link-mode-toggle]';

async function createLinkedPair(page: Page): Promise<void> {
  await addCard(page, 'Alpha', 'Alpha content');
  await addCard(page, 'Beta', 'Beta content');
  await dragLocatorBy(
    page,
    page.locator(`${cardLocatorSelector('card-2')} .cards-card-canvas__card-header`),
    { x: 320, y: 240 }
  );
  await enableOption(page, LINK_MODE_SELECTOR);
  await linkDragHeaderToCard(page, 'card-1', 'card-2');
}

test.describe('CardCanvas link mode', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('keeps default-off dragging as normal movement and parent assignment', async ({ page }) => {
    // Given: link mode is off and card B is positioned as a parent target.
    await addCard(page, 'Alpha', 'Alpha content');
    await addCard(page, 'Beta', 'Beta content');
    await dragLocatorBy(
      page,
      page.locator(`${cardLocatorSelector('card-2')} .cards-card-canvas__card-header`),
      { x: 320, y: 240 }
    );
    await expect(page.locator(LINK_MODE_SELECTOR)).not.toBeChecked();
    const beforeCards = await getCardData(page);
    const beforeAlpha = getCardDataById(beforeCards, 'card-1');

    // When: card A is dragged onto card B with normal mode semantics.
    await linkDragHeaderToCard(page, 'card-1', 'card-2');

    // Then: A moves/reparents normally and no link graph is created.
    const afterCards = await getCardData(page);
    const afterAlpha = getCardDataById(afterCards, 'card-1');
    expect(afterAlpha.parent).toBe('card-2');
    expect(afterAlpha.x).not.toBeCloseTo(beforeAlpha.x, 5);
    expect(afterAlpha.y).not.toBeCloseTo(beforeAlpha.y, 5);
    expect(linkedIds(afterAlpha)).toEqual([]);
    expect(linkedIds(getCardDataById(afterCards, 'card-2'))).toEqual([]);
  });

  test('creates a symmetric link without moving, parenting, parent-candidate UI, or select-on-move-end', async ({ page }) => {
    // Given: select-on-move-end is enabled to catch accidental normal drag semantics.
    await disableOption(page, '[data-card-select-new-card-toggle]');
    await addCard(page, 'Alpha', 'Alpha content');
    await addCard(page, 'Beta', 'Beta content');
    await dragLocatorBy(
      page,
      page.locator(`${cardLocatorSelector('card-2')} .cards-card-canvas__card-header`),
      { x: 320, y: 240 }
    );
    await enableOption(page, '[data-card-select-on-move-end-toggle]');
    await enableOption(page, LINK_MODE_SELECTOR);
    const selectedBefore = await page.locator('[data-card-selected-display]').innerText();
    const selectCountBefore = await page.locator('[data-card-select-count]').innerText();
    const beforeCards = await getCardData(page);
    const beforeAlpha = getCardDataById(beforeCards, 'card-1');
    const beforeBeta = getCardDataById(beforeCards, 'card-2');

    // When: A is dropped on B while link mode is enabled.
    await linkDragHeaderToCard(page, 'card-1', 'card-2');

    // Then: the link persists symmetrically while card geometry and selection stay stable.
    const afterCards = await getCardData(page);
    const afterAlpha = getCardDataById(afterCards, 'card-1');
    const afterBeta = getCardDataById(afterCards, 'card-2');
    expect(linkedIds(afterAlpha)).toEqual(['card-2']);
    expect(linkedIds(afterBeta)).toEqual(['card-1']);
    expectCardPositionUnchanged(beforeAlpha, afterAlpha);
    expectCardPositionUnchanged(beforeBeta, afterBeta);
    expectNoParent(afterAlpha);
    expectNoParent(afterBeta);
    await expect(page.locator('[data-parent-candidate="true"]')).toHaveCount(0);
    await expect(page.locator('[data-card-selected-display]')).toHaveText(selectedBefore);
    await expect(page.locator('[data-card-select-count]')).toHaveText(selectCountBefore);
  });

  test('ignores self, empty-canvas, and duplicate link drops', async ({ page }) => {
    // Given: two cards and link mode are ready.
    await addCard(page, 'Alpha', 'Alpha content');
    await addCard(page, 'Beta', 'Beta content');
    await dragLocatorBy(
      page,
      page.locator(`${cardLocatorSelector('card-2')} .cards-card-canvas__card-header`),
      { x: 320, y: 240 }
    );
    await enableOption(page, LINK_MODE_SELECTOR);
    const beforeCards = await getCardData(page);

    // When: A is dropped on itself and then onto empty canvas.
    await linkDragHeaderToCard(page, 'card-1', 'card-1');
    const stageBox = await getRequiredBox(page.locator('.card-canvas-demo-stage'));
    await dragHandleToPoint(
      page,
      page.locator(`${cardLocatorSelector('card-1')} .cards-card-canvas__card-header`),
      { x: stageBox.x + stageBox.width - 20, y: stageBox.y + stageBox.height - 20 }
    );
    await waitForAnimationFrame(page);

    // Then: neither invalid gesture changes data.
    let afterCards = await getCardData(page);
    expect(afterCards).toEqual(beforeCards);
    await page.mouse.click(stageBox.x + stageBox.width - 20, stageBox.y + 20);

    // When: a real link is created and the same A→B gesture is repeated.
    await linkDragHeaderToCard(page, 'card-1', 'card-2');
    await linkDragHeaderToCard(page, 'card-1', 'card-2');

    // Then: the existing link is not duplicated in data or connector DOM.
    afterCards = await getCardData(page);
    expect(linkedIds(getCardDataById(afterCards, 'card-1'))).toEqual(['card-2']);
    expect(linkedIds(getCardDataById(afterCards, 'card-2'))).toEqual(['card-1']);
    await expect(page.locator('[data-card-link-connector]')).toHaveCount(1);
  });

  test('renders reciprocal footer controls with SVG styling and callback order despite selected popover', async ({ page }) => {
    // Given: B remains selected after linking, so its renderPopover is visible.
    await createLinkedPair(page);
    await page.locator(`${cardLocatorSelector('card-2')} .cards-card-canvas__card-content`).click();
    await expect(page.locator('.cards-card-canvas__popover')).toBeVisible();

    // Then: each linked card exposes a reciprocal, styled, SVG-backed footer button.
    const alphaToBeta = page.locator(
      '[data-card-link-source-id="card-1"][data-card-link-target-id="card-2"]'
    );
    const betaToAlpha = page.locator(
      '[data-card-link-source-id="card-2"][data-card-link-target-id="card-1"]'
    );
    await expect(alphaToBeta).toHaveText(/Beta/);
    await expect(betaToAlpha).toHaveText(/Alpha/);
    await expect(alphaToBeta.locator('svg')).toHaveCount(1);
    await expect(betaToAlpha.locator('svg')).toHaveCount(1);
    await expect(alphaToBeta).toHaveCSS('color', 'rgb(37, 99, 235)');
    await expect(alphaToBeta).toHaveCSS('cursor', 'pointer');
    const textDecoration = await alphaToBeta.evaluate(
      (element) => window.getComputedStyle(element).textDecorationLine
    );
    expect(textDecoration).toContain('underline');

    // When: the selected card's own footer link is clicked under the popover layer.
    await betaToAlpha.click();

    // Then: the click reaches the button exactly once with target/source order intact.
    await expect(page.locator('[data-card-link-callback-result]')).toContainText(
      'Source: Beta'
    );
    await expect(page.locator('[data-card-link-callback-result]')).toContainText(
      'Target: Alpha'
    );

    // And: the link target card becomes selected.
    await expect(page.locator('[data-card-selected-display]')).toHaveText('card-1');
    await expect(page.locator('[data-card-id="card-1"]')).toHaveClass(
      /cards-card-canvas__card--selected/
    );
  });

  test('selects the link target card when its footer link is clicked', async ({ page }) => {
    // Given: two linked cards and card-1 is initially selected.
    await createLinkedPair(page);
    await page.locator(`${cardLocatorSelector('card-1')} .cards-card-canvas__card-content`).click();
    await expect(page.locator('[data-card-selected-display]')).toHaveText('card-1');

    // When: clicking the source card's footer link that points to card-2.
    await page
      .locator('[data-card-link-source-id="card-1"][data-card-link-target-id="card-2"]')
      .click();

    // Then: card-2 becomes the selected card.
    await expect(page.locator('[data-card-selected-display]')).toHaveText('card-2');
    await expect(page.locator('[data-card-id="card-2"]')).toHaveClass(
      /cards-card-canvas__card--selected/
    );
    await expect(page.locator('[data-card-id="card-1"]')).not.toHaveClass(
      /cards-card-canvas__card--selected/
    );
  });

  test('draws one non-interactive dashed connector from center to center and updates after resize', async ({ page }) => {
    // Given: a linked pair is visible.
    await createLinkedPair(page);

    // Then: the connector is unique, dashed, light gray, pointer-transparent, and center-to-center.
    const line = page.locator('[data-card-link-connector]');
    await expect(page.locator('[data-card-link-connectors]')).toHaveCSS(
      'pointer-events',
      'none'
    );
    await expect(line).toHaveCount(1);
    await expect(line).toHaveCSS('stroke', 'rgb(209, 213, 219)');
    await expect(line).toHaveCSS('stroke-dasharray', '4px, 4px');
    await expectConnectorMatchesCardCenters(page, 'card-1', 'card-2');

    const cardBox = await getRequiredBox(page.locator(cardLocatorSelector('card-1')));
    const topElementCardId = await page.evaluate(
      (point: { readonly x: number; readonly y: number }) => {
        const element = document.elementFromPoint(point.x, point.y);
        return element?.closest('[data-card-id]')?.getAttribute('data-card-id') ?? null;
      },
      { x: cardBox.x + cardBox.width / 2, y: cardBox.y + cardBox.height / 2 }
    );
    expect(topElementCardId).toBe('card-1');

    // When: the linked target is resized.
    const beforeEndpoints = await connectorEndpoints(page);
    await dragLocatorBy(
      page,
      page.locator(`${cardLocatorSelector('card-2')} [data-card-resize-handle]`),
      { x: 60, y: 40 }
    );

    // Then: connector endpoints update to the new model center.
    const afterEndpoints = await connectorEndpoints(page);
    expect(afterEndpoints.x2).toBeCloseTo(beforeEndpoints.x2 + 30, 5);
    expect(afterEndpoints.y2).toBeCloseTo(beforeEndpoints.y2 + 20, 5);
    await expectConnectorMatchesCardCenters(page, 'card-1', 'card-2');
  });

  test('chooses the highest overlapping target by zIndex then later array order', async ({ page }) => {
    // Given: source A overlaps targets B and C, with C later and higher zIndex.
    await disableOption(page, '[data-card-select-new-card-toggle]');
    await addCard(page, 'Alpha', 'Alpha content');
    await dragLocatorBy(
      page,
      page.locator(`${cardLocatorSelector('card-1')} .cards-card-canvas__card-header`),
      { x: 320, y: 240 }
    );
    await addCard(page, 'Beta', 'Beta content');
    await addCard(page, 'Gamma', 'Gamma content');
    await enableOption(page, LINK_MODE_SELECTOR);

    // When: A is link-dropped inside the overlapping stack.
    const cardA = page.locator(cardLocatorSelector('card-1'));
    const cardCBox = await getRequiredBox(page.locator(cardLocatorSelector('card-3')));
    await dragHandleToPoint(
      page,
      cardA.locator('.cards-card-canvas__card-header'),
      { x: cardCBox.x + cardCBox.width / 2, y: cardCBox.y + cardCBox.height / 2 }
    );

    // Then: the topmost later card wins over the earlier overlapping card.
    const cards = await getCardData(page);
    expect(linkedIds(getCardDataById(cards, 'card-1'))).toEqual(['card-3']);
    expect(linkedIds(getCardDataById(cards, 'card-2'))).toEqual([]);
    expect(linkedIds(getCardDataById(cards, 'card-3'))).toEqual(['card-1']);
  });

  test('filters missing linked targets out of footers and connectors', async ({ page }) => {
    // Given: a custom state contains a missing linkedCardIds target.
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent('card-canvas-demo:set-cards', {
          detail: [
            {
              id: 'card-1',
              title: 'Alpha',
              content: 'Alpha content',
              x: -90,
              y: -60,
              width: 180,
              height: 120,
              zIndex: 1,
              linkedCardIds: ['missing-id'],
            },
          ],
        })
      );
    });
    await expect(page.locator('[data-card-data-content]')).toContainText('missing-id');

    // When: the demo has no matching linked target in its real card graph.
    const cards = await getCardData(page);

    // Then: data preserves the bogus id while rendered footers/connectors filter it out.
    expect(linkedIds(getCardDataById(cards, 'card-1'))).toEqual(['missing-id']);
    await expect(
      page.locator(
        '[data-card-link-source-id="card-1"][data-card-link-target-id="missing-id"]'
      )
    ).toHaveCount(0);
    await expect(page.locator('[data-card-link-footer]')).toHaveCount(0);
    await expect(page.locator('[data-card-link-connector]')).toHaveCount(0);
  });

  test('removes stale footer links after a linked target is deleted', async ({ page }) => {
    // Given: a real linked pair is visible in reciprocal footers.
    await createLinkedPair(page);
    await expect(
      page.locator('[data-card-link-source-id="card-1"][data-card-link-target-id="card-2"]')
    ).toHaveCount(1);

    // When: the linked target card is deleted from the graph.
    await page.locator(`${cardLocatorSelector('card-2')} .cards-card-canvas__card-content`).click();
    await page.getByTestId('delete-selected-card').click();

    // Then: the source footer re-resolves linked targets and drops the stale button.
    await expect(page.locator(cardLocatorSelector('card-2'))).toHaveCount(0);
    const cards = await getCardData(page);
    expect(linkedIds(getCardDataById(cards, 'card-1'))).toEqual(['card-2']);
    await expect(
      page.locator('[data-card-link-source-id="card-1"][data-card-link-target-id="card-2"]')
    ).toHaveCount(0);
    await expect(page.locator('[data-card-link-footer]')).toHaveCount(0);
    await expect(page.locator('[data-card-link-connector]')).toHaveCount(0);
  });

  test('selects the linked target card on footer click even when onLinkClick is absent', async ({ page }) => {
    // Given: the demo mounts CardCanvas without the optional onLinkClick prop.
    await createLinkedPair(page);
    await disableOption(page, '[data-card-link-callback-enabled-toggle]');
    const beforeBox = await getRequiredBox(page.locator(cardLocatorSelector('card-1')));
    const callbackResultBefore = await page
      .locator('[data-card-link-callback-result]')
      .innerText();

    // When: a footer button is clicked without an onLinkClick prop.
    await page
      .locator('[data-card-link-source-id="card-1"][data-card-link-target-id="card-2"]')
      .click();

    // Then: the link target card becomes selected, callback and geometry stay unchanged.
    const afterBox = await getRequiredBox(page.locator(cardLocatorSelector('card-1')));
    await expect(page.locator('[data-card-link-callback-result]')).toHaveText(
      callbackResultBefore
    );
    await expect(page.locator('[data-card-selected-display]')).toHaveText('card-2');
    await expect(page.locator('[data-card-id="card-2"]')).toHaveClass(
      /cards-card-canvas__card--selected/
    );
    expect(afterBox.x).toBeCloseTo(beforeBox.x, 5);
    expect(afterBox.y).toBeCloseTo(beforeBox.y, 5);
  });
});
