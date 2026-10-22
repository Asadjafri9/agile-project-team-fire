// Run against a local `corepack pnpm start` server. Uses installed Chrome, without test dependencies.
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

const chromePath = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = await mkdtemp(join(tmpdir(), 'team-fire-cdp-'));
const browser = spawn(chromePath, ['--headless=new', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=0', '--remote-allow-origins=*', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
let ws;
let nextId = 1;
const waiting = new Map();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function command(method, params = {}) {
  const id = nextId++;
  const promise = new Promise((resolve, reject) => waiting.set(id, { resolve, reject }));
  ws.send(JSON.stringify({ id, method, params }));
  return promise;
}
async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}
async function navigate(path) {
  await command('Page.navigate', { url: `http://localhost:3000${path}` });
  for (let i = 0; i < 80; i++) {
    if (await evaluate(`location.pathname === ${JSON.stringify(path)} && !!document.querySelector('.page-heading h1')`)) return;
    await pause(100);
  }
  throw new Error(`Page did not hydrate: ${path}`);
}
async function key(key, code, virtualKeyCode) {
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: virtualKeyCode });
  await command('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: virtualKeyCode });
}
try {
  let port;
  for (let i = 0; i < 100; i++) {
    try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await pause(100); }
  }
  if (!port) throw new Error('Chrome debugging port did not open');
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (!message.id || !waiting.has(message.id)) return;
    const item = waiting.get(message.id); waiting.delete(message.id);
    message.error ? item.reject(new Error(message.error.message)) : item.resolve(message.result);
  });
  await command('Page.enable'); await command('Runtime.enable');
  const widths = [375, 768, 1024, 1440];
  const sections = ['overview', 'backlog', 'planning', 'board', 'analytics', 'team', 'evidence'];
  for (const width of widths) {
    await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    for (const section of sections) {
      await navigate(`/projects/team-fire/${section}`);
      const result = await evaluate(`({width: innerWidth, documentWidth: document.documentElement.scrollWidth, heading: document.querySelector('h1')?.textContent, boardScroll: document.querySelector('.board-scroll')?.scrollWidth > document.querySelector('.board-scroll')?.clientWidth})`);
      if (result.documentWidth > width + 1) {
        const offenders = await evaluate(`[...document.querySelectorAll('body *')].map(e => ({tag:e.tagName, class:e.className?.baseVal ?? e.className, right:Math.round(e.getBoundingClientRect().right), left:Math.round(e.getBoundingClientRect().left), scroll:e.scrollWidth, client:e.clientWidth})).filter(e => e.right > innerWidth + 2 && e.left >= 0).slice(0,12)`);
        throw new Error(`Horizontal page overflow at ${width}px / ${section}: ${JSON.stringify(result)} ${JSON.stringify(offenders)}`);
      }
      if (section === 'board' && width < 1200 && !result.boardScroll) throw new Error(`Expected contained board scrolling at ${width}px`);
      if ((section === 'board' && width === 375) || (section === 'analytics' && width === 1440)) {
        const png = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: true });
        await writeFile(join(tmpdir(), `team-fire-cdp-${section}-${width}.png`), Buffer.from(png.data, 'base64'));
      }
      console.log(`${width}px ${section}: ${result.heading}; page width ${result.documentWidth}`);
    }
  }
  await command('Emulation.setDeviceMetricsOverride', { width: 375, height: 900, deviceScaleFactor: 1, mobile: false });
  await navigate('/projects/team-fire/backlog');
  await evaluate(`(() => { const button = document.querySelector('.backlog-table .item-key'); button.focus(); button.click(); return true; })()`);
  for (let i = 0; i < 20 && !(await evaluate(`!!document.querySelector('[role="dialog"]')`)); i++) await pause(50);
  const modal = await evaluate(`({open: !!document.querySelector('[role="dialog"]'), focusInside: !!document.activeElement?.closest('[role="dialog"]')})`);
  if (!modal.open || !modal.focusInside) throw new Error(`Modal focus failed: ${JSON.stringify(modal)}`);
  await key('Escape', 'Escape', 27); await pause(200);
  const closed = await evaluate(`({open: !!document.querySelector('[role="dialog"]'), returned: document.activeElement?.classList.contains('item-key')})`);
  if (closed.open || !closed.returned) throw new Error(`Modal Escape/focus return failed: ${JSON.stringify(closed)}`);
  await navigate('/projects/team-fire/analytics');
  const tables = await evaluate(`(() => { document.querySelectorAll('.chart-table summary').forEach(s => s.click()); return [...document.querySelectorAll('.chart-table')].map(d => ({open: d.open, rows: d.querySelectorAll('tbody tr').length})); })()`);
  if (tables.length !== 3 || tables.some(t => !t.open || !t.rows)) throw new Error(`Chart table failed: ${JSON.stringify(tables)}`);
  await navigate('/projects/team-fire/board');
  await evaluate(`document.querySelector('select[aria-label="Move FIRE-107 to status"]').focus()`);
  await key('ArrowDown', 'ArrowDown', 40); await key('Enter', 'Enter', 13); await pause(250);
  const moved = await evaluate(`document.querySelector('select[aria-label="Move FIRE-107 to status"]')?.value`);
  if (moved !== 'In Progress') throw new Error(`Keyboard status move failed: ${moved}`);
  await navigate('/projects/team-fire/backlog');
  await evaluate(`(() => { const select = document.querySelector('.role-select select'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'Viewer'); select.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`);
  await pause(100);
  if (await evaluate(`!![...document.querySelectorAll('button')].find(b => b.textContent?.includes('New item'))`)) throw new Error('Viewer can see New item action');
  await evaluate(`document.querySelector('.sidebar-bottom .nav-button:nth-child(2)').click()`);
  await pause(100);
  await evaluate(`[...document.querySelectorAll('[role="dialog"] button')].find(b => b.textContent?.trim() === 'Reset demo')?.click()`);
  await pause(200);
  const reset = await evaluate(`({role: localStorage.getItem('team-fire-prototype-v1') && JSON.parse(localStorage.getItem('team-fire-prototype-v1')).role, status: JSON.parse(localStorage.getItem('team-fire-prototype-v1')).projects[0].items.find(i=>i.key==='FIRE-107').status})`);
  if (reset.role !== 'Product Owner' || reset.status !== 'To Do') throw new Error(`Demo reset failed: ${JSON.stringify(reset)}`);
  console.log(`Modal focus and Escape: pass; chart tables: ${tables.map(t => t.rows).join(', ')} rows; keyboard board move, Viewer controls, and reset: pass`);
} finally {
  ws?.close(); browser.kill(); await pause(300);
  if (!resolve(profile).startsWith(resolve(tmpdir()) + sep)) throw new Error('Refusing to remove a browser profile outside the temporary directory');
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
