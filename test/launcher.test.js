'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function boot() {
  let now = 0, ready, redirected;
  const timers = new Map(), images = [], elements = {
    'launch-status': { textContent: '' }, 'launch-retry': { style: {} },
  };
  let next = 0;
  vm.runInNewContext(fs.readFileSync(require.resolve('../app/launcher.js'), 'utf8'), {
    Date: { now: () => now },
    Image: function () { images.push(this); },
    window: { addEventListener: (_, fn) => { ready = fn; }, location: { replace: url => { redirected = url; } } },
    document: { getElementById: id => elements[id] },
    setTimeout: fn => { timers.set(++next, fn); return next; }, clearTimeout: id => timers.delete(id),
  });
  ready();
  return { images, elements, redirect: () => redirected, time: n => { now = n; }, tick() {
    const [id, fn] = timers.entries().next().value; timers.delete(id); fn();
  } };
}
test('launcher waits for the local helper and redirects only after it is ready', () => {
  const app = boot();
  app.images[0].onerror();
  assert.equal(app.redirect(), undefined);
  app.tick();
  app.images[1].onload();
  assert.equal(app.redirect(), 'http://127.0.0.1:32190/');
});
test('launcher handles a hung helper and offers a fresh retry after timeout', () => {
  const app = boot();
  app.time(61000); app.tick();
  assert.equal(app.redirect(), undefined);
  assert.equal(app.elements['launch-retry'].style.display, 'block');
  app.images[0].onload();
  assert.equal(app.redirect(), undefined, 'late probe must not redirect');
  app.elements['launch-retry'].onclick();
  app.images[1].onload();
  assert.equal(app.redirect(), 'http://127.0.0.1:32190/');
});
