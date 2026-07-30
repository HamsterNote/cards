import { execFileSync, spawn } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const consumer = mkdtempSync(join(tmpdir(), 'cards-packed-consumer-'));
const root = process.cwd();
const modules = join(consumer, 'node_modules');
const linkDependency = (name) => {
  const source = resolve(root, 'node_modules', name);
  const target = join(modules, name);
  mkdirSync(dirname(target), { recursive: true });
  symlinkSync(source, target, 'junction');
};
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
  mkdirSync(join(modules, '@hamster-note'), { recursive: true });
  execFileSync(
    'tar',
    ['-xzf', join(consumer, archive), '-C', join(modules, '@hamster-note')],
    { stdio: 'inherit' }
  );
  cpSync(
    join(modules, '@hamster-note', 'package'),
    join(modules, '@hamster-note', 'cards'),
    { recursive: true }
  );
  rmSync(join(modules, '@hamster-note', 'package'), {
    recursive: true,
    force: true,
  });
  for (const dependency of [
    '@system-ui-js/multi-drag',
    '@hamster-note/components',
    '@hamster-note/notes',
    '@hamster-note/virtual-paper',
    'react',
    'react-dom',
  ])
    linkDependency(dependency);
  writeFileSync(
    join(consumer, 'package.json'),
    JSON.stringify({ type: 'module' })
  );
  writeFileSync(
    join(consumer, 'index.html'),
    '<script type="module" src="/consumer.ts"></script>'
  );
  writeFileSync(
    join(consumer, 'consumer.ts'),
    "import { CardCanvas, type CardCanvasHandle } from '@hamster-note/cards'; import { Drag } from '@system-ui-js/multi-drag'; const source = document.createElement('div'); const drag = new Drag(source, { setPose: () => {} }); const handle: CardCanvasHandle | null = null; document.body.dataset.consumerRuntime = String(typeof CardCanvas === 'object' && typeof Drag === 'function' && handle === null); drag.destroy();"
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
      '--skipLibCheck',
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
  await page.goto('http://127.0.0.1:9902');
  if (
    (await page.locator('body').getAttribute('data-consumer-runtime')) !==
    'true'
  )
    throw new Error('Packed consumer did not run host Drag');
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
