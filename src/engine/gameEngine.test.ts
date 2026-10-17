import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initMiniGameServerState,
  processFighterAction,
  resolveGameTimeout,
  getLightAtServerTime,
  LightScheduleStep,
} from './gameEngine.ts';

// ---------------------------------------------------------------------------
// 1. MILLISECOND STOP TESTS
// ---------------------------------------------------------------------------
test('Millisecond Stop: calculates elapsed time from gameStartsAt and resolves when both stop', () => {
  const gameStartsAt = 10000;
  const { internal } = initMiniGameServerState('millisecond_stop', ['f1', 'f2'], gameStartsAt);
  const scores: Record<string, number> = { f1: 0, f2: 0 };

  // Fighter 1 stops at 5.050s
  const res1 = processFighterAction(internal, scores, 'f1', { type: 'STOP' }, gameStartsAt + 5050);
  assert.equal(res1.resolved, false);
  assert.equal(scores.f1, 5.05);

  // Fighter 2 stops at 4.900s (delta 0.100s vs f1 delta 0.050s)
  const res2 = processFighterAction(internal, scores, 'f2', { type: 'STOP' }, gameStartsAt + 4900);
  assert.equal(res2.resolved, true);
  assert.equal(res2.isTie, false);
  assert.equal(res2.winnerId, 'f1'); // delta 0.050 < 0.100
});

test('Millisecond Stop: declares explicit tie if stop delta difference < 0.005s', () => {
  const gameStartsAt = 10000;
  const { internal } = initMiniGameServerState('millisecond_stop', ['f1', 'f2'], gameStartsAt);
  const scores: Record<string, number> = { f1: 0, f2: 0 };

  processFighterAction(internal, scores, 'f1', { type: 'STOP' }, gameStartsAt + 5002);
  const res2 = processFighterAction(internal, scores, 'f2', { type: 'STOP' }, gameStartsAt + 4998);
  assert.equal(res2.resolved, true);
  assert.equal(res2.isTie, true);
  assert.equal(res2.winnerId, null);
});

test('Millisecond Stop: timeout awards win to the fighter who stopped if opponent DNF', () => {
  const gameStartsAt = 10000;
  const { internal } = initMiniGameServerState('millisecond_stop', ['f1', 'f2'], gameStartsAt);
  const scores: Record<string, number> = { f1: 4.85 }; // only f1 stopped

  const timeoutRes = resolveGameTimeout(internal, scores);
  assert.equal(timeoutRes.winnerId, 'f1');
  assert.equal(timeoutRes.isTie, false);

  // Neither stopped
  const neitherScores: Record<string, number> = {};
  const timeoutNeither = resolveGameTimeout(internal, neitherScores);
  assert.equal(timeoutNeither.isTie, true);
  assert.equal(timeoutNeither.winnerId, null);
});

// ---------------------------------------------------------------------------
// 2. RAPID RED LIGHT, GREEN LIGHT TESTS
// ---------------------------------------------------------------------------
test('Red Light Green Light: correctly tracks green and red at schedule boundaries', () => {
  const schedule: LightScheduleStep[] = [
    { light: 'GREEN', durationMs: 2000 },
    { light: 'RED', durationMs: 1000 },
    { light: 'GREEN', durationMs: 1500 },
  ];

  assert.equal(getLightAtServerTime(schedule, 0), 'GREEN');
  assert.equal(getLightAtServerTime(schedule, 1999), 'GREEN');
  assert.equal(getLightAtServerTime(schedule, 2000), 'RED');
  assert.equal(getLightAtServerTime(schedule, 2999), 'RED');
  assert.equal(getLightAtServerTime(schedule, 3000), 'GREEN');
});

test('Red Light Green Light: tap on green increments +1, tap on red subtracts -3 (min 0)', () => {
  const gameStartsAt = 1000;
  const { internal } = initMiniGameServerState('rapid_red_green', ['f1', 'f2'], gameStartsAt);
  internal.redGreen!.schedule = [
    { light: 'GREEN', durationMs: 2000 },
    { light: 'RED', durationMs: 1000 },
  ];
  const scores: Record<string, number> = { f1: 5, f2: 0 };

  // Green tap at 500ms
  processFighterAction(internal, scores, 'f1', { type: 'TAP' }, gameStartsAt + 500);
  assert.equal(scores.f1, 6);

  // Red tap at 2500ms
  processFighterAction(internal, scores, 'f1', { type: 'TAP' }, gameStartsAt + 2500);
  assert.equal(scores.f1, 3); // 6 - 3 = 3

  // Red tap on 0 score doesn't go below 0
  processFighterAction(internal, scores, 'f2', { type: 'TAP' }, gameStartsAt + 2600);
  assert.equal(scores.f2, 0);
});

test('Red Light Green Light: first fighter to 40 points wins immediately', () => {
  const gameStartsAt = 1000;
  const { internal } = initMiniGameServerState('rapid_red_green', ['f1', 'f2'], gameStartsAt);
  internal.redGreen!.schedule = [{ light: 'GREEN', durationMs: 20000 }];
  const scores: Record<string, number> = { f1: 39, f2: 30 };

  const res = processFighterAction(internal, scores, 'f1', { type: 'TAP' }, gameStartsAt + 100);
  assert.equal(res.resolved, true);
  assert.equal(res.winnerId, 'f1');
});

// ---------------------------------------------------------------------------
// 3. SPEED MATH TESTS
// ---------------------------------------------------------------------------
test('Speed Math: correct answers increment progress; wrong answer triggers 1500ms penalty', () => {
  const gameStartsAt = 1000;
  const { internal } = initMiniGameServerState('speed_math', ['f1', 'f2'], gameStartsAt);
  const correct0 = internal.speedMath!.correctAnswers[0];
  const scores: Record<string, number> = { f1: 0, f2: 0 };

  // Wrong answer
  const wrongRes = processFighterAction(internal, scores, 'f1', {
    type: 'ANSWER',
    questionIndex: 0,
    answer: correct0 + 99,
  }, gameStartsAt + 200);

  assert.equal(wrongRes.resolved, false);
  assert.equal(scores.f1, 0); // No point
  assert.equal(internal.speedMath!.penaltyUntil.f1, gameStartsAt + 200 + 1500);

  // Attempt answer during penalty (ignored)
  const ignoredRes = processFighterAction(internal, scores, 'f1', {
    type: 'ANSWER',
    questionIndex: 0,
    answer: correct0,
  }, gameStartsAt + 500);
  assert.equal(ignoredRes.rejectionReason, 'Penalty active');

  // Correct answer after penalty expires
  const correctRes = processFighterAction(internal, scores, 'f1', {
    type: 'ANSWER',
    questionIndex: 0,
    answer: correct0,
  }, gameStartsAt + 1800);
  assert.equal(scores.f1, 1);
});

test('Speed Math: first to 3 correct answers wins immediately', () => {
  const gameStartsAt = 1000;
  const { internal } = initMiniGameServerState('speed_math', ['f1', 'f2'], gameStartsAt);
  const scores: Record<string, number> = { f1: 0, f2: 0 };
  const answers = internal.speedMath!.correctAnswers;

  processFighterAction(internal, scores, 'f1', { type: 'ANSWER', questionIndex: 0, answer: answers[0] }, gameStartsAt + 100);
  processFighterAction(internal, scores, 'f1', { type: 'ANSWER', questionIndex: 1, answer: answers[1] }, gameStartsAt + 200);
  const finalRes = processFighterAction(internal, scores, 'f1', { type: 'ANSWER', questionIndex: 2, answer: answers[2] }, gameStartsAt + 300);

  assert.equal(finalRes.resolved, true);
  assert.equal(finalRes.winnerId, 'f1');
  assert.equal(scores.f1, 3);
});

test('Speed Math: rejects malformed or non-integer payload', () => {
  const gameStartsAt = 1000;
  const { internal } = initMiniGameServerState('speed_math', ['f1', 'f2'], gameStartsAt);
  const scores: Record<string, number> = { f1: 0, f2: 0 };

  const badRes1 = processFighterAction(internal, scores, 'f1', { type: 'ANSWER', questionIndex: -1, answer: 10 } as any, gameStartsAt + 100);
  assert.ok(badRes1.rejectionReason?.includes('Invalid'));

  const badRes2 = processFighterAction(internal, scores, 'f1', { type: 'ANSWER', questionIndex: 0, answer: NaN } as any, gameStartsAt + 100);
  assert.ok(badRes2.rejectionReason?.includes('Invalid'));
});

// ---------------------------------------------------------------------------
// 4. HIGHER OR LOWER TESTS
// ---------------------------------------------------------------------------
test('Higher or Lower: validates guess against card isHigher and rejects stale indexes', () => {
  const gameStartsAt = 1000;
  const { internal } = initMiniGameServerState('higher_lower', ['f1', 'f2'], gameStartsAt);
  const card0 = internal.higherLower!.cards[0];
  const scores: Record<string, number> = { f1: 0, f2: 0 };

  const rightGuess = card0.isHigher ? 'HIGHER' : 'LOWER';
  const res = processFighterAction(internal, scores, 'f1', {
    type: 'GUESS',
    questionIndex: 0,
    guess: rightGuess,
  }, gameStartsAt + 100);

  assert.equal(scores.f1, 1);
  assert.equal(internal.higherLower!.stepIndex.f1, 1);

  // Stale index 0 rejected
  const staleRes = processFighterAction(internal, scores, 'f1', {
    type: 'GUESS',
    questionIndex: 0,
    guess: rightGuess,
  }, gameStartsAt + 200);
  assert.equal(staleRes.rejectionReason, 'Stale trivia index');
});

test('Higher or Lower: rejects invalid guess string and malformed payload', () => {
  const gameStartsAt = 1000;
  const { internal } = initMiniGameServerState('higher_lower', ['f1', 'f2'], gameStartsAt);
  const scores: Record<string, number> = { f1: 0, f2: 0 };

  // Invalid string guess
  const badGuessRes = processFighterAction(internal, scores, 'f1', {
    type: 'GUESS',
    questionIndex: 0,
    guess: 'EQUAL' as any,
  }, gameStartsAt + 100);
  assert.equal(badGuessRes.rejectionReason, 'Guess must be HIGHER or LOWER');
  assert.equal(scores.f1, 0);

  // Negative questionIndex
  const badIdxRes = processFighterAction(internal, scores, 'f1', {
    type: 'GUESS',
    questionIndex: -1,
    guess: 'HIGHER',
  }, gameStartsAt + 100);
  assert.equal(badIdxRes.rejectionReason, 'Invalid questionIndex');
});

test('Higher or Lower: secret answer data (isHigher, challengerStat) is absent from client-visible state before submission', () => {
  const gameStartsAt = 1000;
  const { internal, publicConfig } = initMiniGameServerState('higher_lower', ['f1', 'f2'], gameStartsAt);

  assert.ok(publicConfig.cards, 'publicConfig must have cards');
  assert.equal(publicConfig.cards.length, 4, 'Must have 4 cards');

  // Verify that EVERY card in publicConfig lacks secret fields before submission
  for (const card of publicConfig.cards) {
    assert.ok(card.baseItem, 'Must have public baseItem');
    assert.ok(card.baseStat, 'Must have public baseStat');
    assert.ok(card.challengerItem, 'Must have public challengerItem');
    assert.equal((card as any).isHigher, undefined, 'isHigher must NOT be leaked in publicConfig');
    assert.equal((card as any).challengerStat, undefined, 'challengerStat must NOT be leaked in publicConfig');
  }

  // Fighter 1 submits answer to question 0
  const scores: Record<string, number> = { f1: 0, f2: 0 };
  const card0 = internal.higherLower!.cards[0];
  const rightGuess = card0.isHigher ? 'HIGHER' : 'LOWER';

  const resF1 = processFighterAction(internal, scores, 'f1', {
    type: 'GUESS',
    questionIndex: 0,
    guess: rightGuess,
  }, gameStartsAt + 100);

  // Authoritative feedback returned for F1 only upon submission
  assert.ok(resF1.actionFeedback, 'actionFeedback must be provided after submission');
  assert.equal(resF1.actionFeedback.fighterId, 'f1');
  assert.equal(resF1.actionFeedback.questionIndex, 0);
  assert.equal(resF1.actionFeedback.isCorrect, true);
  assert.equal(resF1.actionFeedback.challengerStat, card0.challengerStat);

  // Verify Fighter 2 still has no reveals
  assert.equal(internal.higherLower!.reveals?.f2?.[0], undefined, 'Fighter 2 must not have reveals before submitting');
});

// ---------------------------------------------------------------------------
// 5. BLIND PINPOINT TESTS
// ---------------------------------------------------------------------------
test('Blind Pinpoint: validates normalized coords and calculates Haversine distance server-side', () => {
  const gameStartsAt = 1000;
  const { internal } = initMiniGameServerState('blind_pinpoint', ['f1', 'f2'], gameStartsAt);
  // Set target city to Paris (lat: 48.8566, lon: 2.3522)
  internal.blindPinpoint!.targetCity = { city: 'Paris', country: 'France', lat: 48.8566, lon: 2.3522 };
  const scores: Record<string, number> = { f1: 0, f2: 0 };

  // Invalid coordinates rejected
  const badRes = processFighterAction(internal, scores, 'f1', { type: 'PIN', normX: 1.5, normY: 0.5 }, gameStartsAt + 100);
  assert.ok(badRes.rejectionReason !== undefined);

  // Paris normalized coordinates: lon = 2.3522 -> (2.3522+180)/360 = ~0.5065, lat = 48.8566 -> (90-48.8566)/180 = ~0.2285
  const normXParis = (2.3522 + 180) / 360;
  const normYParis = (90 - 48.8566) / 180;

  // f1 pins close to Paris
  processFighterAction(internal, scores, 'f1', { type: 'PIN', normX: normXParis, normY: normYParis }, gameStartsAt + 200);
  assert.ok(scores.f1 < 20); // within 20km

  // f2 pins far away (Sydney area: normX ~ 0.92, normY ~ 0.68)
  const f2Res = processFighterAction(internal, scores, 'f2', { type: 'PIN', normX: 0.92, normY: 0.68 }, gameStartsAt + 300);

  // Both have submitted -> resolves immediately!
  assert.equal(f2Res.resolved, true);
  assert.equal(f2Res.winnerId, 'f1');
  assert.ok(scores.f2 > 5000); // Sydney is >16,000km from Paris
});

// ---------------------------------------------------------------------------
// 6. QUICK DRAW TESTS & EARLY-TAP EXPLOIT ELIMINATION
// ---------------------------------------------------------------------------
test('Quick Draw: tap before drawAt results in immediate false start foul loss', () => {
  const gameStartsAt = 1000;
  const { internal } = initMiniGameServerState('quick_draw', ['f1', 'f2'], gameStartsAt);
  const drawAt = internal.quickDraw!.drawAt;
  const scores: Record<string, number> = { f1: 0, f2: 0 };

  // f1 taps 100ms before drawAt -> False start foul!
  const foulRes = processFighterAction(internal, scores, 'f1', { type: 'DRAW_TAP' }, drawAt - 100);
  assert.equal(foulRes.resolved, true);
  assert.equal(foulRes.winnerId, 'f2'); // f2 wins due to f1 false start!
  assert.equal(scores.f1, -1);
});

test('Quick Draw: boundary tests for early-tap exploit fix', () => {
  const gameStartsAt = 1000;

  // 1. drawAt - 100ms -> foul
  {
    const { internal } = initMiniGameServerState('quick_draw', ['f1', 'f2'], gameStartsAt);
    const drawAt = internal.quickDraw!.drawAt;
    const scores = { f1: 0, f2: 0 };
    const res = processFighterAction(internal, scores, 'f1', { type: 'DRAW_TAP' }, drawAt - 100);
    assert.equal(res.resolved, true);
    assert.equal(res.winnerId, 'f2');
    assert.equal(scores.f1, -1);
  }

  // 2. drawAt - 40ms -> foul
  {
    const { internal } = initMiniGameServerState('quick_draw', ['f1', 'f2'], gameStartsAt);
    const drawAt = internal.quickDraw!.drawAt;
    const scores = { f1: 0, f2: 0 };
    const res = processFighterAction(internal, scores, 'f1', { type: 'DRAW_TAP' }, drawAt - 40);
    assert.equal(res.resolved, true);
    assert.equal(res.winnerId, 'f2');
    assert.equal(scores.f1, -1);
  }

  // 3. drawAt - 1ms -> foul
  {
    const { internal } = initMiniGameServerState('quick_draw', ['f1', 'f2'], gameStartsAt);
    const drawAt = internal.quickDraw!.drawAt;
    const scores = { f1: 0, f2: 0 };
    const res = processFighterAction(internal, scores, 'f1', { type: 'DRAW_TAP' }, drawAt - 1);
    assert.equal(res.resolved, true);
    assert.equal(res.winnerId, 'f2');
    assert.equal(scores.f1, -1);
  }

  // 4. drawAt exactly -> valid reaction of 0ms
  {
    const { internal } = initMiniGameServerState('quick_draw', ['f1', 'f2'], gameStartsAt);
    const drawAt = internal.quickDraw!.drawAt;
    const scores = { f1: 0, f2: 0 };
    const res = processFighterAction(internal, scores, 'f1', { type: 'DRAW_TAP' }, drawAt);
    assert.equal(res.resolved, false, 'First valid reaction must not resolve immediately');
    assert.equal(scores.f1, 0, 'Reaction at exact drawAt is 0ms');
  }

  // 5. drawAt + 1ms -> valid reaction of 1ms
  {
    const { internal } = initMiniGameServerState('quick_draw', ['f1', 'f2'], gameStartsAt);
    const drawAt = internal.quickDraw!.drawAt;
    const scores = { f1: 0, f2: 0 };
    const res = processFighterAction(internal, scores, 'f1', { type: 'DRAW_TAP' }, drawAt + 1);
    assert.equal(res.resolved, false);
    assert.equal(scores.f1, 1, 'Reaction at drawAt + 1ms is 1ms');
  }
});

test('Quick Draw: does NOT resolve on first valid reaction; lowest reaction time wins when both finish', () => {
  const gameStartsAt = 1000;
  const { internal } = initMiniGameServerState('quick_draw', ['f1', 'f2'], gameStartsAt);
  const drawAt = internal.quickDraw!.drawAt;
  const scores: Record<string, number> = { f1: 0, f2: 0 };

  // f1 reacts at +350ms
  const res1 = processFighterAction(internal, scores, 'f1', { type: 'DRAW_TAP' }, drawAt + 350);
  assert.equal(res1.resolved, false); // Must NOT resolve yet!
  assert.equal(scores.f1, 350);

  // f2 reacts faster at +220ms
  const res2 = processFighterAction(internal, scores, 'f2', { type: 'DRAW_TAP' }, drawAt + 220);
  assert.equal(res2.resolved, true);
  assert.equal(res2.winnerId, 'f2'); // f2 was faster (220ms < 350ms)
  assert.equal(res2.isTie, false);
});
