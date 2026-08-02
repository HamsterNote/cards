import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('keeps MiniMap off until virtual paper and MiniMap are enabled', async ({
  page,
}) => {
  // Given：两个功能都保持默认关闭。
  const virtualPaperToggle = page.locator('[data-card-virtual-paper-toggle]');
  const minimapToggle = page.locator('[data-card-minimap-toggle]');
  const toolbarToggle = page.getByRole('button', { name: '缩略图' });
  const minimap = page.getByTestId('card-canvas-minimap');

  // Then：非 virtual paper 模式不能打开 MiniMap。
  await expect(virtualPaperToggle).not.toBeChecked();
  await expect(minimapToggle).toBeDisabled();
  await expect(minimapToggle).not.toBeChecked();
  await expect(toolbarToggle).toBeDisabled();
  await expect(toolbarToggle).toHaveAttribute('aria-pressed', 'false');
  await expect(minimap).toHaveCount(0);

  // When：只打开 virtual paper。
  await virtualPaperToggle.check();

  // Then：MiniMap 可开启，但仍保持默认关闭。
  await expect(minimapToggle).toBeEnabled();
  await expect(toolbarToggle).toBeEnabled();
  await expect(minimap).toHaveCount(0);

  // When：通过底部栏打开 MiniMap。
  await toolbarToggle.click();

  // Then：MiniMap 出现在固定覆盖层中，且宿主开关同步更新。
  await expect(minimap).toBeVisible();
  await expect(toolbarToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(minimapToggle).toBeChecked();

  // When：再次点击底部栏开关。
  await toolbarToggle.click();

  // Then：MiniMap 与宿主开关同步关闭。
  await expect(minimap).toHaveCount(0);
  await expect(toolbarToggle).toHaveAttribute('aria-pressed', 'false');
  await expect(minimapToggle).not.toBeChecked();

  // Given：关闭 virtual paper 前重新打开 MiniMap。
  await toolbarToggle.click();
  await expect(minimap).toBeVisible();

  // When：关闭 virtual paper。
  await virtualPaperToggle.uncheck();

  // Then：MiniMap 立即关闭，并恢复不可打开状态。
  await expect(minimap).toHaveCount(0);
  await expect(minimapToggle).toBeDisabled();
  await expect(minimapToggle).not.toBeChecked();
  await expect(toolbarToggle).toBeDisabled();
  await expect(toolbarToggle).toHaveAttribute('aria-pressed', 'false');
});

test('pans the virtual paper by clicking the MiniMap background', async ({
  page,
}) => {
  // Given：画布中有卡片，且 virtual paper 与 MiniMap 均已开启。
  await page.locator('[data-card-title-input]').fill('MiniMap target');
  await page.locator('[data-card-content-input]').fill('Navigation target');
  await page.getByRole('button', { name: 'Add Card' }).click();
  await page.locator('[data-card-virtual-paper-toggle]').check();
  await page.locator('[data-card-minimap-toggle]').check();

  const card = page.locator('[data-card-id]').first();
  const minimap = page.getByTestId('card-canvas-minimap');
  const virtualPaper = page.locator('[data-card-virtual-paper]');
  const virtualPaperBox = await virtualPaper.boundingBox();
  expect(virtualPaperBox).not.toBeNull();
  if (virtualPaperBox === null) {
    throw new Error('Expected virtual paper to have a layout box');
  }

  // Given：放大主视口，确保活动框之外存在可点击的 MiniMap 背景。
  await page.mouse.move(
    virtualPaperBox.x + virtualPaperBox.width / 2,
    virtualPaperBox.y + virtualPaperBox.height / 2
  );
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -1200);
  await page.keyboard.up('Control');
  const minimapBox = await minimap.boundingBox();
  const cardBoxBefore = await card.boundingBox();
  expect(minimapBox).not.toBeNull();
  expect(cardBoxBefore).not.toBeNull();
  if (minimapBox === null || cardBoxBefore === null) {
    throw new Error('Expected the card and MiniMap to have layout boxes');
  }

  const indicator = await minimap
    .locator('[data-card-minimap-indicator]')
    .evaluate((element) => ({
      x: Number(element.getAttribute('x')),
      y: Number(element.getAttribute('y')),
    }));
  expect(indicator.x).toBeGreaterThan(4);
  expect(indicator.y).toBeGreaterThan(4);

  // When：点击活动框之外的左上角背景。
  await page.mouse.click(minimapBox.x + 4, minimapBox.y + 4);

  // Then：真实卡片随 viewport 平移，卡片数据本身不需要被修改。
  await expect
    .poll(async () => (await card.boundingBox())?.x)
    .not.toBeCloseTo(cardBoxBefore.x, 0);
});

test('maps the visible viewport from the canvas-centered world origin', async ({
  page,
}) => {
  // Given：卡片以世界原点为中心，而 VirtualPaper 的初始 transform 为零。
  await page.locator('[data-card-title-input]').fill('Viewport origin');
  await page.locator('[data-card-content-input]').fill('Coordinate contract');
  await page.getByRole('button', { name: 'Add Card' }).click();
  await page.locator('[data-card-virtual-paper-toggle]').check();
  await page.locator('[data-card-minimap-toggle]').check();

  const host = page.locator('[data-card-virtual-paper]');
  const card = page.locator('[data-card-id]').first();
  const minimap = page.getByTestId('card-canvas-minimap');

  // When：从卡片预览反推出 MiniMap 的 world -> MiniMap 映射。
  const geometry = await Promise.all([
    host.boundingBox(),
    card.getAttribute('style'),
    minimap.locator('.cards-card-canvas__minimap-card').evaluate((element) => ({
      x: Number(element.getAttribute('x')),
      width: Number(element.getAttribute('width')),
    })),
    minimap.locator('[data-card-minimap-indicator]').evaluate((element) => ({
      x: Number(element.getAttribute('x')),
      width: Number(element.getAttribute('width')),
    })),
  ]);
  const [hostBox, cardStyle, preview, indicator] = geometry;
  expect(hostBox).not.toBeNull();
  expect(cardStyle).not.toBeNull();
  if (hostBox === null || cardStyle === null) {
    throw new Error('Expected host and card geometry');
  }
  const cardX = Number(/left:\s*(-?[\d.]+)px/.exec(cardStyle)?.[1]);
  const cardWidth = Number(/width:\s*([\d.]+)px/.exec(cardStyle)?.[1]);
  const miniMapScale = preview.width / cardWidth;
  const miniMapOriginX = preview.x - cardX * miniMapScale;

  // Then：可视区域从世界坐标 -hostWidth/2 开始，并裁剪为整个 MiniMap 边框。
  const rawIndicatorX = miniMapOriginX - (hostBox.width / 2) * miniMapScale;
  const rawIndicatorRight = rawIndicatorX + hostBox.width * miniMapScale;
  expect(rawIndicatorX).toBeLessThan(0);
  expect(rawIndicatorRight).toBeGreaterThan(200);
  expect(indicator.x).toBe(0);
  expect(indicator.width).toBe(200);
});

test('supports keyboard and indicator-drag viewport navigation', async ({
  page,
}) => {
  // Given：画布中有卡片，且 MiniMap 已开启。
  await page.locator('[data-card-title-input]').fill('MiniMap controls');
  await page.locator('[data-card-content-input]').fill('Persistent card');
  await page.getByRole('button', { name: 'Add Card' }).click();
  await page.locator('[data-card-virtual-paper-toggle]').check();
  await page.locator('[data-card-minimap-toggle]').check();
  const card = page.locator('[data-card-id]').first();
  const minimap = page.getByTestId('card-canvas-minimap');
  const minimapBox = await minimap.boundingBox();
  const cardBoxBefore = await card.boundingBox();
  expect(minimapBox).not.toBeNull();
  expect(cardBoxBefore).not.toBeNull();
  if (minimapBox === null || cardBoxBefore === null) {
    throw new Error('Expected the card and MiniMap to have layout boxes');
  }

  // When：键盘用户聚焦 MiniMap 并向右平移。
  await minimap.focus();
  await page.keyboard.press('ArrowRight');

  // Then：MiniMap 有明确语义，且键盘操作会平移真实 viewport。
  await expect(minimap).toBeFocused();
  await expect(minimap).toHaveAttribute('aria-label', '卡片画布 MiniMap');
  await expect
    .poll(async () => (await card.boundingBox())?.x)
    .not.toBeCloseTo(cardBoxBefore.x, 0);
  const cardBoxAfterKeyboard = await card.boundingBox();
  expect(cardBoxAfterKeyboard).not.toBeNull();
  if (cardBoxAfterKeyboard === null) {
    throw new Error('Expected the card to remain visible after keyboard pan');
  }

  // When：指针从可见 indicator 区域连续拖动。
  const startX = minimapBox.x + minimapBox.width * 0.75;
  const startY = minimapBox.y + minimapBox.height * 0.75;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX - 24, startY - 16, { steps: 4 });
  await page.mouse.up();

  // Then：pointer capture 分支持续更新 viewport。
  await expect
    .poll(async () => (await card.boundingBox())?.x)
    .not.toBeCloseTo(cardBoxAfterKeyboard.x, 0);
});

test('temporarily hides the selected-card Popover during MiniMap navigation', async ({
  page,
}) => {
  // Given：选中卡片的 Popover 可见，且 MiniMap 已开启。
  await page.locator('[data-card-title-input]').fill('Popover target');
  await page.locator('[data-card-content-input]').fill('Persistent card');
  await page.getByRole('button', { name: 'Add Card' }).click();
  await page.locator('[data-card-virtual-paper-toggle]').check();
  await page.locator('[data-card-minimap-toggle]').check();
  const popover = page.locator('.cards-card-canvas__popover');
  await expect(popover).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.dataset.minimapPopoverRemovals = '0';
    const observer = new MutationObserver((records) => {
      const removals = records.flatMap((record) => [...record.removedNodes]);
      if (
        removals.some(
          (node) =>
            node instanceof Element &&
            (node.matches('.cards-card-canvas__popover') ||
              node.querySelector('.cards-card-canvas__popover') !== null)
        )
      ) {
        document.documentElement.dataset.minimapPopoverRemovals = '1';
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });

  // When：键盘通过 MiniMap 连续平移 viewport。
  const minimap = page.getByTestId('card-canvas-minimap');
  await minimap.focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');

  // Then：DOM 观测确认 Popover 曾被移除，停止移动后再恢复。
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.dataset.minimapPopoverRemovals
      )
    )
    .toBe('1');
  await expect(popover).toBeVisible();
});

test('keeps a bottom MiniMap clear of the toolbar on narrow canvases', async ({
  page,
}) => {
  // Given：375px viewport 中启用 virtual paper 与 MiniMap。
  await page.setViewportSize({ width: 375, height: 812 });
  await page.locator('[data-card-virtual-paper-toggle]').check();
  await page.locator('[data-card-minimap-toggle]').check();
  const minimapBox = await page
    .getByTestId('card-canvas-minimap')
    .boundingBox();
  const toolbarBox = await page
    .locator('[data-card-canvas-toolbar]')
    .boundingBox();
  expect(minimapBox).not.toBeNull();
  expect(toolbarBox).not.toBeNull();
  if (minimapBox === null || toolbarBox === null) {
    throw new Error('Expected the MiniMap and toolbar to have layout boxes');
  }

  // Then：两个固定画布控件没有相交，均保持可操作。
  const overlaps = !(
    minimapBox.x + minimapBox.width <= toolbarBox.x ||
    toolbarBox.x + toolbarBox.width <= minimapBox.x ||
    minimapBox.y + minimapBox.height <= toolbarBox.y ||
    toolbarBox.y + toolbarBox.height <= minimapBox.y
  );
  expect(overlaps).toBe(false);
});
