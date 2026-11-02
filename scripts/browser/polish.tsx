import React from 'react';
import { createRoot } from 'react-dom/client';
import { QuickDrawGame } from '../../src/components/games/QuickDrawGame';
import { MillisecondStopGame } from '../../src/components/games/MillisecondStopGame';
import { BettingScreen } from '../../src/components/BettingScreen';
import { FighterAnnouncement } from '../../src/components/FighterAnnouncement';
import { SynchronizedCountdown } from '../../src/components/SynchronizedCountdown';
import { PayoutRecapModal } from '../../src/components/PayoutRecapModal';
import { initMiniGameServerState, processFighterAction } from '../../src/engine/gameEngine';
import type { MiniGameId } from '../../src/engine/types';
import { MINI_GAMES } from '../../src/engine/miniGamesCatalog';
import { sound } from '../../src/engine/audio';
import '../../src/index.css';
sound.isMuted = true;
const root = createRoot(document.getElementById('root')!);
const players: any[] = ['Alexandra', 'Benjamin', 'Casey'].map((name, index) => ({name, avatar:'⚡', id:['a','b','c'][index], color:'#06b6d4', isHost:index===0,isReady:true,connected:true,coins:1000,matchesWon:0,matchesPlayed:0,totalBetsPlaced:0,totalBetsWon:0,totalCoinsWonInBets:0,totalCoinsLostInBets:0,highestSingleBet:0,highestSinglePayout:0,qualifierPoints:0,qualifierWins:0,qualifierTies:0,qualifierLosses:0,qualifierMatchesPlayed:0}));
let id: MiniGameId, config: any, state: any, internal: any, scores: Record<string, number>, now: number, key = 0, mode: string, slot: 'A'|'B'|'spectator', result: any;
const api: any = { actions: [] };
const draw = () => {
  const common = {fighterA:players[0], fighterB:players[1], isPlayerFighter:slot!=='spectator', playerFighterSlot:slot, fighterScores:scores,
    gameConfig:config, gameState:state, serverTimeOffset:now-Date.now(), onSendAction:(action:any) => {api.actions.push(action);} };
  const viewer = players[slot==='spectator'?2:slot==='A'?0:1];
  const game = MINI_GAMES[id];
  root.render(<main style={{padding:12}} key={key}>
    {mode==='active' && (id==='quick_draw'?<QuickDrawGame {...common}/>:<MillisecondStopGame {...common} gameStartsAt={100000}/>)}
    {mode==='betting' && <BettingScreen miniGame={game} gameConfig={config} fighterA={players[0]} fighterB={players[1]} odds={{}} myPlayer={viewer} myBet={null} bettingTimeRemaining={15} onPlaceBet={()=>{}}/>}
    {mode==='reveal' && <FighterAnnouncement miniGame={game} gameConfig={config} isPlayerFighter={slot!=='spectator'} fighterA={players[0]} fighterB={players[1]} roundNumber={1} totalRounds={6}/>}
    {mode==='countdown' && <SynchronizedCountdown miniGameName={game.name} gameStartsAt={now+3500} serverTimeOffset={now-Date.now()} targetSeconds={config.targetSeconds}/>}
    {mode==='recap' && <PayoutRecapModal round={{roundNumber:1,maxRounds:6,fighterIds:['a','b'],miniGame:game,gameConfig:config,gameState:state,fighterScores:scores,winnerId:result?.winnerId,tieResult:result?.isTie,resolutionReason:'PLAYED',payouts:[],matchPot:500} as any} players={players} myPlayer={viewer} isHost onNextRound={()=>{}} isFinalRound={false}/>}
  </main>);
};
api.reset = (game:MiniGameId='quick_draw', options:any={}) => {
  id=game; mode=options.mode||'active'; slot=options.slot||'A'; now=100000;
  const init=initMiniGameServerState(game,['a','b'],100000); internal=init.internal; config={...init.publicConfig,...options.config};
  scores={a:0,b:0}; state={}; result=null; api.actions=[]; key++; draw();
};
api.step = (elapsed:number) => { now=100000+elapsed; draw(); };
api.flush = () => { for(const action of api.actions.splice(0)) {result=processFighterAction(internal,scores,slot==='B'?'b':'a',action,now); state={...state,...result.gameStatePatch};} draw(); };
api.snapshot = () => ({config,state,scores,result,actions:api.actions});
(window as any).__polish=api;
api.reset();
