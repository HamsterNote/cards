import { expect, type Page } from '@playwright/test';

const HARNESS_URL = '/tests/e2e/external-card-drag-session-harness.tsx';

export async function installExternalDragSessionHarness(
  page: Page,
  virtualPaper = false
): Promise<readonly string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
  await page.evaluate(
    async ({ url, virtualPaper: enabled }) => {
      const { installExternalDragHarness } = await import(url);
      await installExternalDragHarness({ virtualPaper: enabled });
    },
    { url: HARNESS_URL, virtualPaper }
  );
  // 等待画布 CSS 与首帧布局就绪：合成指针事件依赖 wrapper 的
  // getBoundingClientRect，并行负载下 CSS 注入可能晚于模块执行。
  await expect(page.locator('[data-card-canvas]')).toBeVisible();
  await expect(page.locator('[data-card-id="parent"]')).toBeVisible();
  return errors;
}

export async function externalDragCompletion(page: Page, id: string) {
  await expect
    .poll(() =>
      page.evaluate(
        async (sessionId) =>
          window.__externalDragHarness?.completion(sessionId),
        id
      )
    )
    .not.toBeUndefined();
  return page.evaluate(
    async (sessionId) => window.__externalDragHarness?.completion(sessionId),
    id
  );
}
