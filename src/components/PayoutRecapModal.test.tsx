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
