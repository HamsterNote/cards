import { expect, test } from '@playwright/test';

const URL = '/tests/e2e/external-card-drag-task-9-harness.tsx';
async function install(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.evaluate(async (url) => {
    const { installExternalDragTaskNineHarness } = await import(url);
    await installExternalDragTaskNineHarness();
  }, URL);
}
test.afterEach(async ({ page }) => {
  await page.evaluate(() => window.__externalDragTaskNine?.dispose());
});

test('uses flushSync-controlled cards and callback version before parent layout End', async ({
  page,
}) => {
  await install(page);
  await page.evaluate(() => {
    window.__externalDragTaskNine?.start('candidate');
    window.__externalDragTaskNine?.move();
    window.__externalDragTaskNine?.flushAndEnd();
  });
  await expect
    .poll(() =>
      page.evaluate(() => window.__externalDragTaskNine?.completion())
    )
    .toEqual(expect.objectContaining({ status: 'placed' }));
  expect(
    await page.evaluate(() => window.__externalDragTaskNine?.callbacks())
  ).toEqual([2]);
  expect(
    await page.evaluate(() =>
      window.__externalDragTaskNine?.cards().map((card) => card.id)
    )
  ).toEqual(['base', 'host', 'candidate']);
});

for (const callback of ['change', 'select'] as const) {
  test(`rejects ${callback} reentry on an End-recorded Finger and permits fresh reuse`, async ({
    page,
  }) => {
    await install(page);
    await page.evaluate((kind) => {
      window.__externalDragTaskNine?.setReentry(kind);
      window.__externalDragTaskNine?.start('first');
      window.__externalDragTaskNine?.move();
      window.__externalDragTaskNine?.end();
    }, callback);
    await expect
      .poll(() =>
        page.evaluate(() => window.__externalDragTaskNine?.completion())
      )
      .toEqual(expect.objectContaining({ status: 'placed' }));
    expect(
      await page.evaluate(() => window.__externalDragTaskNine?.rejection())
    ).toBe('missing-active-pointer');
    expect(
      await page.evaluate(() => window.__externalDragTaskNine?.fingers())
    ).toBe(0);
    await page.evaluate(() => {
      window.__externalDragTaskNine?.setReentry(undefined);
      window.__externalDragTaskNine?.start('fresh');
      window.__externalDragTaskNine?.move();
      window.__externalDragTaskNine?.end();
    });
    await expect
      .poll(() =>
        page.evaluate(() => window.__externalDragTaskNine?.completion())
      )
      .toEqual(
        expect.objectContaining({
          status: 'placed',
          card: expect.objectContaining({ id: 'fresh' }),
        })
      );
  });
}
