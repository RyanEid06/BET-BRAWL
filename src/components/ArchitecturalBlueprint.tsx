/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: Mobile Architecture Specification & Production Code Guide
 * (Kotlin Jetpack Compose + Ktor & React Native TypeScript / Expo)
 */

import React, { useState } from 'react';
import { Code2, Server, Wifi, Cpu, Layers, Copy, Check } from 'lucide-react';

export const ArchitecturalBlueprintModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'kotlin' | 'react_native' | 'network_protocol' | 'odds_math'>('kotlin');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="bg-slate-900 border border-cyan-500/30 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-500/20 text-cyan-400 rounded-lg">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Bet & BRAWL Architecture & Code Deliverables
                <span className="text-xs px-2 py-0.5 bg-cyan-950 text-cyan-300 border border-cyan-700/50 rounded-full font-mono">
                  v2.4 Spec
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Offline Local Wi-Fi Network Protocol · Ktor / Jetpack Compose · React Native / Expo
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
          >
            Close Esc
          </button>
        </div>

        {/* Tab Bar */}
        <div className="flex bg-slate-950 border-b border-slate-800 px-4 gap-2 pt-2">
          <button
            onClick={() => setActiveTab('kotlin')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors flex items-center gap-2 ${
              activeTab === 'kotlin'
                ? 'bg-slate-900 text-cyan-400 border-t-2 border-cyan-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Cpu className="w-4 h-4" /> Kotlin / Jetpack Compose (Android)
          </button>
          <button
            onClick={() => setActiveTab('react_native')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors flex items-center gap-2 ${
              activeTab === 'react_native'
                ? 'bg-slate-900 text-cyan-400 border-t-2 border-cyan-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code2 className="w-4 h-4" /> React Native / Expo (Cross-Platform)
          </button>
          <button
            onClick={() => setActiveTab('network_protocol')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors flex items-center gap-2 ${
              activeTab === 'network_protocol'
                ? 'bg-slate-900 text-cyan-400 border-t-2 border-cyan-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Wifi className="w-4 h-4" /> WebSocket Protocols & NSD
          </button>
          <button
            onClick={() => setActiveTab('odds_math')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors flex items-center gap-2 ${
              activeTab === 'odds_math'
                ? 'bg-slate-900 text-cyan-400 border-t-2 border-cyan-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Server className="w-4 h-4" /> Dynamic Odds Formula
          </button>
        </div>

        {/* Code Content */}
        <div className="flex-1 p-4 overflow-y-auto font-mono text-xs text-slate-300 bg-slate-900 space-y-4">
          {activeTab === 'kotlin' && (
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-cyan-400 font-semibold font-sans">
                  Android Embedded Ktor Server & StateFlow Architecture
                </span>
                <button
                  onClick={() => handleCopy(KOTLIN_KTOR_SNIPPET)}
                  className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied' : 'Copy Kotlin'}
                </button>
              </div>
              <pre className="p-4 bg-slate-950 rounded-xl border border-slate-800 overflow-x-auto text-emerald-400 leading-relaxed">
                {KOTLIN_KTOR_SNIPPET}
              </pre>
            </div>
          )}

          {activeTab === 'react_native' && (
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-cyan-400 font-semibold font-sans">
                  React Native / Expo Embedded WebSocket Client & Zustand Store
                </span>
                <button
                  onClick={() => handleCopy(REACT_NATIVE_SNIPPET)}
                  className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied' : 'Copy TypeScript'}
                </button>
              </div>
              <pre className="p-4 bg-slate-950 rounded-xl border border-slate-800 overflow-x-auto text-cyan-300 leading-relaxed">
                {REACT_NATIVE_SNIPPET}
              </pre>
            </div>
          )}

          {activeTab === 'network_protocol' && (
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-cyan-400 font-semibold font-sans">
                  Network Service Discovery (ZeroConf) & JSON Packet Specifications
                </span>
              </div>
              <pre className="p-4 bg-slate-950 rounded-xl border border-slate-800 overflow-x-auto text-yellow-300 leading-relaxed">
                {NETWORK_SPECS_SNIPPET}
              </pre>
            </div>
          )}

          {activeTab === 'odds_math' && (
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-cyan-400 font-semibold font-sans">
                  Dynamic Odds & Payout Algorithm Mathematical Proof
                </span>
              </div>
              <pre className="p-4 bg-slate-950 rounded-xl border border-slate-800 overflow-x-auto text-pink-300 leading-relaxed">
                {ODDS_MATHEMATICAL_PROOF}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const KOTLIN_KTOR_SNIPPET = `// BetAndBrawlServer.kt (Embedded Host Engine)
package com.betnbrawl.engine.network

import io.ktor.server.engine.*
import io.ktor.server.netty.*
import io.ktor.server.websocket.*
import io.ktor.websocket.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.serialization.json.Json
import java.util.Collections
import java.util.concurrent.ConcurrentHashMap

class BetAndBrawlHostEngine(private val port: Int = 8080) {
    private val json = Json { ignoreUnknownKeys = true }
    private val connectedSessions = Collections.synchronizedSet<WebSocketSession>(LinkedHashSet())
    val gameStateFlow = MutableStateFlow<GameState>(GameState.Lobby())

    private var server: EmbeddedServer<NettyApplicationEngine, NettyApplicationEngine.Configuration>? = null

    fun startServer() {
        server = embeddedServer(Netty, port = port) {
            install(WebSockets) {
                pingPeriodMillis = 15_000
                timeoutMillis = 30_000
            }
            routing {
                webSocket("/ws/brawl") {
                    connectedSessions.add(this)
                    try {
                        for (frame in incoming) {
                            if (frame is Frame.Text) {
                                handleIncomingPacket(frame.readText(), this)
                            }
                        }
                    } finally {
                        connectedSessions.remove(this)
                    }
                }
            }
        }.start(wait = false)
    }

    suspend fun broadcast(message: WebSocketMessage) {
        val payload = json.encodeToString(WebSocketMessage.serializer(), message)
        connectedSessions.forEach { session ->
            session.send(Frame.Text(payload))
        }
    }
}`;

const REACT_NATIVE_SNIPPET = `// useBrawlSocket.ts (React Native Expo WebSocket Client)
import { useEffect, useRef } from 'react';
import { create } from 'zustand';

interface BrawlClientStore {
  connected: boolean;
  phase: string;
  players: any[];
  currentRound: any;
  odds: Record<string, any>;
  placeBet: (fighterId: string, amount: number) => void;
  sendInput: (action: string, value?: any) => void;
}

export const useBrawlStore = create<BrawlClientStore>((set, get) => ({
  connected: false,
  phase: 'LOBBY',
  players: [],
  currentRound: null,
  odds: {},
  placeBet: (fighterId, amount) => {
    // sends { type: 'BET_PLACED', fighterId, amount } over socket
  },
  sendInput: (action, value) => {
    // sends low-latency UDP/WebSocket frame
  }
}));`;

const NETWORK_SPECS_SNIPPET = `// Network Service Discovery (Android NsdManager)
Service Type: "_betnbrawl._tcp"
Port: 8080
TXT Record: { "roomCode": "BRAWL", "version": "1.0", "name": "Dave's Host" }

// Core WebSocket JSON Message Schemas:
1. ROUND_INIT:
{
  "type": "ROUND_INIT",
  "roomId": "room_wi_fi_7429",
  "roundNumber": 2,
  "maxRounds": 8,
  "fighterIds": ["p1", "p3"],
  "miniGame": { "id": "millisecond_stop", "durationSeconds": 10 },
  "initialOdds": {
    "p1": { "decimalOdds": 1.45, "fractionalOdds": "1/2" },
    "p3": { "decimalOdds": 2.85, "fractionalOdds": "9/5" }
  }
}

2. BET_PLACED:
{
  "type": "BET_PLACED",
  "bettorId": "p4",
  "fighterId": "p1",
  "amount": 250
}

3. ODDS_SYNC:
{
  "type": "ODDS_SYNC",
  "odds": { "p1": 1.35, "p3": 3.10 },
  "totalPot": 750
}`;

const ODDS_MATHEMATICAL_PROOF = `MATHEMATICAL MODEL FOR DYNAMIC BETTING ODDS:

1. Baseline Win Rates with Laplace Smoothing:
   Let W_i be matches won and N_i be matches played by Fighter i.
   Laplace smoothed win rate:
   w_i = (W_i + 1) / (N_i + 2)

2. Relative Risk Ratio:
   Ratio_A = w_B / w_A
   Odds_Base_A = 1 + (Ratio_A * RiskFactor)

3. Pari-Mutuel Pool Adaptation:
   Let C_A, C_B be current coin volumes bet on each fighter.
   PoolOdds_A = ((C_A + C_B + 2*Seed) / (C_A + Seed)) * (1 - HouseVig)

4. Final Dynamic Blend:
   Weight_Pool = min(0.65, TotalBets / 1500)
   FinalOdds_A = clamp(1.10, 9.50, (1 - Weight_Pool)*Odds_Base_A + Weight_Pool*PoolOdds_A)
`;
