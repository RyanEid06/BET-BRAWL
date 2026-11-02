import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PayoutRecapModal } from './PayoutRecapModal.tsx';
import { createFreshPlayer, generateTournamentSchedule, initAuthoritativeRound } from '../engine/roomEngine.ts';
import { toPublicPlayer } from '../engine/types.ts';
import { initV2Game, advanceV2Game, projectV2Game } from '../engine/v2Games.ts';
import { MINI_GAMES } from '../engine/miniGamesCatalog.ts';

function recap() {
  const roster = ['A', 'B', 'C'].map(name => createFreshPlayer(name, '⚡'));
  const players = roster.map(toPublicPlayer);
  const { round } = initAuthoritativeRound(1, 6, roster);
  round.fighterIds = [players[0].id, players[1].id];
  round.isChampionship = true;
  round.matchPot = 500;
  const schedule = generateTournamentSchedule(roster);
  schedule.stage = 'CHAMPIONSHIP';
  schedule.finalists = round.fighterIds;
  schedule.championshipWins = { [players[0].id]: 1, [players[1].id]: 0 };
  const render = (viewer = players[0]) => renderToStaticMarkup(React.createElement(PayoutRecapModal, {
    round, players, myPlayer: viewer, isHost: false, onNextRound: () => {},
    isFinalRound: false, tournamentSchedule: schedule,
  })).replace(/<[^>]+>/g, '');
  return { round, schedule, players, render };
}

test('championship recap awards a series win, reserves title for the clincher, and never claims qualifier points on ties', () => {
  const { round, schedule, players, render } = recap();
  round.winnerId = players[0].id;
  round.resolutionReason = 'PLAYED';
  assert.doesNotMatch(render(), /Championship Title/);
  assert.match(render(), /championship win/i);
  schedule.championId = players[0].id;
  schedule.championshipWins[players[0].id] = 2;
  assert.match(render(), /Championship Title/);
  schedule.championId = null;
  round.winnerId = null;
  round.tieResult = true;
  round.resolutionReason = 'TIE';
  const tied = render();
  assert.doesNotMatch(tied, /earned \+1 Brawl Point|SERIES STILL TIED/);
  assert.match(tied, /No championship win awarded/);
});

test('V2 payout includes the final game explanation and revealed answers', () => {
  const { round, players, render } = recap();
  round.miniGame = MINI_GAMES.safecracker;
  const state = initV2Game('safecracker', [players[0].id, players[1].id], 0);
  advanceV2Game(state, state.endsAt);
  const view = projectV2Game(state, null, state.endsAt);
  round.gameConfig = view.config;
  round.gameState = view.state;
  assert.match(render(), /Secret code:/);
  assert.match(render(), /Unsolved/);
});

test('VOID recap adds no fighter outcome and explains the actual wager refund reason', () => {
  const { round, players, render } = recap();
  round.resolutionReason = 'VOID';
  round.winnerId = null;
  round.tieResult = false;
  assert.match(render(), /ROUND VOID/);
  assert.doesNotMatch(render(), /DEFEAT|\+3 BRAWL POINTS|Series Game Winner/);
  round.payouts = [{ playerId: players[2].id, playerName: 'C', type: 'BET_REFUND', stake: 100,
    avatar: '⚡', totalReturn: 100, netChange: 0, newBankroll: 1000, summary: '100 refunded' }];
  assert.match(render(players[2]), /Round void/);
  assert.doesNotMatch(render(players[2]), /ended in a tie/);
});

test('V2 forfeit and VOID recaps never show a recomputed played result after the clock expires', () => {
  const { round, players, render } = recap();
  round.miniGame = MINI_GAMES.safecracker;
  const state = initV2Game('safecracker', [players[0].id, players[1].id], 0);
  advanceV2Game(state, state.endsAt);
  const view = projectV2Game(state, null, state.endsAt);
  round.gameConfig = view.config;
  round.gameState = view.state;
  for (const reason of ['DISCONNECT_FORFEIT', 'VOID'] as const) {
    round.resolutionReason = reason;
    round.winnerId = reason === 'VOID' ? null : players[0].id;
    assert.doesNotMatch(render(), /Final result confirmed by the server/);
  }
});

test('Millisecond recap shows selected target, both stops, absolute errors and winning reason', () => {
  const { round, players, render } = recap();
  round.miniGame = MINI_GAMES.millisecond_stop;
  round.gameConfig = { targetSeconds: 9, blindSeconds: 4 };
  round.fighterScores = { [players[0].id]: 8.9, [players[1].id]: 9.25 };
  round.winnerId = players[0].id;
  const text = render();
  assert.match(text, /Target: 9\.000s/);
  assert.match(text, /8\.900s.*0\.100s error/);
  assert.match(text, /9\.250s.*0\.250s error/);
  assert.match(text, /A wins.*closer to the target/);
});

test('Quick Draw recap shows both reactions, zero milliseconds and explicit false-start loss', () => {
  const { round, players, render } = recap();
  round.miniGame = MINI_GAMES.quick_draw;
  round.winnerId = players[0].id;
  round.fighterScores = { [players[0].id]: 0, [players[1].id]: 240 };
  round.gameState = { reactions: { [players[0].id]: 0, [players[1].id]: 240 } };
  assert.match(render(), /A.*0 ms.*B.*240 ms/);
  assert.match(render(), /A wins.*faster reaction/);
  round.winnerId = players[1].id;
  round.gameState = { fouls: { [players[0].id]: true } };
  round.fighterScores = { [players[0].id]: 0 };
  assert.match(render(), /B wins.*A.*false start.*caused the loss/);
  assert.match(render(), /No reaction/);
});

test('Pinpoint recap shows both distance errors and explains distance, tie or missing guess', () => {
  const { round, players, render } = recap();
  round.miniGame = MINI_GAMES.blind_pinpoint;
  round.fighterScores = { [players[0].id]: 0, [players[1].id]: 812 };
  round.gameState = { pins: { [players[0].id]: {}, [players[1].id]: {} } };
  round.winnerId = players[0].id;
  assert.match(render(), /A.*0 km error.*B.*812 km error/);
  assert.match(render(), /A wins.*closer to the city/);
  round.fighterScores = { [players[0].id]: 25, [players[1].id]: 29 };
  round.winnerId = null;
  round.tieResult = true;
  assert.match(render(), /Tie.*within 10 km/);
  round.tieResult = false;
  round.winnerId = players[0].id;
  delete round.fighterScores[players[1].id];
  round.gameState = { pins: { [players[0].id]: {} } };
  assert.match(render(), /B.*No guess/);
  assert.match(render(), /A wins.*only fighter.*guess/);
  round.resolutionReason = 'DISCONNECT_FORFEIT';
  assert.doesNotMatch(render(), /closer to the city|only fighter.*guess/);
});
