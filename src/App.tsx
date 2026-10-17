/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: Master Client Application
 */

import React, { useState, useEffect } from 'react';
import { useBrawlClient } from './engine/useBrawlClient.ts';
import { sound } from './engine/audio.ts';
import { Volume2, VolumeX, WifiOff } from 'lucide-react';

// UI Screens
import { TitleAndDiscovery } from './components/TitleAndDiscovery.tsx';
import { LobbyScreen } from './components/LobbyScreen.tsx';
import { FighterAnnouncement } from './components/FighterAnnouncement.tsx';
import { BettingScreen } from './components/BettingScreen.tsx';
import { PayoutRecapModal } from './components/PayoutRecapModal.tsx';
import { PodiumScreen } from './components/PodiumScreen.tsx';

// Mini-Games
import { MillisecondStopGame } from './components/games/MillisecondStopGame.tsx';
import { RedLightGreenLightGame } from './components/games/RedLightGreenLightGame.tsx';
import { SpeedMathGame } from './components/games/SpeedMathGame.tsx';
import { HigherLowerGame } from './components/games/HigherLowerGame.tsx';
import { BlindPinpointGame } from './components/games/BlindPinpointGame.tsx';
import { QuickDrawGame } from './components/games/QuickDrawGame.tsx';
import { SynchronizedCountdown } from './components/SynchronizedCountdown.tsx';

export default function App() {
  const client = useBrawlClient();
  const [playerName, setPlayerName] = useState(() => {
    return localStorage.getItem('betnbrawl_player_name') || 'You (Ace)';
  });
  const [playerAvatar, setPlayerAvatar] = useState(() => {
    return localStorage.getItem('betnbrawl_player_avatar') || '⚡';
  });
  const [isMuted, setIsMuted] = useState(sound.isMuted);

  const toggleMute = () => {
    sound.isMuted = !sound.isMuted;
    setIsMuted(sound.isMuted);
    if (!sound.isMuted) sound.playCoin();
  };

  // Sync body dataset state to mirror game phase
  useEffect(() => {
    if (client.phase === 'ENTRY') {
      document.body.dataset.state = 'title';
    } else if (client.phase === 'FINAL_PODIUM') {
      document.body.dataset.state = 'gameover';
    } else {
      document.body.dataset.state = 'playing';
    }
  }, [client.phase]);

  const activeFighterA = client.players.find(p => p.id === client.currentRound?.fighterIds[0]);
  const activeFighterB = client.players.find(p => p.id === client.currentRound?.fighterIds[1]);

  const playerFighterSlot: 'A' | 'B' | 'spectator' =
    client.myPlayer?.id === activeFighterA?.id
      ? 'A'
      : client.myPlayer?.id === activeFighterB?.id
      ? 'B'
      : 'spectator';

  return (
    <div className="min-h-screen bg-[#0b0d14] text-slate-100 flex flex-col justify-between select-none relative">
      {/* Sound toggle button in top corner */}
      <div className="fixed top-3 right-3 z-50">
        <button
          onClick={toggleMute}
          aria-label={isMuted ? 'Unmute Sound' : 'Mute Sound'}
          className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700/80 text-slate-300 text-xs transition-colors shadow-md cursor-pointer"
        >
          {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
        </button>
      </div>

      {/* Disconnection Banner if connection drops */}
      {client.status === 'DISCONNECTED' && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-rose-950/95 border-b border-rose-600 text-rose-200 text-xs font-mono py-2 px-4 flex items-center justify-center gap-2 shadow-xl">
          <WifiOff className="w-4 h-4 animate-pulse" />
          <span>Connection to host lost. Reconnecting to local Wi-Fi server...</span>
        </div>
      )}

      {/* Phase 1: Entry Screen (Host vs Join) */}
      {client.phase === 'ENTRY' && (
        <TitleAndDiscovery
          playerName={playerName}
          setPlayerName={setPlayerName}
          playerAvatar={playerAvatar}
          setPlayerAvatar={setPlayerAvatar}
          networkInfo={client.networkInfo}
          onHostGame={() => client.hostGame(playerName, playerAvatar)}
          onJoinGame={(roomCode) => client.joinGame(roomCode, playerName, playerAvatar)}
          errorMessage={client.errorMessage}
          status={client.status}
        />
      )}

      {/* Phase 2: Room Lobby */}
      {client.phase === 'LOBBY' && (
        <div className="flex-1 flex flex-col justify-center items-center p-3 sm:p-4">
          <LobbyScreen
            players={client.players}
            roomCode={client.roomCode}
            isHost={client.isHost}
            myPlayer={client.myPlayer}
            networkInfo={client.networkInfo}
            totalRounds={client.totalRounds}
            onToggleReady={client.toggleReady}
            onStartGame={client.startGame}
            onCloseRoom={client.closeRoom}
            onAddDebugBot={client.addDebugBot}
            isDebug={client.isDebug}
          />
        </div>
      )}

      {/* Phase 3: Fighter Reveal / VS Splash */}
      {client.phase === 'FIGHTER_REVEAL' && activeFighterA && activeFighterB && client.currentRound && (
        <div className="flex-1 flex flex-col justify-center items-center p-3 sm:p-4">
          <FighterAnnouncement
            roundNumber={client.currentRound.roundNumber}
            totalRounds={client.totalRounds}
            fighterA={activeFighterA}
            fighterB={activeFighterB}
            miniGame={client.currentRound.miniGame}
            revealEndsAt={client.currentRound.revealEndsAt}
            serverTimeOffset={client.serverTimeOffset}
            isChampionship={client.currentRound.isChampionship}
          />
        </div>
      )}

      {/* Phase 4: 15s Secret Betting Window */}
      {client.phase === 'BETTING_WINDOW' && activeFighterA && activeFighterB && client.currentRound && client.myPlayer && (
        <div className="flex-1 flex flex-col justify-center items-center p-3 sm:p-4">
          <BettingScreen
            fighterA={activeFighterA}
            fighterB={activeFighterB}
            odds={client.currentRound.odds}
            myPlayer={client.myPlayer}
            myBet={client.myBet}
            onPlaceBet={client.placeBet}
            bettingTimeRemaining={client.currentRound.bettingTimeRemaining}
            bettingEndsAt={client.currentRound.bettingEndsAt}
            serverTimeOffset={client.serverTimeOffset}
            lastRejectedBetReason={client.lastRejectedBetReason}
          />
        </div>
      )}

      {/* Phase 5: Mini-Game Countdown */}
      {client.phase === 'MINIGAME_COUNTDOWN' && client.currentRound && (
        <SynchronizedCountdown
          gameStartsAt={client.currentRound.gameStartsAt || Date.now() + 3500}
          serverTimeOffset={client.serverTimeOffset}
          miniGameName={client.currentRound.miniGame.name}
        />
      )}

      {/* Phase 6: Active Mini-Game Execution */}
      {client.phase === 'MINIGAME_ACTIVE' && activeFighterA && activeFighterB && client.currentRound && (
        <div className="flex-1 flex flex-col justify-center items-center p-3 sm:p-4 w-full">
          {client.currentRound.miniGame.id === 'millisecond_stop' && (
            <MillisecondStopGame
              fighterA={activeFighterA}
              fighterB={activeFighterB}
              isPlayerFighter={playerFighterSlot !== 'spectator'}
              playerFighterSlot={playerFighterSlot}
              fighterScores={client.currentRound.fighterScores}
              gameStartsAt={client.currentRound.gameStartsAt}
              serverTimeOffset={client.serverTimeOffset}
              onSendAction={client.sendFighterAction}
            />
          )}

          {client.currentRound.miniGame.id === 'rapid_red_green' && (
            <RedLightGreenLightGame
              fighterA={activeFighterA}
              fighterB={activeFighterB}
              isPlayerFighter={playerFighterSlot !== 'spectator'}
              playerFighterSlot={playerFighterSlot}
              fighterScores={client.currentRound.fighterScores}
              gameConfig={client.currentRound.gameConfig}
              gameStartsAt={client.currentRound.gameStartsAt}
              serverTimeOffset={client.serverTimeOffset}
              onSendAction={client.sendFighterAction}
            />
          )}

          {client.currentRound.miniGame.id === 'speed_math' && (
            <SpeedMathGame
              fighterA={activeFighterA}
              fighterB={activeFighterB}
              isPlayerFighter={playerFighterSlot !== 'spectator'}
              playerFighterSlot={playerFighterSlot}
              fighterScores={client.currentRound.fighterScores}
              gameState={client.currentRound.gameState}
              gameConfig={client.currentRound.gameConfig}
              serverTimeOffset={client.serverTimeOffset}
              onSendAction={client.sendFighterAction}
            />
          )}

          {client.currentRound.miniGame.id === 'higher_lower' && (
            <HigherLowerGame
              fighterA={activeFighterA}
              fighterB={activeFighterB}
              isPlayerFighter={playerFighterSlot !== 'spectator'}
              playerFighterSlot={playerFighterSlot}
              fighterScores={client.currentRound.fighterScores}
              gameState={client.currentRound.gameState}
              gameConfig={client.currentRound.gameConfig}
              onSendAction={client.sendFighterAction}
            />
          )}

          {client.currentRound.miniGame.id === 'blind_pinpoint' && (
            <BlindPinpointGame
              fighterA={activeFighterA}
              fighterB={activeFighterB}
              isPlayerFighter={playerFighterSlot !== 'spectator'}
              playerFighterSlot={playerFighterSlot}
              fighterScores={client.currentRound.fighterScores}
              gameState={client.currentRound.gameState}
              gameConfig={client.currentRound.gameConfig}
              onSendAction={client.sendFighterAction}
            />
          )}

          {client.currentRound.miniGame.id === 'quick_draw' && (
            <QuickDrawGame
              fighterA={activeFighterA}
              fighterB={activeFighterB}
              isPlayerFighter={playerFighterSlot !== 'spectator'}
              playerFighterSlot={playerFighterSlot}
              fighterScores={client.currentRound.fighterScores}
              gameState={client.currentRound.gameState}
              gameConfig={client.currentRound.gameConfig}
              serverTimeOffset={client.serverTimeOffset}
              onSendAction={client.sendFighterAction}
            />
          )}
        </div>
      )}

      {/* Phase 7: Payout & Round Recap */}
      {client.phase === 'PAYOUT_RECAP' && client.currentRound && (
        <div className="flex-1 flex flex-col justify-center items-center p-3 sm:p-4">
          <PayoutRecapModal
            round={client.currentRound}
            players={client.players}
            myPlayer={client.myPlayer}
            isHost={client.isHost}
            onNextRound={client.nextRound}
            isFinalRound={client.currentRound.roundNumber >= client.totalRounds}
          />
        </div>
      )}

      {/* Phase 8: Final Podium */}
      {client.phase === 'FINAL_PODIUM' && (
        <div className="flex-1 flex flex-col justify-center items-center p-3 sm:p-4">
          <PodiumScreen
            players={client.players}
            awards={client.awards}
            isHost={client.isHost}
            onPlayAgain={client.restartGame}
          />
        </div>
      )}

      {/* Optional Debug Mode Bar ONLY when ?debug=1 */}
      {client.isDebug && (
        <aside aria-label="Debug Tools" className="fixed bottom-0 left-0 right-0 bg-slate-950/90 border-t border-amber-500/40 px-3 py-1 text-[11px] font-mono text-amber-300 flex items-center justify-between z-40">
          <span>🛠️ DEBUG MODE ACTIVE</span>
          <div className="flex gap-2">
            <span>Room: {client.roomCode || 'None'}</span>
            <span>Status: {client.status}</span>
            {client.phase === 'LOBBY' && client.isHost && (
              <button
                onClick={client.addDebugBot}
                className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 cursor-pointer"
              >
                + Add Bot
              </button>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
