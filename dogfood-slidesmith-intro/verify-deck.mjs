// Verify the dogfood deck: renders, no errors, demo animates, transcript+presenter wired.
import { chromium } from 'playwright-core';
import { resolve } from 'node:path';

const deck = 'file://' + resolve(process.cwd(), 'dogfood-slidesmith-intro/slides.html');
const checks = [];
const ok = (n, c, x = '') => checks.push({ n, pass: !!c, x });

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errs.push('console:' + m.text()); });
  await page.goto(deck, { waitUntil: 'load' });
  await page.waitForTimeout(400);

  const info = await page.evaluate(() => ({
    slides: (window.deckAPI && window.deckAPI.total) || document.querySelectorAll('#deck .slide').length,
    notes: (window.SM_NOTES || []).length,
    hasPresenterTpl: typeof window.SM_PRESENTER_HTML === 'string' && window.SM_PRESENTER_HTML.indexOf('sm-sync') > -1,
    api: !!(window.deckAPI && typeof window.deckAPI.next === 'function'),
    total: window.deckAPI && window.deckAPI.total,
    titles: (window.deckAPI && window.deckAPI.SLIDE_TITLES) || [],
  }));
  ok('renders 16 slides', info.slides === 16, 'got ' + info.slides);
  ok('transcript embedded (1 note per slide)', info.notes === info.slides, info.notes + ' notes / ' + info.slides + ' slides');
  ok('single-file presenter template present', info.hasPresenterTpl);
  ok('deckAPI exposed', info.api);
  ok('titles derived', info.titles.length === 16 && !!info.titles[0]);

  // demo animation runs (read the REAL in-deck node, not the thumbnail clone)
  const states = new Set();
  for (let i = 0; i < 14; i++) {
    states.add(await page.evaluate(() => document.querySelector('#deck .sm-demo .sm-demo__badge')?.textContent || ''));
    await page.waitForTimeout(700);
  }
  ok('demo badge cycles ≥3 states', states.size >= 3, [...states].join(' | '));
  const dupIds = await page.evaluate(() => {
    const ids = {}; document.querySelectorAll('[id]').forEach(e => ids[e.id] = (ids[e.id]||0)+1);
    return Object.entries(ids).filter(([,n]) => n > 1).map(([k,n]) => k+'×'+n);
  });
  ok('no duplicate ids (thumbnail-clone safe)', dupIds.length === 0, dupIds.join(', '));

  // navigate + presenter sync: stub window.open to capture the popout and its messages
  const sync = await page.evaluate(async () => {
    const got = [];
    const fakeDoc = { open(){}, close(){}, write(){} };
    const fakeWin = { closed: false, focus(){}, document: fakeDoc,
      postMessage(m){ got.push(m); }, addEventListener(){}, };
    window.open = () => fakeWin;
    window.deckAPI.openPresenter();
    window.deckAPI.setActive(3);
    await new Promise(r => setTimeout(r, 100));
    window.deckAPI.setActive(10);
    await new Promise(r => setTimeout(r, 100));
    const last = got.filter(m => m && m.type === 'sm-sync').pop();
    return { count: got.length, last };
  });
  ok('presenter popout receives sync', sync.count > 0, 'msgs=' + sync.count);
  ok('sync carries the right slide note', !!(sync.last && sync.last.note && sync.last.idx === 10), JSON.stringify(sync.last && { idx: sync.last.idx, title: sync.last.title, noteLen: (sync.last.note||'').length }));

  ok('no page/console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally { await browser.close(); }

let pass = 0;
for (const c of checks) { console.log((c.pass ? '✓' : '✗') + ' ' + c.n + (c.x ? '  — ' + c.x : '')); if (c.pass) pass++; }
console.log(`\n${pass}/${checks.length} checks passed`);
process.exit(pass === checks.length ? 0 : 1);
