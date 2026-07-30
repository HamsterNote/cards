import { expect, test } from '@playwright/test';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Socket } from 'node:net';
import { promisify } from 'node:util';

const UNMOUNT_HARNESS =
  '/tests/e2e/external-card-drag-task-10-unmount-harness.tsx';
const PORTAL_HARNESS =
  '/tests/e2e/external-card-drag-task-10-portal-harness.tsx';
const execFileAsync = promisify(execFile);

type PackedConsumerCleanupReceipt = {
  readonly browserClosed: boolean;
  readonly consumerRemoved: boolean;
  readonly serverPid: number;
  readonly serverExited: boolean;
};

function isCleanupReceipt(
  value: unknown
): value is PackedConsumerCleanupReceipt {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.browserClosed === true &&
    candidate.consumerRemoved === true &&
    typeof candidate.serverPid === 'number' &&
    candidate.serverExited === true
  );
}

function processIsRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ESRCH') {
      return false;
    }
    throw error;
  }
}

async function portIsListening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket();
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.connect(port, '127.0.0.1');
  });
}

test.afterEach(async ({ page }) => {
  await page.evaluate(() => {
    window.__externalDragTaskTenUnmount?.dispose();
    window.__externalDragTaskTenPortal?.dispose();
  });
});

test('rejects a stale handle from the parent layout effect after flushSync unmount', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(async (url) => {
    const { installExternalDragTaskTenUnmountHarness } = await import(url);
    await installExternalDragTaskTenUnmountHarness();
  }, UNMOUNT_HARNESS);

  await page.evaluate(() =>
    window.__externalDragTaskTenUnmount?.unmountDuringParentLayout(
      'start-stale'
    )
  );

  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__externalDragTaskTenUnmount?.staleStartResult()
      )
    )
    .toBe('not-editable');
});

test('settles once as canvas-unmounted before a parent layout-effect Finger End', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.evaluate(async (url) => {
    const { installExternalDragTaskTenUnmountHarness } = await import(url);
    await installExternalDragTaskTenUnmountHarness();
  }, UNMOUNT_HARNESS);

  await page.evaluate(() => {
    window.__externalDragTaskTenUnmount?.start();
    window.__externalDragTaskTenUnmount?.move();
    window.__externalDragTaskTenUnmount?.unmountDuringParentLayout(
      'end-session'
    );
  });

  await expect
    .poll(() =>
      page.evaluate(() => window.__externalDragTaskTenUnmount?.completion())
    )
    .toEqual({ status: 'cancelled', reason: 'canvas-unmounted' });
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__externalDragTaskTenUnmount?.completionCount()
      )
    )
    .toBe(1);
  await expect(page.locator('[data-external-card-preview]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('quarantines owned SVG, shadow-root, and DocumentFragment Portals without touching the host Portal', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(async (url) => {
    const { installExternalDragTaskTenPortalHarness } = await import(url);
    await installExternalDragTaskTenPortalHarness();
  }, PORTAL_HARNESS);
  await page.evaluate(() => {
    window.__externalDragTaskTenPortal?.start();
    window.__externalDragTaskTenPortal?.move();
  });

  const preview = page.locator('[data-external-card-preview]');
  await expect(preview).toBeVisible();
  await expect(preview.locator('[data-task-ten-ordinary-title]')).toBeVisible();
  await expect(
    preview.locator('[data-task-ten-ordinary-content]')
  ).toBeVisible();
  for (const locator of [
    page.locator('[data-task-ten-owned-svg]'),
    page.locator('[data-task-ten-owned="shadow-button"]'),
  ]) {
    await expect(locator).toHaveAttribute('hidden', '');
    await expect(locator).toHaveAttribute('inert', '');
    await expect(locator).toHaveAttribute('aria-hidden', 'true');
    await expect(locator).toBeHidden();
  }
  expect(
    await page.evaluate(() =>
      window.__externalDragTaskTenPortal?.fragmentState()
    )
  ).toEqual({ count: 1, hidden: true, inert: true, ariaHidden: 'true' });

  await page.keyboard.press('Tab');
  await page.evaluate(() =>
    window.__externalDragTaskTenPortal?.activateOwned()
  );
  expect(
    await page.evaluate(() =>
      window.__externalDragTaskTenPortal?.activationCount()
    )
  ).toBe(0);
  const unrelated = page.locator('[data-task-ten-unrelated]');
  await expect(unrelated).toBeVisible();
  await expect(unrelated).not.toHaveAttribute('hidden', '');
  await unrelated.click();
  expect(
    await page.evaluate(() =>
      window.__externalDragTaskTenPortal?.activationCount()
    )
  ).toBe(1);

  await page.evaluate(() => window.__externalDragTaskTenPortal?.endOutside());
  await expect
    .poll(() =>
      page.evaluate(() => window.__externalDragTaskTenPortal?.completion())
    )
    .toEqual({ status: 'cancelled', reason: 'released-outside-canvas' });
  await expect(preview).toHaveCount(0);
  await expect(page.locator('[data-task-ten-owned-svg]')).toHaveCount(0);
  await expect(
    page.locator('[data-task-ten-owned="shadow-button"]')
  ).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      window.__externalDragTaskTenPortal?.fragmentState()
    )
  ).toEqual({ count: 0, hidden: false, inert: false, ariaHidden: null });
  await expect(unrelated).toBeVisible();
});

test('announces the Demo external drag result as a polite status without changing its display', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('[data-external-card-result]')).toHaveAttribute(
    'role',
    'status'
  );
});

test('cleans packed-consumer Chromium, Vite, and temporary files after a controlled failure', async () => {
  const testTempDirectory = mkdtempSync(
    join(tmpdir(), 'cards-packed-consumer-test-')
  );
  const receiptPath = join(testTempDirectory, 'cleanup.json');
  try {
    await expect(
      execFileAsync(process.execPath, ['scripts/check-packed-consumer.mjs'], {
        cwd: resolve(process.cwd()),
        env: {
          ...process.env,
          CARDS_PACKED_CONSUMER_CLEANUP_RECEIPT: receiptPath,
          CARDS_PACKED_CONSUMER_TEST_FAIL_AFTER_BROWSER: 'true',
          TMPDIR: testTempDirectory,
        },
      })
    ).rejects.toThrow('Controlled packed consumer failure');
    const receiptValue: unknown = JSON.parse(readFileSync(receiptPath, 'utf8'));
    expect(isCleanupReceipt(receiptValue)).toBe(true);
    if (!isCleanupReceipt(receiptValue))
      throw new Error('Invalid cleanup receipt');
    expect(receiptValue.consumerRemoved).toBe(true);
    expect(receiptValue.serverExited).toBe(true);
    expect(processIsRunning(receiptValue.serverPid)).toBe(false);
    expect(await portIsListening(9902)).toBe(false);
    expect(
      readdirSync(testTempDirectory).filter((name) =>
        name.startsWith('cards-packed-consumer-')
      )
    ).toEqual([]);
  } finally {
    rmSync(testTempDirectory, { recursive: true, force: true });
  }
});
