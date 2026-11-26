import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAnswer, findAnswer, createDive, scoreTier, getDepth } from '../engine.js';

test('normalization accepts Unicode accents, punctuation, case, and spacing', () => {
  assert.equal(normalizeAnswer('  POKÉMON: café!\n'), 'pokemoncafe');
  assert.equal(normalizeAnswer('Cafe\u0301'), 'cafe');
  assert.equal(normalizeAnswer('Spider–Man'), 'spiderman');
  assert.equal(normalizeAnswer('東京 ２０２６'), '東京2026');
  assert.equal(normalizeAnswer('Apollo 11'), 'apollo11');
  assert.notEqual(normalizeAnswer('Apollo 11'), normalizeAnswer('Apollo 13'));
  assert.equal(normalizeAnswer(null), '');
  assert.equal(normalizeAnswer({}), '');
});

const sampleQuestion = {
  answers: [
    { name: 'Beyoncé', aliases: ['Beyoncé Knowles'], score: 25 },
    { name: 'The Beatles', aliases: ['Fab Four'], score: 10 },
    { name: 'Apollo 11', aliases: [], score: 65 },
    { name: 'Theatre', aliases: [], score: 85 },
  ],
};

test('answer matching returns canonical objects for names and explicit aliases', () => {
  assert.equal(findAnswer(sampleQuestion, 'BEYONCE'), sampleQuestion.answers[0]);
  assert.equal(findAnswer(sampleQuestion, '  Beyoncé-Knowles! '), sampleQuestion.answers[0]);
  assert.equal(findAnswer(sampleQuestion, 'Beatles'), sampleQuestion.answers[1]);
  assert.equal(findAnswer(sampleQuestion, 'the fab four'), sampleQuestion.answers[1]);
  assert.equal(findAnswer(sampleQuestion, 'The—Beatles'), sampleQuestion.answers[1]);
  assert.equal(findAnswer(sampleQuestion, 'Apollo XI'), null);
  assert.equal(findAnswer(sampleQuestion, 'Apollo 11'), sampleQuestion.answers[2]);
});

test('wrong, partial, numeric, and near-match answers are never accepted', () => {
  for (const input of ['', ' ', 'the', '!!!', 'Beyoncee', 'Bey', 'Beyoncé and Jay-Z', 'Apollo 13', 'Atre']) {
    assert.equal(findAnswer(sampleQuestion, input), null, `unexpected match for ${JSON.stringify(input)}`);
  }
  assert.equal(findAnswer(sampleQuestion, null), null);
  assert.equal(findAnswer({}, 'anything'), null);
  assert.equal(findAnswer(null, 'anything'), null);
  assert.equal(findAnswer({ answers: [{ name: '0', score: 100 }] }, 0)?.score, 100);
});

const questions = Array.from({ length: 20 }, (_, index) => ({
  id: `q-${index}`,
  category: index < 10 ? 'Geography' : 'Pop culture',
  answers: [],
}));

test('a seed reproduces an unbiased shuffled selection without mutating the bank', () => {
  const original = [...questions];
  const first = createDive(questions, { seed: 'David', length: 7 });
  assert.deepEqual(first, createDive(questions, { seed: 'David', length: 7 }));
  assert.notDeepEqual(first, createDive(questions, { seed: 'another seed', length: 7 }));
  assert.deepEqual(questions, original);
  assert.equal(first.length, 7);
  assert.equal(new Set(first.map(question => question.id)).size, 7);
  assert.ok(first.every(question => questions.includes(question)));
});

test('category filtering is case/spacing insensitive and caps the dive size', () => {
  const dive = createDive(questions, { seed: 44, category: 'POP CULTURE', length: 99 });
  assert.equal(dive.length, 10);
  assert.ok(dive.every(question => question.category === 'Pop culture'));
  assert.equal(createDive(questions, { category: 'unlisted' }).length, 0);
  assert.equal(createDive(questions, { category: 'ALL', length: 99 }).length, 20);
});

test('recent questions are excluded when enough fresh questions exist', () => {
  const excludeIds = questions.slice(0, 5).map(question => question.id);
  const dive = createDive(questions, { seed: 12, category: 'geography', length: 5, excludeIds });
  assert.equal(dive.length, 5);
  assert.ok(dive.every(question => !excludeIds.includes(question.id)));
});

test('too few fresh questions falls back to the full eligible category pool', () => {
  const options = { seed: 987, category: 'geography', length: 7 };
  const excluded = createDive(questions, { ...options, excludeIds: questions.slice(0, 5).map(question => question.id) });
  assert.deepEqual(excluded, createDive(questions, options));
  assert.equal(excluded.length, 7);
  assert.ok(excluded.every(question => question.category === 'Geography'));
  assert.equal(new Set(excluded.map(question => question.id)).size, 7);
});

test('empty pools, invalid lengths, and duplicate question IDs remain safe', () => {
  assert.deepEqual(createDive([]), []);
  assert.deepEqual(createDive(null), []);
  assert.deepEqual(createDive(questions, { length: 0 }), []);
  assert.deepEqual(createDive(questions, { length: -1 }), []);
  assert.equal(createDive(questions, { length: 2.9 }).length, 2);
  assert.equal(createDive([questions[0], { ...questions[0] }, questions[1]], { length: 7 }).length, 2);
});

test('all rarity boundaries and depth values follow the scoring rules', () => {
  const boundaries = [
    [0, 'Miss'], [10, 'Common'], [24, 'Common'], [25, 'Familiar'],
    [44, 'Familiar'], [45, 'Uncommon'], [64, 'Uncommon'], [65, 'Rare'],
    [84, 'Rare'], [85, 'Deep cut'], [99, 'Deep cut'], [100, 'One in a krillion'],
  ];
  for (const [score, label] of boundaries) {
    const tier = scoreTier(score);
    assert.equal(tier.label, label, `score ${score}`);
    assert.match(tier.color, /^#[0-9a-f]{6}$/i);
    assert.ok(tier.emoji.length > 0);
    assert.equal(getDepth(score), score * 10);
  }
  assert.equal(scoreTier(-1).label, 'Miss');
  assert.equal(scoreTier(NaN).label, 'Miss');
  const tier = scoreTier(100);
  tier.label = 'changed';
  assert.equal(scoreTier(100).label, 'One in a krillion');
});
