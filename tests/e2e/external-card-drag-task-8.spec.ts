import { expect, test } from '@playwright/test';

const HARNESS_URL = '/tests/e2e/external-card-drag-task-8-harness.tsx';

async function install(page: import('@playwright/test').Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.evaluate(async (url) => {
    const { installExternalDragTaskEightHarness } = await import(url);
    await installExternalDragTaskEightHarness();
  }, HARNESS_URL);
  await expect(page.locator('[data-card-canvas]')).toBeVisible();
  return errors;
}

test.describe('CardCanvas external drag Todo 8 boundaries', () => {
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => window.__externalDragTaskEight?.dispose());
  });

  for (const callbackMode of ['throw-change', 'throw-select'] as const) {
    test(`keeps a reusable host Drag clean when ${callbackMode} throws`, async ({
      page,
    }) => {
      const errors = await install(page);
      await page.evaluate((mode) => {
        window.__externalDragTaskEight?.setCallbackMode(mode);
        window.__externalDragTaskEight?.start(`first-${mode}`, false);
        window.__externalDragTaskEight?.move(300, 300);
        window.__externalDragTaskEight?.end(330, 320);
      }, callbackMode);
      await expect
        .poll(() =>
          page.evaluate(() => window.__externalDragTaskEight?.fingers())
        )
        .toBe(0);
      await expect
        .poll(() =>
          page.evaluate(() => window.__externalDragTaskEight?.completion())
        )
        .toEqual(expect.objectContaining({ status: 'placed' }));
      await expect
        .poll(() => errors)
        .toContain(
          callbackMode === 'throw-change' ? 'change failure' : 'select failure'
        );
      await page.evaluate(() => {
        window.__externalDragTaskEight?.setCallbackMode('normal');
        window.__externalDragTaskEight?.start('second', false);
        window.__externalDragTaskEight?.move(300, 300);
        window.__externalDragTaskEight?.end(330, 320);
      });
      await expect
        .poll(() =>
          page.evaluate(() => window.__externalDragTaskEight?.completion())
        )
        .toEqual(
          expect.objectContaining({
            status: 'placed',
            card: expect.objectContaining({ id: 'second' }),
          })
        );
    });
  }

  test('safely isolates opaque title and content renderer Portals throughout a candidate preview', async ({
    page,
  }) => {
    const errors = await install(page);
    await page.evaluate(() => {
      window.__externalDragTaskEight?.start('portal-preview', true);
      window.__externalDragTaskEight?.move(300, 300);
    });
    const preview = page.locator('[data-external-card-preview]');
    await expect(preview).toBeVisible();
    await expect(
      preview.locator('[data-task-eight-ordinary="title"]')
    ).toBeVisible();
    await expect(
      preview.locator('[data-task-eight-ordinary="content"]')
    ).toBeVisible();
    const portals = page.locator('[data-task-eight-portal]');
    await expect(portals).toHaveCount(8);
    expect(
      await portals.evaluateAll((elements) =>
        elements.every(
          (element) =>
            element instanceof HTMLElement &&
            element.hidden &&
            element.hasAttribute('inert') &&
            element.getAttribute('aria-hidden') === 'true'
        )
      )
    ).toBe(true);
    await page.keyboard.press('Tab');
    expect(
      await page.evaluate(
        () =>
          document.activeElement?.closest('[data-task-eight-portal]') === null
      )
    ).toBe(true);
    await page.evaluate(() => {
      document
        .querySelectorAll<HTMLElement>('[data-task-eight-portal]')
        .forEach((element) => {
          element.focus();
          element.click();
          element.dispatchEvent(
            new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' })
          );
        });
    });
    expect(
      await page.evaluate(() => window.__externalDragTaskEight?.activations())
    ).toBe(0);
    await page.evaluate(() => window.__externalDragTaskEight?.end(20, 20));
    await expect(preview).toHaveCount(0);
    await expect(portals).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

const DRAG_URL = '/node_modules/.vite/deps/@system-ui-js_multi-drag.js';
const EXTERNAL_URL = '/src/components/ExternalCardDrag.ts';

test('captures input.drag once and turns a throwing getter into the existing pointer rejection', async ({
  page,
}) => {
  await page.goto('/');
  const result = await page.evaluate(
    async (urls) => {
      const { prepareExternalCardDragStart } = await import(urls.external);
      const { Drag } = await import(urls.drag);
      const source = document.createElement('div');
      document.body.append(source);
      const drag = new Drag(source, { setPose: () => {} });
      source.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          button: 0,
          pointerId: 81,
        })
      );
      let reads = 0;
      const input = Object.defineProperty(
        {
          card: {
            id: 'one-read',
            title: 'one-read',
            content: 'one-read',
            x: 0,
            y: 0,
            width: 120,
            height: 80,
          },
        },
        'drag',
        {
          get() {
            reads += 1;
            if (reads > 1) throw new TypeError('drag read twice');
            return drag;
          },
        }
      );
      const context = {
        editable: true,
        onCardsChange: () => {},
        cards: [],
        activeCandidateCardIds: new Set<string>(),
        activeDrags: new Set(),
      };
      const accepted = prepareExternalCardDragStart(input, context);
      const throwing = prepareExternalCardDragStart(
        Object.defineProperty({ card: input.card }, 'drag', {
          get() {
            throw new TypeError('drag getter');
          },
        }),
        context
      );
      drag.destroy();
      source.remove();
      return {
        accepted: accepted.ok
          ? { ok: true, sameDrag: accepted.preparation.drag === drag }
          : accepted,
        reads,
        throwing,
      };
    },
    { external: EXTERNAL_URL, drag: DRAG_URL }
  );
  expect(result).toEqual({
    accepted: { ok: true, sameDrag: true },
    reads: 1,
    throwing: { ok: false, reason: 'missing-active-pointer' },
  });
});
