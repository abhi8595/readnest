require('./loader');
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDeck, gradeWord, sanitizeState, BOX_INTERVALS } = require('../src/lib/wordbook');

const NOW = 1_000_000_000_000;

test('wordbook E3: new lookups enter the deck, others wait', () => {
  const lookups = [
    { word: 'Serendipity', looked_up_at: 100 },
    { word: 'Ubiquitous', looked_up_at: 200 },
  ];
  const deck = buildDeck(lookups, {}, NOW);
  assert.equal(deck.length, 2);
  assert.ok(deck.every((c) => c.isNew));
  // words sorted oldest-first
  assert.equal(deck[0].word, 'serendipity');
});

test('wordbook E3: grading moves boxes on a spaced schedule', () => {
  let st = {};
  st = gradeWord(st, 'serendipity', true, NOW);
  assert.equal(st.serendipity.box, 2);
  assert.equal(st.serendipity.nextDue, NOW + BOX_INTERVALS[2] * 86400000);
  st = gradeWord(st, 'serendipity', false, NOW);
  assert.equal(st.serendipity.box, 1);
  // box caps at 5
  st = { serendipity: { box: 5, nextDue: 0 } };
  st = gradeWord(st, 'serendipity', true, NOW);
  assert.equal(st.serendipity.box, 5);
});

test('wordbook E3: due cards return, future cards wait', () => {
  const lookups = [
    { word: 'a', looked_up_at: 1 },
    { word: 'b', looked_up_at: 2 },
  ];
  const state = {
    a: { box: 2, nextDue: NOW - 1 },
    b: { box: 2, nextDue: NOW + 99999999 },
  };
  const deck = buildDeck(lookups, state, NOW);
  assert.equal(deck.length, 1);
  assert.equal(deck[0].word, 'a');
  assert.equal(deck[0].isNew, false);
});

test('wordbook E3: state sanitizes garbage', () => {
  assert.deepEqual(sanitizeState(null), {});
  assert.deepEqual(sanitizeState({ A: { box: 99, nextDue: NaN } }), { a: { box: 5, nextDue: 0 } });
  assert.deepEqual(sanitizeState('nope'), {});
});

test('wordbook E3: deck is capped for snackable sessions', () => {
  const lookups = Array.from({ length: 50 }, (_, i) => ({ word: `w${i}`, looked_up_at: i }));
  assert.equal(buildDeck(lookups, {}, NOW, 20).length, 20);
});
