/**
 * Small, dependency-free rules shared by the browser game and its tests.
 * Questions use { id, category, answers: [{ name, aliases: [], score }] }.
 */

/** Compare spelling without accents, punctuation, spacing, or letter case. */
export function normalizeAnswer(input) {
  if (typeof input !== 'string' && typeof input !== 'number') return '';
  return String(input)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('en')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

// Only remove a complete leading article: "The Who" can match "Who", but
// "Theatre" must never become "atre". Keep both spellings for exact matching.
function answerVariants(input) {
  if (typeof input !== 'string' && typeof input !== 'number') return [];
  const text = String(input).normalize('NFKD').replace(/\p{M}/gu, '').trim();
  const withoutArticle = text.replace(/^the(?=$|[^\p{L}\p{N}])[\s\p{P}\p{S}]*/iu, '');
  return [...new Set([normalizeAnswer(text), normalizeAnswer(withoutArticle)])]
    .filter(Boolean);
}

/**
 * Return the original answer object for a canonical name or explicit alias.
 * Deliberately no substring, edit-distance, or other fuzzy acceptance.
 */
export function findAnswer(question, input) {
  const guesses = new Set(answerVariants(input));
  if (!guesses.size || !Array.isArray(question?.answers)) return null;

  for (const answer of question.answers) {
    if (!answer || typeof answer !== 'object') continue;
    const canonical = answer.name ?? answer.answer ?? answer.text;
    const aliases = Array.isArray(answer.aliases) ? answer.aliases : [];
    if ([canonical, ...aliases].some(value => answerVariants(value).some(value => guesses.has(value)))) {
      return answer;
    }
  }
  return null;
}

function seededRandom(seed) {
  // Hash text as well as numeric seeds, so saved/shareable seeds are stable.
  let state = 2166136261;
  for (const character of String(seed)) {
    state = Math.imul(state ^ character.codePointAt(0), 16777619);
  }
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pick a shuffled dive without mutating the question bank. Excluded IDs are
 * avoided when enough fresh questions exist; otherwise use the full category
 * pool, so repeat play can always start a complete dive.
 */
export function createDive(questions, {
  seed = Date.now(),
  length = 7,
  category = 'all',
  excludeIds = [],
} = {}) {
  if (!Array.isArray(questions)) return [];
  const selectedCategory = normalizeAnswer(category);
  const seenIds = new Set();
  const seenObjects = new Set();
  const eligible = questions.filter(question => {
    if (!question || typeof question !== 'object') return false;
    if (selectedCategory && selectedCategory !== 'all' && normalizeAnswer(question.category) !== selectedCategory) {
      return false;
    }
    if (question.id != null) {
      if (seenIds.has(question.id)) return false;
      seenIds.add(question.id);
    } else {
      if (seenObjects.has(question)) return false;
      seenObjects.add(question);
    }
    return true;
  });
  const count = Math.min(eligible.length, Math.max(0, Math.floor(Number(length) || 0)));
  const excluded = new Set(Array.isArray(excludeIds) ? excludeIds : []);
  const fresh = eligible.filter(question => !excluded.has(question.id));
  const pool = [...(fresh.length >= count ? fresh : eligible)];
  const random = seededRandom(seed);

  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }
  return pool.slice(0, count);
}

const TIERS = [
  { min: 100, label: 'One in a krillion', color: '#ffac9b', emoji: '🦐' },
  { min: 85, label: 'Deep cut', color: '#ffd38c', emoji: '💎' },
  { min: 65, label: 'Rare', color: '#c2dc85', emoji: '🪸' },
  { min: 45, label: 'Uncommon', color: '#87d4c1', emoji: '🐙' },
  { min: 25, label: 'Familiar', color: '#9bd6db', emoji: '🐟' },
  { min: 1, label: 'Common', color: '#a8c9d5', emoji: '🐚' },
  { min: -Infinity, label: 'Miss', color: '#e5a4a7', emoji: '🫧' },
];

/** Scores awarded by the bank are 0 or 10–100; higher is a rarer answer. */
export function scoreTier(score) {
  const numericScore = Number(score);
  const { label, color, emoji } = TIERS.find(tier => (Number.isNaN(numericScore) ? 0 : numericScore) >= tier.min);
  return { label, color, emoji };
}

/** Convert an answer's rarity score to its visible depth in metres. */
export function getDepth(score) {
  return score * 10;
}
