import test from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONS } from '../data/questions.js';
import { findAnswer, normalizeAnswer, createDive } from '../engine.js';

test('the question bank has varied, source-linked prompts and valid rarity scores', () => {
  assert.ok(QUESTIONS.length >= 35, 'At least 35 original prompts');
  assert.ok(new Set(QUESTIONS.map(q => q.category)).size >= 5, 'At least five categories');
  assert.equal(new Set(QUESTIONS.map(q => q.id)).size, QUESTIONS.length);
  for (const q of QUESTIONS) {
    for (const key of ['id', 'category', 'prompt', 'note']) assert.ok(typeof q[key] === 'string' && q[key].trim(), `${q.id}: ${key}`);
    assert.equal(new URL(q.source.url).protocol, 'https:', `${q.id}: HTTPS factual source`);
    assert.ok(q.source.title.trim(), `${q.id}: descriptive source title`);
    assert.ok(q.answers.length >= 4, `${q.id}: enough answers for an interesting choice`);
    assert.ok(q.answers.some(a => a.score === 100), `${q.id}: the advertised maximum is attainable`);
    for (const a of q.answers) {
      assert.ok(a.name.trim(), `${q.id}: canonical name`);
      assert.ok(Array.isArray(a.aliases), `${q.id}: aliases`);
      assert.ok(Number.isInteger(a.score) && a.score >= 10 && a.score <= 100, `${q.id}: ${a.name} score`);
    }
  }
});

test('every answer and alias resolves to the intended answer without ambiguity', () => {
  for (const q of QUESTIONS) {
    const seen = new Map();
    for (const answer of q.answers) {
      for (const spelling of [answer.name, ...answer.aliases]) {
        const normalized = normalizeAnswer(spelling);
        assert.ok(normalized, `${q.id}: non-empty spelling`);
        if (seen.has(normalized)) assert.equal(seen.get(normalized), answer, `${q.id}: conflicting alias ${spelling}`);
        seen.set(normalized, answer);
        assert.equal(findAnswer(q, spelling), answer, `${q.id}: ${spelling}`);
        assert.equal(findAnswer(q, `  ${spelling.toUpperCase()}  `), answer, `${q.id}: case/whitespace ${spelling}`);
      }
    }
    assert.equal(findAnswer(q, ''), null);
    assert.equal(findAnswer(q, 'this is definitely an invalid krill answer 918427'), null);
  }
});

test('each available category can start and replay a valid finite dive', () => {
  for (const category of ['all', ...new Set(QUESTIONS.map(q => q.category))]) {
    const dive = createDive(QUESTIONS, { seed: 'David', category });
    assert.ok(dive.length > 0 && dive.length <= 7);
    assert.equal(new Set(dive.map(q => q.id)).size, dive.length);
    assert.ok(dive.every(q => category === 'all' || q.category === category));
    assert.deepEqual(dive, createDive(QUESTIONS, { seed: 'David', category }));
  }
});
