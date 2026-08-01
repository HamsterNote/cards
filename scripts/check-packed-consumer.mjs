import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const consumer = mkdtempSync(join(tmpdir(), 'cards-packed-consumer-'));
const root = process.cwd();
const waitForConsumer = async () => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch('http://127.0.0.1:9902');
      if (response.ok) return;
    } catch {
      // The Vite process has not bound the port yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Packed consumer Vite server did not start');
};
let browser;
let server;
let serverPid;
try {
  execFileSync('npm', ['pack', '--pack-destination', consumer], {
    stdio: 'inherit',
  });
  const archive = readdirSync(consumer).find((name) => name.endsWith('.tgz'));
  if (archive === undefined) throw new Error('Packed archive was not created');
  writeFileSync(
    join(consumer, 'package.json'),
    JSON.stringify({ private: true, type: 'module' })
  );
  execFileSync(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      join(consumer, archive),
      '@system-ui-js/multi-drag@^0.4.0',
      '@types/react@^19.2.17',
      '@types/react-dom@^19.2.3',
      'react@19.2.8',
      'react-dom@19.2.8',
    ],
    { cwd: consumer, stdio: 'inherit' }
  );
  writeFileSync(
    join(consumer, 'index.html'),
    '<script type="module" src="/consumer.ts"></script>'
  );
  writeFileSync(
    join(consumer, 'consumer.ts'),
    "import { CardCanvas, type CardContentBlock, type CardsThemeAccent } from '@hamster-note/cards'; import { Drag } from '@system-ui-js/multi-drag'; import { createElement } from 'react'; import { flushSync } from 'react-dom'; import { createRoot } from 'react-dom/client'; const source = document.createElement('div'); const drag = new Drag(source, { setPose: () => {} }); const contentBlock: CardContentBlock = { id: 'paragraph-1', kind: 'paragraph', text: 'Packed consumer' }; const themeColor: CardsThemeAccent = '#7c83ff'; const container = document.createElement('div'); document.body.append(container); const root = createRoot(container); flushSync(() => root.render(createElement(CardCanvas, { cards: [{ id: 'card-1', title: 'Packed consumer', content: contentBlock.text, contentBlocks: [contentBlock], x: 0, y: 0, width: 240, height: 160 }], themeColor }))); document.body.dataset.consumerRuntime = String(typeof Drag === 'function' && container.querySelector('[data-card-canvas]') !== null); drag.destroy(); root.unmount();"
  );
  execFileSync(
    resolve(root, 'node_modules', '.bin', 'tsc'),
    [
      '--noEmit',
      '--moduleResolution',
      'bundler',
      '--module',
      'esnext',
      '--target',
      'es2022',
      'consumer.ts',
    ],
    { cwd: consumer, stdio: 'inherit' }
  );
  server = spawn(
    resolve(root, 'node_modules', '.bin', 'vite'),
    ['--host', '127.0.0.1', '--port', '9902'],
    { cwd: consumer, stdio: 'ignore' }
  );
  serverPid = server.pid;
  await waitForConsumer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('http://127.0.0.1:9902');
  try {
    await page.locator('body[data-consumer-runtime="true"]').waitFor();
  } catch {
    throw new Error(
      pageErrors.length === 0
        ? 'Packed consumer did not render CardCanvas with host React'
        : `Packed consumer page errors: ${pageErrors.join('; ')}`
    );
  }
  if (process.env.CARDS_PACKED_CONSUMER_TEST_FAIL_AFTER_BROWSER === 'true') {
    throw new Error('Controlled packed consumer failure');
  }
} finally {
  await browser?.close();
  if (server !== undefined) {
    server.kill();
    await once(server, 'exit');
  }
  rmSync(consumer, { recursive: true, force: true });
  const receipt = process.env.CARDS_PACKED_CONSUMER_CLEANUP_RECEIPT;
  if (receipt !== undefined && serverPid !== undefined) {
    writeFileSync(
      receipt,
      JSON.stringify({
        browserClosed: browser === undefined || !browser.isConnected(),
        consumerRemoved: true,
        serverPid,
        serverExited: true,
      })
    );
  }
}
