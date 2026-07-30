import { expect, test } from '@playwright/test';

type DragMutationSample = {
  readonly moveIndex: number;
  readonly oldLeft: number;
  readonly finalLeft: number;
};

test('keeps card position stable between pointer events and React frames when zoomed', async ({
  page,
}) => {
  // Given：VirtualPaper 已放大，卡片的屏幕尺寸证明当前缩放不为 1。
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  await page.goto('/');
  await page.locator('[data-card-title-input]').fill('Zoom drag target');
  await page.locator('[data-card-content-input]').fill('Stable trajectory');
  await page.getByRole('button', { name: 'Add Card' }).click();
  await page.locator('[data-card-virtual-paper-toggle]').check();

  const virtualPaper = page.locator('[data-card-virtual-paper]');
  const card = page.locator('[data-card-id]').first();
  const header = card.locator('.cards-card-canvas__card-header');
  const virtualPaperBox = await virtualPaper.boundingBox();
  expect(virtualPaperBox).not.toBeNull();
  if (virtualPaperBox === null) {
    throw new Error('Expected VirtualPaper to have a layout box');
  }
  await page.mouse.move(
    virtualPaperBox.x + virtualPaperBox.width / 2,
    virtualPaperBox.y + virtualPaperBox.height / 2
  );
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -600);
  await page.keyboard.up('Control');

  const cardWidth = await card.evaluate((element) =>
    Number.parseFloat((element as HTMLElement).style.width)
  );
  const zoomedCardBox = await card.boundingBox();
  expect(zoomedCardBox).not.toBeNull();
  if (zoomedCardBox === null) {
    throw new Error('Expected zoomed card to have a layout box');
  }
  expect(zoomedCardBox.width / cardWidth).toBeGreaterThan(1.1);

  await page.evaluate(() => {
    const cardElement = document.querySelector<HTMLElement>('[data-card-id]');
    if (cardElement === null) {
      throw new Error('Expected card element before trajectory observation');
    }
    const samples: DragMutationSample[] = [];
    let moveIndex = 0;
    Object.assign(window, { __cardDragMutationSamples: samples });
    document.addEventListener(
      'pointermove',
      () => {
        moveIndex += 1;
      },
      true
    );
    new MutationObserver((records) => {
      const finalLeft = Number.parseFloat(cardElement.style.left);
      for (const record of records) {
        const oldModelLeft = Number(
          /left:\s*(-?[\d.]+)px/.exec(record.oldValue ?? '')?.[1]
        );
        if (!Number.isFinite(oldModelLeft)) continue;
        samples.push({
          moveIndex,
          oldLeft: oldModelLeft,
          finalLeft,
        });
      }
    }).observe(cardElement, {
      attributes: true,
      attributeFilter: ['style'],
      attributeOldValue: true,
    });
  });

  // When：逐步移动指针，让每一步都经过一次 React 提交帧。
  const headerBox = await header.boundingBox();
  expect(headerBox).not.toBeNull();
  if (headerBox === null) {
    throw new Error('Expected card header to have a layout box');
  }
  const startX = headerBox.x + 8;
  const startY = headerBox.y + headerBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  for (const deltaX of [12, 24, 36, 48]) {
    await page.mouse.move(startX + deltaX, startY + 8);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    );
  }
  await page.mouse.up();

  // Then：屏幕位移等于指针位移，且事件内的 style 更新没有反向跳动。
  const finalCardBox = await card.boundingBox();
  expect(finalCardBox).not.toBeNull();
  if (finalCardBox === null) {
    throw new Error('Expected card to remain visible after dragging');
  }
  expect(finalCardBox.x - zoomedCardBox.x).toBeCloseTo(48, 0);

  const samples = await page.evaluate(
    () =>
      (
        window as typeof window & {
          readonly __cardDragMutationSamples?: readonly DragMutationSample[];
        }
      ).__cardDragMutationSamples ?? []
  );
  const dragMoveIndexes = [
    ...new Set(samples.map((sample) => sample.moveIndex)),
  ].slice(-4);
  expect(dragMoveIndexes).toHaveLength(4);
  for (const moveIndex of dragMoveIndexes) {
    const moveSamples = samples.filter(
      (sample) => sample.moveIndex === moveIndex
    );
    const positions = [
      ...moveSamples.map((sample) => sample.oldLeft),
      moveSamples.at(-1)?.finalLeft ?? 0,
    ];
    for (let index = 1; index < positions.length; index += 1) {
      expect(
        (positions[index] ?? 0) - (positions[index - 1] ?? 0)
      ).toBeGreaterThanOrEqual(-0.5);
    }
  }
  expect(browserErrors).toEqual([]);
});
