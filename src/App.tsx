/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: Master Engine Controller & Real-Time Party Game
 */

import React, { useState, useEffect } from 'react';
import type { GamePhase } from './engine/types.ts';
import {
  createInitialServerState,
  initNewRound,
  placeBet,
  simulateSpectatorBets,
  resolveMiniGame,
  computePodiumAwards,
  ServerState,
} from './engine/stateMachine.ts';
import { sound } from './engine/audio.ts';

// UI Screens
import { TitleAndDiscovery } from './components/TitleAndDiscovery.tsx';
import { LobbyScreen } from './components/LobbyScreen.tsx';
import { FighterAnnouncement } from './components/FighterAnnouncement.tsx';
import { BettingScreen } from './components/BettingScreen.tsx';
import { PayoutRecapModal } from './components/PayoutRecapModal.tsx';
import { PodiumScreen } from './components/PodiumScreen.tsx';
import { MultiDevicePerspectiveBar } from './components/MultiDevicePerspectiveBar.tsx';
import { ArchitecturalBlueprintModal } from './components/ArchitecturalBlueprint.tsx';

// Mini-Games
import { MillisecondStopGame } from './components/games/MillisecondStopGame.tsx';
import { RedLightGreenLightGame } from './components/games/RedLightGreenLightGame.tsx';
import { SpeedMathGame } from './components/games/SpeedMathGame.tsx';
import { HigherLowerGame } from './components/games/HigherLowerGame.tsx';
import { BlindPinpointGame } from './components/games/BlindPinpointGame.tsx';
import { CoinFlipGame } from './components/games/CoinFlipGame.tsx';

export default function App() {
  const [serverState, setServerState] = useState<ServerState>(() => createInitialServerState());
  const [showTitleScreen, setShowTitleScreen] = useState<boolean>(true);
  const [isBlueprintOpen, setIsBlueprintOpen] = useState<boolean>(false);
  const [countdownNum, setCountdownNum] = useState<number>(3);

  // Check ?autostart=1
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      setShowTitleScreen(false);
      document.body.dataset.state = 'playing';
    } else {
      document.body.dataset.state = 'title';
    }
  }, []);

  // Update body dataset state to mirror game phase
  useEffect(() => {
    if (showTitleScreen) {
      document.body.dataset.state = 'title';
    } else if (serverState.phase === 'FINAL_PODIUM') {
      document.body.dataset.state = 'gameover';
    } else {
      document.body.dataset.state = 'playing';
    }
  }, [showTitleScreen, serverState.phase]);

  // Simulate spectator bets during the betting window
  useEffect(() => {
    if (serverState.phase === 'BETTING_WINDOW') {
      const betInterval = setInterval(() => {
        setServerState(prev => simulateSpectatorBets(prev));
      }, 2500);

      return () => clearInterval(betInterval);
    }
  }, [serverState.phase]);

  // Handle Enter Lobby from Title Screen
  const handleEnterLobby = () => {
    setShowTitleScreen(false);
    document.body.dataset.state = 'playing';
  };

  // Start Brawl (Round 1)
  const handleStartGame = () => {
    setServerState(prev => initNewRound(prev));
  };

  // Transition from Fighter Reveal to Betting Window
  const handleContinueToBetting = () => {
    setServerState(prev => ({
      ...prev,
      phase: 'BETTING_WINDOW',
    }));
  };

  // Betting timer expired -> 3s countdown before mini-game
  const handleBettingExpired = () => {
    setServerState(prev => ({
      ...prev,
      phase: 'MINIGAME_COUNTDOWN',
    }));
    setCountdownNum(3);
    sound.playCountdown(false);

    let count = 3;
    const interval = setInterval(() => {
      count -= 1;
      if (count > 0) {
        setCountdownNum(count);
        sound.playCountdown(false);
      } else {
        clearInterval(interval);
        sound.playCountdown(true);
        setServerState(prev => ({
          ...prev,
          phase: 'MINIGAME_ACTIVE',
        }));
      }
    }, 1000);
  };

  // Place secret bet
  const handlePlaceBet = (fighterId: string, amount: number) => {
    setServerState(prev => placeBet(prev, prev.clientPerspective, fighterId, amount));
  };

  // Mini-Game completed -> Resolve winner and calculate payouts
  const handleMiniGameComplete = (winnerId: string, scores: Record<string, number>) => {
    setServerState(prev => resolveMiniGame(prev, winnerId, scores));
  };

  // Advance to next round or podium
  const handleNextRound = () => {
    if (serverState.currentRound && serverState.currentRound.roundNumber >= serverState.totalRounds) {
      // Game over -> Show final podium
      const awards = computePodiumAwards(serverState.players);
      setServerState(prev => ({
        ...prev,
        phase: 'FINAL_PODIUM',
        awards,
      }));
    } else {
      setServerState(prev => initNewRound(prev));
    }
  };

  // Play again / rematch
  const handlePlayAgain = () => {
    setServerState(createInitialServerState());
  };

  // Helper getters
  const activeFighterA = serverState.players.find(p => p.id === serverState.currentRound?.fighterIds[0]);
  const activeFighterB = serverState.players.find(p => p.id === serverState.currentRound?.fighterIds[1]);
  const clientPlayer = serverState.players.find(p => p.id === serverState.clientPerspective) || serverState.players[0];

  const playerFighterSlot: 'A' | 'B' | 'spectator' =
    clientPlayer.id === activeFighterA?.id
      ? 'A'
      : clientPlayer.id === activeFighterB?.id
      ? 'B'
      : 'spectator';

  return (
    <div className="min-h-screen bg-[#090a10] text-slate-100 flex flex-col justify-between select-none relative pb-28">
      {/* Title & Wi-Fi Discovery Screen */}
      {showTitleScreen ? (
        <TitleAndDiscovery
          playerName={clientPlayer.name}
          setPlayerName={name => {
            setServerState(prev => ({
              ...prev,
              players: prev.players.map(p => (p.id === clientPlayer.id ? { ...p, name } : p)),
            }));
          }}
          playerAvatar={clientPlayer.avatar}
          setPlayerAvatar={avatar => {
            setServerState(prev => ({
              ...prev,
              players: prev.players.map(p => (p.id === clientPlayer.id ? { ...p, avatar } : p)),
            }));
          }}
          onEnterLobby={handleEnterLobby}
          onOpenBlueprint={() => setIsBlueprintOpen(true)}
        />
      ) : (
        <div className="flex-1 flex flex-col justify-center items-center p-4">
          {/* Phase 1: Room Lobby */}
          {serverState.phase === 'LOBBY' && (
            <LobbyScreen
              players={serverState.players}
              roomCode={serverState.roomCode}
              totalRounds={serverState.totalRounds}
              setTotalRounds={n => setServerState(prev => ({ ...prev, totalRounds: n }))}
              onStartGame={handleStartGame}
              onAddPlayer={() => {
                const nextIdx = serverState.players.length + 1;
                const newPlayer = {
                  id: `p${nextIdx}`,
                  name: `Rookie ${nextIdx}`,
                  avatar: '🎲',
                  color: '#10b981',
                  isHost: false,
                  isReady: true,
                  isBot: true,
                  coins: 1000,
                  matchesWon: 0,
                  matchesPlayed: 0,
                  totalBetsPlaced: 0,
                  totalBetsWon: 0,
                  totalCoinsWonInBets: 0,
                  totalCoinsLostInBets: 0,
                  highestSingleBet: 0,
                  highestSinglePayout: 0,
                };
                setServerState(prev => ({ ...prev, players: [...prev.players, newPlayer] }));
              }}
              onRemovePlayer={id => {
                setServerState(prev => ({
                  ...prev,
                  players: prev.players.filter(p => p.id !== id),
                }));
              }}
              onToggleReady={id => {
                setServerState(prev => ({
                  ...prev,
                  players: prev.players.map(p => (p.id === id ? { ...p, isReady: !p.isReady } : p)),
                }));
              }}
            />
          )}

          {/* Phase 2: Fighter Reveal / VS Splash */}
          {serverState.phase === 'FIGHTER_REVEAL' && activeFighterA && activeFighterB && serverState.currentRound && (
            <FighterAnnouncement
              roundNumber={serverState.currentRound.roundNumber}
              totalRounds={serverState.totalRounds}
              fighterA={activeFighterA}
              fighterB={activeFighterB}
              miniGame={serverState.currentRound.miniGame}
              onContinueToBetting={handleContinueToBetting}
            />
          )}

          {/* Phase 3: 15s Secret Betting Window */}
          {serverState.phase === 'BETTING_WINDOW' && activeFighterA && activeFighterB && serverState.currentRound && (
            <BettingScreen
              fighterA={activeFighterA}
              fighterB={activeFighterB}
              odds={serverState.currentRound.odds}
              currentBets={serverState.currentRound.bets}
              clientPlayer={clientPlayer}
              onPlaceBet={handlePlaceBet}
              onTimeExpired={handleBettingExpired}
            />
          )}

          {/* Phase 4: Mini-Game 3.. 2.. 1.. Countdown */}
          {serverState.phase === 'MINIGAME_COUNTDOWN' && (
            <div className="flex flex-col items-center justify-center space-y-4 my-auto">
              <span className="text-xs font-mono text-cyan-400 uppercase tracking-widest">
                PREPARE YOUR REFLEXES
              </span>
              <div className="text-9xl font-black font-display text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-amber-400 animate-ping">
                {countdownNum}
              </div>
              <div className="text-xl font-display font-black text-white uppercase tracking-wider">
                GET READY TO BRAWL!
              </div>
            </div>
          )}

          {/* Phase 5: Active Mini-Game Execution */}
          {serverState.phase === 'MINIGAME_ACTIVE' && activeFighterA && activeFighterB && serverState.currentRound && (
            <div className="w-full">
              {serverState.currentRound.miniGame.id === 'millisecond_stop' && (
                <MillisecondStopGame
                  fighterA={activeFighterA}
                  fighterB={activeFighterB}
                  isPlayerFighter={playerFighterSlot !== 'spectator'}
                  playerFighterSlot={playerFighterSlot}
                  onComplete={handleMiniGameComplete}
                />
              )}
              {serverState.currentRound.miniGame.id === 'rapid_red_green' && (
                <RedLightGreenLightGame
                  fighterA={activeFighterA}
                  fighterB={activeFighterB}
                  isPlayerFighter={playerFighterSlot !== 'spectator'}
                  playerFighterSlot={playerFighterSlot}
                  onComplete={handleMiniGameComplete}
                />
              )}
              {serverState.currentRound.miniGame.id === 'speed_math' && (
                <SpeedMathGame
                  fighterA={activeFighterA}
                  fighterB={activeFighterB}
                  isPlayerFighter={playerFighterSlot !== 'spectator'}
                  playerFighterSlot={playerFighterSlot}
                  onComplete={handleMiniGameComplete}
                />
              )}
              {serverState.currentRound.miniGame.id === 'higher_lower' && (
                <HigherLowerGame
                  fighterA={activeFighterA}
                  fighterB={activeFighterB}
                  isPlayerFighter={playerFighterSlot !== 'spectator'}
                  playerFighterSlot={playerFighterSlot}
                  onComplete={handleMiniGameComplete}
                />
              )}
              {serverState.currentRound.miniGame.id === 'blind_pinpoint' && (
                <BlindPinpointGame
                  fighterA={activeFighterA}
                  fighterB={activeFighterB}
                  isPlayerFighter={playerFighterSlot !== 'spectator'}
                  playerFighterSlot={playerFighterSlot}
                  onComplete={handleMiniGameComplete}
                />
              )}
              {serverState.currentRound.miniGame.id === 'coin_flip_double' && (
                <CoinFlipGame
                  fighterA={activeFighterA}
                  fighterB={activeFighterB}
                  isPlayerFighter={playerFighterSlot !== 'spectator'}
                  playerFighterSlot={playerFighterSlot}
                  onComplete={handleMiniGameComplete}
                />
              )}
            </div>
          )}

          {/* Phase 6: Payout & Round Recap */}
          {serverState.phase === 'PAYOUT_RECAP' && serverState.currentRound && (
            <PayoutRecapModal
              round={serverState.currentRound}
              players={serverState.players}
              onNextRound={handleNextRound}
              isFinalRound={serverState.currentRound.roundNumber >= serverState.totalRounds}
            />
          )}

          {/* Phase 7: Final Kahoot-Style Podium */}
          {serverState.phase === 'FINAL_PODIUM' && (
            <PodiumScreen
              players={serverState.players}
              awards={serverState.awards}
              onPlayAgain={handlePlayAgain}
            />
          )}
        </div>
      )}

      {/* Multi-Device Perspective Switcher & Network Inspector Bar */}
      <MultiDevicePerspectiveBar
        players={serverState.players}
        clientPerspective={serverState.clientPerspective}
        setClientPerspective={id => setServerState(prev => ({ ...prev, clientPerspective: id }))}
        messageLog={serverState.messageLog}
        onOpenBlueprint={() => setIsBlueprintOpen(true)}
      />

      {/* Technical Architecture Modal */}
      <ArchitecturalBlueprintModal
        isOpen={isBlueprintOpen}
        onClose={() => setIsBlueprintOpen(false)}
      />
    </div>
  );
}
