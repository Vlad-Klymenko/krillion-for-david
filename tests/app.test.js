import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as engine from '../engine.js';

const appSource = readFileSync(new URL('../app.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '');
const pageSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const storageKey = 'krillion-for-david-v1';

// These tests execute the real app and its registered event handlers. The
// intentionally small DOM implements only the browser surfaces this app uses;
// layout and browser rendering are checked separately in the browser.
class FakeElement {
  constructor(document, tagName = 'div') {
    this.document = document;
    this.tagName = tagName.toUpperCase();
    this.hidden = false;
    this.disabled = false;
    this.checked = false;
    this.open = false;
    this.value = '';
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.style = {};
    this.classes = new Set();
    this.classList = {
      toggle: (name, force) => {
        const include = force ?? !this.classes.has(name);
        if (include) this.classes.add(name);
        else this.classes.delete(name);
        return include;
      },
    };
    this._text = '';
    this._html = '';
  }
  set textContent(value) {
    this._text = value == null ? '' : String(value);
    this._html = '';
    this.children = [];
  }
  get textContent() {
    return this._text + this.children.map(child => typeof child === 'string' ? child : child.textContent).join('');
  }
  set innerHTML(value) {
    this._html = String(value);
    this._text = '';
    this.children = [];
    this.document.registerMarkup(this._html);
  }
  get innerHTML() { return this._html; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  replaceChildren(...children) { this._text = ''; this._html = ''; this.children = children; }
  append(...children) { this.children.push(...children); }
  after() {}
  querySelector(selector) {
    if (selector !== 'button' || this.tagName !== 'FORM') {
      throw new Error(`Unsupported fake selector: ${selector}`);
    }
    return this.submitButton ||= new FakeElement(this.document, 'button');
  }
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(callback);
  }
  dispatch(type) {
    const event = { target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    for (const callback of this.listeners.get(type) || []) callback(event);
    return event;
  }
  focus() { this.document.activeElement = this; }
  select() { this.selected = true; }
  close() { this.open = false; }
  showModal() { this.open = true; }
}

function createHarness({ storage = new Map(), begin = true } = {}) {
  const document = {
    elements: new Map(),
    listeners: new Map(),
    hidden: false,
    activeElement: null,
    getElementById(id) { return this.elements.get(id) || null; },
    createElement(tagName) { return new FakeElement(this, tagName); },
    createTextNode(text) { return String(text); },
    addEventListener(type, callback) { this.listeners.set(type, callback); },
    registerMarkup(markup) {
      for (const match of markup.matchAll(/<([a-z][\w-]*)\b([^>]*\bid="([^"]+)"[^>]*)>/gi)) {
        const element = this.createElement(match[1]);
        element.hidden = /\shidden(?:\s|=|$)/i.test(match[2]);
        this.elements.set(match[3], element);
      }
    },
  };
  document.registerMarkup(pageSource);
  let now = 1_000;
  let timerId = 0;
  const intervals = new Map();
  const questions = Array.from({ length: 20 }, (_, index) => ({
    id: `test-${index}`,
    category: 'Test category',
    prompt: `Test prompt ${index}`,
    note: 'Use a common or rare answer.',
    source: { title: 'Fixture source', url: 'https://example.org/source' },
    answers: [
      { name: 'Common answer', aliases: [], score: 10 },
      { name: 'Rare answer', aliases: [], score: 100 },
    ],
  }));
  const context = vm.createContext({
    ...engine,
    QUESTIONS: questions,
    document,
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
    Date: { now: () => now },
    setInterval(callback, delay) {
      const id = ++timerId;
      intervals.set(id, { callback, delay, next: now + delay });
      return id;
    },
    clearInterval(id) { intervals.delete(id); },
    navigator: {},
    location: { href: 'https://example.org/krillion-for-david/' },
  });
  vm.runInContext(appSource, context, { filename: 'app.js' });
  if (begin) document.getElementById('begin-button').dispatch('click');

  const element = id => {
    const found = document.getElementById(id);
    assert.ok(found, `Missing element #${id}`);
    return found;
  };
  return {
    element,
    storage,
    activeTimers: () => intervals.size,
    score: () => Number(element('total-points').textContent.replaceAll(',', '')),
    submit(answer) {
      assert.equal(element('answer-input').disabled, false, 'Answer field should be available');
      element('answer-input').value = answer;
      return element('answer-form').dispatch('submit');
    },
    click(id) {
      const target = element(id);
      assert.equal(target.hidden, false, `#${id} should be visible`);
      assert.equal(target.disabled, false, `#${id} should be enabled`);
      target.dispatch('click');
    },
    setTimed(value) {
      element('timer-toggle').checked = value;
      element('timer-toggle').dispatch('change');
    },
    jump(milliseconds) { now += milliseconds; },
    advance(milliseconds) {
      const targetTime = now + milliseconds;
      while (intervals.size) {
        const nextTime = Math.min(...[...intervals.values()].map(interval => interval.next));
        if (nextTime > targetTime) break;
        now = nextTime;
        for (const [id, interval] of [...intervals]) {
          if (intervals.has(id) && interval.next <= now) {
            interval.next += interval.delay;
            interval.callback();
          }
        }
      }
      now = targetTime;
    },
  };
}

function completeDive(game) {
  const prompts = [];
  for (let index = 0; index < 7 && !game.element('game-screen').hidden; index++) {
    prompts.push(game.element('prompt').textContent);
    if (!game.element('skip-button').hidden) game.click('skip-button');
    game.click('next-button');
  }
  assert.equal(game.element('game-screen').hidden, true, 'Dive should reach its results');
  assert.equal(game.element('results-screen').hidden, false);
  return prompts;
}

test('the surface screen waits for Begin Descent before starting a saved timer', () => {
  const storage = new Map([[storageKey, JSON.stringify({ timed: true })]]);
  const game = createHarness({ storage, begin: false });
  assert.equal(game.element('surface-screen').hidden, false);
  assert.equal(game.element('dive-interface').hidden, true);
  assert.equal(game.activeTimers(), 0);
  game.advance(60_000);
  assert.equal(game.element('retry-button').hidden, true);
  game.click('begin-button');
  assert.equal(game.element('surface-screen').hidden, true);
  assert.equal(game.element('dive-interface').hidden, false);
  assert.equal(game.activeTimers(), 1);
  assert.match(game.element('timer-readout').innerHTML, /^25/);
  game.submit('Rare answer');
  assert.equal(game.score(), 100);
});

test('100 wrong guesses leave the current prompt active with no score penalty', () => {
  const game = createHarness();
  const prompt = game.element('prompt').textContent;
  for (let index = 0; index < 100; index++) {
    assert.equal(game.submit(`wrong answer ${index}`).defaultPrevented, true);
  }
  assert.equal(game.element('prompt').textContent, prompt);
  assert.equal(game.element('answer-input').disabled, false);
  assert.equal(game.element('answer-form').querySelector('button').disabled, false);
  assert.equal(game.element('retry-button').hidden, true);
  assert.equal(game.element('next-button').hidden, true);
  assert.match(game.element('answer-feedback').textContent, /unlimited guesses/i);
  assert.equal(game.score(), 0);
  assert.equal(game.activeTimers(), 0);
  game.submit('Common answer');
  completeDive(game);
  assert.match(game.element('results-screen').innerHTML, /101 guesses/);
});

test('unlimited retries keep the best score through 10 → 100 → 10 and a skip', () => {
  const game = createHarness();
  game.submit('Common answer');
  assert.equal(game.score(), 10);
  game.click('retry-button');
  assert.equal(game.element('answer-input').disabled, false);
  game.submit('Rare answer');
  assert.equal(game.score(), 100);
  game.click('retry-button');
  game.submit('Common answer');
  assert.equal(game.score(), 100);
  assert.match(game.element('answer-result').innerHTML, /Best kept: Rare answer · 100 pts/);
  game.click('retry-button');
  game.click('skip-button');
  assert.equal(game.score(), 100);
  assert.match(game.element('answer-result').innerHTML, /Your best answer stays: Rare answer/);
});

test('results, replay, new dives, and persisted personal best work through UI events', () => {
  const game = createHarness();
  game.submit('Rare answer');
  const originalPrompts = completeDive(game);
  assert.equal(originalPrompts.length, 7);
  assert.equal(new Set(originalPrompts).size, 7);
  assert.match(game.element('results-screen').innerHTML, /100 \/ 700 points/);
  assert.match(game.element('results-screen').innerHTML, /new personal best/);
  assert.equal(game.element('personal-best').textContent, '1,000 m');
  assert.equal(JSON.parse(game.storage.get(storageKey)).best, 100);

  game.click('replay-dive');
  assert.equal(game.element('results-screen').hidden, true);
  assert.equal(game.score(), 0);
  assert.equal(game.element('round-label').textContent, 'PROMPT 1 OF 7');
  const replayedPrompts = completeDive(game);
  assert.deepEqual(replayedPrompts, originalPrompts);
  assert.equal(game.element('personal-best').textContent, '1,000 m');

  game.click('fresh-dive');
  const freshPrompts = completeDive(game);
  assert.ok(freshPrompts.every(prompt => !originalPrompts.includes(prompt)));
  const reloaded = createHarness({ storage: game.storage });
  assert.equal(reloaded.element('personal-best').textContent, '1,000 m');
  assert.equal(reloaded.score(), 0);
});

test('timer expires, retries receive 25 seconds, and switching off removes the limit', () => {
  const game = createHarness();
  game.setTimed(true);
  assert.match(game.element('timer-readout').innerHTML, /^25<span>/);
  assert.equal(game.activeTimers(), 1);
  game.advance(24_000);
  assert.match(game.element('timer-readout').innerHTML, /^1<span>/);
  game.submit('wrong answer');
  assert.equal(game.element('answer-input').disabled, false);
  game.advance(1_000);
  assert.match(game.element('timer-readout').innerHTML, /^0<span>/);
  assert.equal(game.element('answer-input').disabled, true);
  assert.equal(game.element('retry-button').hidden, false);
  assert.equal(game.activeTimers(), 0);

  game.click('retry-button');
  assert.match(game.element('timer-readout').innerHTML, /^25<span>/);
  assert.equal(game.activeTimers(), 1);
  game.submit('Common answer');
  game.click('retry-button');
  game.advance(25_000);
  assert.equal(game.score(), 10, 'A timed-out retry must retain the best answer');
  game.click('retry-button');
  game.setTimed(false);
  assert.match(game.element('timer-readout').innerHTML, /^∞<span>/);
  assert.equal(game.activeTimers(), 0);
  game.advance(1_000_000);
  for (let index = 0; index < 100; index++) game.submit('wrong answer');
  assert.equal(game.element('answer-input').disabled, false);
  assert.equal(game.score(), 10);
});

test('changing timer mode after a settled answer refreshes the readout immediately', () => {
  const game = createHarness();
  game.submit('Common answer');
  game.setTimed(true);
  assert.match(game.element('timer-readout').innerHTML, /^25<span>/);
  assert.equal(game.element('timer-mode-label').textContent, '25-second timer');
  assert.equal(game.element('answer-input').disabled, true);
  assert.equal(game.activeTimers(), 0, 'Changing mode must not reopen a settled prompt');
  game.setTimed(false);
  assert.match(game.element('timer-readout').innerHTML, /^∞<span>/);
  assert.equal(game.element('timer-mode-label').textContent, 'No timer');
  assert.equal(game.score(), 10);
  game.click('retry-button');
  assert.equal(game.element('answer-input').disabled, false);
});

test('a submission past the deadline cannot beat a delayed timer callback', () => {
  const game = createHarness();
  game.setTimed(true);
  game.jump(25_001); // Simulate a browser tab whose interval callback was delayed.
  game.submit('Rare answer');
  assert.equal(game.score(), 0);
  assert.equal(game.element('answer-input').disabled, true);
  assert.match(game.element('answer-result').innerHTML, /Time for another try/);
  game.click('retry-button');
  game.submit('Rare answer');
  assert.equal(game.score(), 100);
});

test('timer preference reloads and malformed saved data does not prevent play', () => {
  const game = createHarness();
  game.setTimed(true);
  const reloaded = createHarness({ storage: game.storage });
  assert.equal(reloaded.element('timer-toggle').checked, true);
  assert.equal(reloaded.activeTimers(), 1);
  const malformed = createHarness({ storage: new Map([[storageKey, '{broken json']]) });
  assert.equal(malformed.element('answer-input').disabled, false);
  assert.equal(malformed.element('personal-best').textContent, '0 m');
  assert.equal(malformed.element('timer-toggle').checked, false);
});
