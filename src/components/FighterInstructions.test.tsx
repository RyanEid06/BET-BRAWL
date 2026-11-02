import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BettingScreen } from './BettingScreen.tsx';
import { FighterAnnouncement } from './FighterAnnouncement.tsx';
import { MINI_GAMES } from '../engine/miniGamesCatalog.ts';
import { createFreshPlayer } from '../engine/roomEngine.ts';
import { toPublicPlayer } from '../engine/types.ts';

const players = ['A', 'B', 'C'].map(name => toPublicPlayer(createFreshPlayer(name, '⚡')));
const text = (element: React.ReactElement) => renderToStaticMarkup(element).replace(/<[^>]+>/g, '');

test('all 14 games give both fighters concise instructions throughout the betting window, not spectators', () => {
  for (const miniGame of Object.values(MINI_GAMES)) {
    for (const myPlayer of players.slice(0, 2)) {
      const result = text(<BettingScreen miniGame={miniGame} fighterA={players[0]} fighterB={players[1]}
        odds={{}} myPlayer={myPlayer} myBet={null} onPlaceBet={() => {}} bettingTimeRemaining={15} />);
      assert.match(result, /HOW TO PLAY/i, miniGame.id);
      assert.ok(result.includes(miniGame.name), miniGame.id);
      assert.ok(miniGame.rules.length >= 2 && miniGame.rules.length <= 3, miniGame.id);
      for (const rule of miniGame.rules) assert.ok(result.includes(rule), `${miniGame.id}: ${rule}`);
    }
    const spectator = text(<BettingScreen miniGame={miniGame} fighterA={players[0]} fighterB={players[1]}
      odds={{}} myPlayer={players[2]} myBet={null} onPlaceBet={() => {}} bettingTimeRemaining={15} />);
    assert.doesNotMatch(spectator, /HOW TO PLAY/i);
    assert.match(spectator, /PLACE YOUR BET/);
  }
});

test('fighter instructions explain Safecracker clues, Treasure rounds and randomized timer before play', () => {
  const render = (miniGame: typeof MINI_GAMES.safecracker, gameConfig = {}) => text(<BettingScreen miniGame={miniGame}
    gameConfig={gameConfig} fighterA={players[0]} fighterB={players[1]} odds={{}} myPlayer={players[0]}
    myBet={null} onPlaceBet={() => {}} bettingTimeRemaining={15} />);
  assert.match(render(MINI_GAMES.safecracker), /Exact.*symbol and position.*Misplaced.*wrong position/);
  assert.match(render(MINI_GAMES.treasure_tug), /10 energy.*three lanes.*3 rounds/);
  assert.match(render(MINI_GAMES.millisecond_stop, { targetSeconds: 7, blindSeconds: 3 }), /Target: 7\.000s.*hidden at 3\.000s/);
  const reveal = text(<FighterAnnouncement miniGame={MINI_GAMES.millisecond_stop} gameConfig={{targetSeconds:3,blindSeconds:1.5}}
    isPlayerFighter fighterA={players[0]} fighterB={players[1]} roundNumber={1} totalRounds={6} />);
  assert.match(reveal, /Target: 3\.000s.*hidden at 1\.500s/);
});
