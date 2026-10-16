/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: Authoritative Server Mini-Game Logic
 * 
 * Pure, authoritative rules for all 6 active mini-games.
 * Calculates all scores, reaction times, distances, penalties, and winners server-side.
 */

import type { MiniGameId, FighterAction } from './types.ts';
import {
  generateMathQuestions,
  STABLE_HIGHER_LOWER_BANK,
  WORLD_CITIES,
  calculateHaversineKm,
  normCoordsToLatLon,
  CityLocation,
  HigherLowerTrivia,
} from './miniGamesCatalog.ts';
import { fisherYatesShuffle } from './roomEngine.ts';

export interface LightScheduleStep {
  light: 'GREEN' | 'RED';
  durationMs: number;
}

export interface InternalGameState {
  miniGameId: MiniGameId;
  fighterIds: [string, string];
  gameStartsAt: number;
  // Mini-game specific private variables
  millisecondStop?: {
    stopped: Record<string, boolean>;
  };
  redGreen?: {
    schedule: LightScheduleStep[];
    lastTapAt: Record<string, number>;
  };
  speedMath?: {
    correctAnswers: number[];
    progress: Record<string, number>;
    penaltyUntil: Record<string, number>;
  };
  higherLower?: {
    cards: HigherLowerTrivia[];
    stepIndex: Record<string, number>;
  };
  blindPinpoint?: {
    targetCity: CityLocation;
    pins: Record<string, { normX: number; normY: number; km: number }>;
  };
  quickDraw?: {
    drawDelayMs: number;
    drawAt: number;
    fouls: Record<string, boolean>;
    reactions: Record<string, number>;
  };
}

export interface GameActionResult {
  resolved: boolean;
  winnerId: string | null;
  isTie: boolean;
  scoreUpdate?: Record<string, number>;
  gameStatePatch?: Record<string, unknown>;
  rejectionReason?: string;
}

export function getLightAtServerTime(schedule: LightScheduleStep[], elapsedMs: number): 'GREEN' | 'RED' {
  let accumulated = 0;
  for (const step of schedule) {
    if (elapsedMs >= accumulated && elapsedMs < accumulated + step.durationMs) {
      return step.light;
    }
    accumulated += step.durationMs;
  }
  return 'GREEN'; // Default if elapsed exceeds schedule
}

/**
 * Initializes authoritative server game state and scrubbed public game config.
 */
export function initMiniGameServerState(
  miniGameId: MiniGameId,
  fighterIds: [string, string],
  gameStartsAt: number
): { internal: InternalGameState; publicConfig: Record<string, unknown> } {
  const [f1, f2] = fighterIds;
  const internal: InternalGameState = {
    miniGameId,
    fighterIds,
    gameStartsAt,
  };
  const publicConfig: Record<string, unknown> = {};

  if (miniGameId === 'millisecond_stop') {
    internal.millisecondStop = {
      stopped: { [f1]: false, [f2]: false },
    };
    publicConfig.targetSeconds = 5.0;
    publicConfig.blindSeconds = 3.0;
  } else if (miniGameId === 'rapid_red_green') {
    const sequence: LightScheduleStep[] = [];
    let accumulatedMs = 0;
    let currentLight: 'GREEN' | 'RED' = 'GREEN';

    while (accumulatedMs < 16000) {
      const dur = currentLight === 'GREEN'
        ? Math.floor(1400 + Math.random() * 1200)
        : Math.floor(800 + Math.random() * 800);
      sequence.push({ light: currentLight, durationMs: dur });
      accumulatedMs += dur;
      currentLight = currentLight === 'GREEN' ? 'RED' : 'GREEN';
    }

    internal.redGreen = {
      schedule: sequence,
      lastTapAt: { [f1]: 0, [f2]: 0 },
    };
    publicConfig.lightSchedule = sequence;
    publicConfig.targetScore = 40;
  } else if (miniGameId === 'speed_math') {
    const questions = generateMathQuestions(3);
    internal.speedMath = {
      correctAnswers: questions.map(q => q.correct),
      progress: { [f1]: 0, [f2]: 0 },
      penaltyUntil: { [f1]: 0, [f2]: 0 },
    };
    // Scrub correct answers from public config!
    publicConfig.questions = questions.map(q => ({
      q: q.q,
      choices: q.choices,
    }));
  } else if (miniGameId === 'higher_lower') {
    // Pick 4 shuffled cards using Fisher-Yates
    const shuffledBank = fisherYatesShuffle(STABLE_HIGHER_LOWER_BANK);
    const cards = shuffledBank.slice(0, 4);

    internal.higherLower = {
      cards,
      stepIndex: { [f1]: 0, [f2]: 0 },
    };
    // Public card info displays base items; challenger values revealed only after guess
    publicConfig.cards = cards.map(c => ({
      baseItem: c.baseItem,
      baseStat: c.baseStat,
      challengerItem: c.challengerItem,
      challengerStat: c.challengerStat,
      isHigher: c.isHigher,
    }));
  } else if (miniGameId === 'blind_pinpoint') {
    const cityIdx = Math.floor(Math.random() * WORLD_CITIES.length);
    const targetCity = WORLD_CITIES[cityIdx];

    internal.blindPinpoint = {
      targetCity,
      pins: {},
    };
    // Scrub targetLat / targetLon from public view until round resolves!
    publicConfig.targetCity = {
      city: targetCity.city,
      country: targetCity.country,
    };
  } else if (miniGameId === 'quick_draw') {
    const drawDelayMs = Math.floor(2200 + Math.random() * 2600);
    const drawAt = gameStartsAt + drawDelayMs;

    internal.quickDraw = {
      drawDelayMs,
      drawAt,
      fouls: { [f1]: false, [f2]: false },
      reactions: {},
    };
    publicConfig.drawDelayMs = drawDelayMs;
    publicConfig.drawAt = drawAt;
  }

  return { internal, publicConfig };
}

/**
 * Evaluates an authoritative fighter action against the active mini-game rules.
 */
export function processFighterAction(
  internal: InternalGameState,
  fighterScores: Record<string, number>,
  fighterId: string,
  action: FighterAction,
  nowMs: number
): GameActionResult {
  if (!action || typeof action !== 'object' || typeof action.type !== 'string') {
    return { resolved: false, isTie: false, winnerId: null, rejectionReason: 'Malformed action' };
  }

  const [f1, f2] = internal.fighterIds;
  if (fighterId !== f1 && fighterId !== f2) {
    return { resolved: false, isTie: false, winnerId: null, rejectionReason: 'Not an active fighter' };
  }

  const otherFighterId = fighterId === f1 ? f2 : f1;

  // 1. MILLISECOND STOP
  if (internal.miniGameId === 'millisecond_stop') {
    if (action.type !== 'STOP') {
      return { resolved: false, isTie: false, winnerId: null, rejectionReason: 'Invalid action for Millisecond Stop' };
    }
    const stopState = internal.millisecondStop!;
    if (stopState.stopped[fighterId]) {
      return { resolved: false, isTie: false, winnerId: null, rejectionReason: 'Already stopped' };
    }

    const elapsedSeconds = Math.max(0, (nowMs - internal.gameStartsAt) / 1000);
    stopState.stopped[fighterId] = true;
    fighterScores[fighterId] = Math.round(elapsedSeconds * 1000) / 1000;

    // Check if both fighters have stopped
    if (stopState.stopped[f1] && stopState.stopped[f2]) {
      const s1 = fighterScores[f1];
      const s2 = fighterScores[f2];
      const delta1 = Math.abs(s1 - 5.0);
      const delta2 = Math.abs(s2 - 5.0);

      if (Math.abs(delta1 - delta2) < 0.005) {
        return { resolved: true, isTie: true, winnerId: null, scoreUpdate: { ...fighterScores } };
      }
      const winnerId = delta1 < delta2 ? f1 : f2;
      return { resolved: true, isTie: false, winnerId, scoreUpdate: { ...fighterScores } };
    }

    return { resolved: false, isTie: false, winnerId: null, scoreUpdate: { ...fighterScores } };
  }

  // 2. RAPID RED LIGHT, GREEN LIGHT
  if (internal.miniGameId === 'rapid_red_green') {
    if (action.type !== 'TAP') {
      return { resolved: false, isTie: false, winnerId: null, rejectionReason: 'Invalid action for Red Light Green Light' };
    }
    const rg = internal.redGreen!;
    // Rate limit: minimum 30ms between taps per client
    const lastTap = rg.lastTapAt[fighterId] || 0;
    if (nowMs - lastTap < 30) {
      return { resolved: false, isTie: false, winnerId: null };
    }
    rg.lastTapAt[fighterId] = nowMs;

    const elapsedMs = nowMs - internal.gameStartsAt;
    const currentLight = getLightAtServerTime(rg.schedule, elapsedMs);
    const currentScore = fighterScores[fighterId] || 0;

    let newScore: number;
    if (currentLight === 'GREEN') {
      newScore = Math.min(40, currentScore + 1);
    } else {
      newScore = Math.max(0, currentScore - 3);
    }
    fighterScores[fighterId] = newScore;

    if (newScore >= 40) {
      return { resolved: true, isTie: false, winnerId: fighterId, scoreUpdate: { ...fighterScores } };
    }

    return { resolved: false, isTie: false, winnerId: null, scoreUpdate: { ...fighterScores } };
  }

  // 3. SPEED MATH
  if (internal.miniGameId === 'speed_math') {
    if (action.type !== 'ANSWER') {
      return { resolved: false, isTie: false, winnerId: null, rejectionReason: 'Invalid action for Speed Math' };
    }
    if (!Number.isInteger(action.questionIndex) || action.questionIndex < 0 || typeof action.answer !== 'number' || !Number.isFinite(action.answer)) {
      return { resolved: false, isTie: false, winnerId: null, rejectionReason: 'Invalid Speed Math answer payload' };
    }

    const sm = internal.speedMath!;
    // Penalty lock check
    if (nowMs < (sm.penaltyUntil[fighterId] || 0)) {
      return { resolved: false, isTie: false, winnerId: null, rejectionReason: 'Penalty active' };
    }

    const currentProgress = sm.progress[fighterId] || 0;
    if (action.questionIndex !== currentProgress) {
      return { resolved: false, isTie: false, winnerId: null, rejectionReason: 'Stale question index' };
    }

    const expectedAnswer = sm.correctAnswers[currentProgress];
    if (action.answer === expectedAnswer) {
      const nextProgress = currentProgress + 1;
      sm.progress[fighterId] = nextProgress;
      fighterScores[fighterId] = nextProgress;

      if (nextProgress >= 3) {
        return {
          resolved: true,
          isTie: false,
          winnerId: fighterId,
          scoreUpdate: { ...fighterScores },
          gameStatePatch: { progress: sm.progress },
        };
      }

      return {
        resolved: false,
        isTie: false,
        winnerId: null,
        scoreUpdate: { ...fighterScores },
        gameStatePatch: { progress: sm.progress },
      };
    } else {
      // Wrong answer -> 1500ms penalty
      sm.penaltyUntil[fighterId] = nowMs + 1500;
      return {
        resolved: false,
        isTie: false,
        winnerId: null,
        gameStatePatch: {
          penaltyUntil: sm.penaltyUntil,
        },
      };
    }
  }

  // 4. HIGHER OR LOWER
  if (internal.miniGameId === 'higher_lower') {
    if (action.type !== 'GUESS') {
      return { resolved: false, isTie: false, winnerId: null, rejectionReason: 'Invalid action for Higher Lower' };
    }
    // Strict runtime validation
    if (action.guess !== 'HIGHER' && action.guess !== 'LOWER') {
      return { resolved: false, isTie: false, winnerId: null, rejectionReason: 'Guess must be HIGHER or LOWER' };
    }
    if (!Number.isInteger(action.questionIndex) || action.questionIndex < 0) {
      return { resolved: false, isTie: false, winnerId: null, rejectionReason: 'Invalid questionIndex' };
    }

    const hl = internal.higherLower!;
    const currentStep = hl.stepIndex[fighterId] || 0;

    if (action.questionIndex !== currentStep) {
      return { resolved: false, isTie: false, winnerId: null, rejectionReason: 'Stale trivia index' };
    }
    if (currentStep >= hl.cards.length) {
      return { resolved: false, isTie: false, winnerId: null, rejectionReason: 'Already completed questions' };
    }

    const card = hl.cards[currentStep];
    const isCorrect = (action.guess === 'HIGHER') === card.isHigher;
    const currentScore = fighterScores[fighterId] || 0;
    const newScore = isCorrect ? currentScore + 1 : currentScore;

    fighterScores[fighterId] = newScore;
    hl.stepIndex[fighterId] = currentStep + 1;

    // First to 3 correct wins immediately
    if (newScore >= 3) {
      return {
        resolved: true,
        isTie: false,
        winnerId: fighterId,
        scoreUpdate: { ...fighterScores },
        gameStatePatch: { stepIndex: hl.stepIndex },
      };
    }

    return {
      resolved: false,
      isTie: false,
      winnerId: null,
      scoreUpdate: { ...fighterScores },
      gameStatePatch: { stepIndex: hl.stepIndex },
    };
  }

  // 5. BLIND PINPOINT
  if (internal.miniGameId === 'blind_pinpoint') {
    if (action.type !== 'PIN') {
      return { resolved: false, isTie: false, winnerId: null, rejectionReason: 'Invalid action for Blind Pinpoint' };
    }
    const bp = internal.blindPinpoint!;
    if (bp.pins[fighterId]) {
      return { resolved: false, isTie: false, winnerId: null, rejectionReason: 'Already pinned' };
    }

    const { normX, normY } = action;
    if (
      typeof normX !== 'number' ||
      typeof normY !== 'number' ||
      !Number.isFinite(normX) ||
      !Number.isFinite(normY) ||
      normX < 0 ||
      normX > 1 ||
      normY < 0 ||
      normY > 1
    ) {
      return { resolved: false, isTie: false, winnerId: null, rejectionReason: 'Coordinates must be numbers between 0 and 1' };
    }

    const { lat, lon } = normCoordsToLatLon(normX, normY);
    const distanceKm = calculateHaversineKm(lat, lon, bp.targetCity.lat, bp.targetCity.lon);
    bp.pins[fighterId] = { normX, normY, km: distanceKm };
    fighterScores[fighterId] = distanceKm;

    // If both fighters have submitted, resolve IMMEDIATELY
    if (bp.pins[f1] && bp.pins[f2]) {
      const dist1 = bp.pins[f1].km;
      const dist2 = bp.pins[f2].km;

      if (Math.abs(dist1 - dist2) < 10) {
        return {
          resolved: true,
          isTie: true,
          winnerId: null,
          scoreUpdate: { ...fighterScores },
          gameStatePatch: {
            revealedCity: bp.targetCity,
            pins: bp.pins,
          },
        };
      }

      const winnerId = dist1 < dist2 ? f1 : f2;
      return {
        resolved: true,
        isTie: false,
        winnerId,
        scoreUpdate: { ...fighterScores },
        gameStatePatch: {
          revealedCity: bp.targetCity,
          pins: bp.pins,
        },
      };
    }

    return {
      resolved: false,
      isTie: false,
      winnerId: null,
      scoreUpdate: { ...fighterScores },
      gameStatePatch: { pins: bp.pins },
    };
  }

  // 6. QUICK DRAW (No pre-tap exploit: any tap before drawAt is an immediate false start foul)
  if (internal.miniGameId === 'quick_draw') {
    if (action.type !== 'DRAW_TAP') {
      return { resolved: false, isTie: false, winnerId: null, rejectionReason: 'Invalid action for Quick Draw' };
    }
    const qd = internal.quickDraw!;

    if (qd.fouls[fighterId] || qd.reactions[fighterId] !== undefined) {
      return { resolved: false, isTie: false, winnerId: null, rejectionReason: 'Already acted' };
    }

    // Strict false start: If tap timestamp is before drawAt, it is an instant FALSE START FOUL
    if (nowMs < qd.drawAt) {
      qd.fouls[fighterId] = true;
      fighterScores[fighterId] = -1; // -1 indicates false start foul
      fighterScores[otherFighterId] = 1;

      return {
        resolved: true,
        isTie: false,
        winnerId: otherFighterId,
        scoreUpdate: { ...fighterScores },
        gameStatePatch: {
          fouls: qd.fouls,
          reactions: qd.reactions,
        },
      };
    }

    // Valid reaction: strictly non-negative reaction time
    const reactionMs = nowMs - qd.drawAt;
    qd.reactions[fighterId] = reactionMs;
    fighterScores[fighterId] = reactionMs;

    // If both fighters have reacted
    if (qd.reactions[f1] !== undefined && qd.reactions[f2] !== undefined) {
      const r1 = qd.reactions[f1];
      const r2 = qd.reactions[f2];

      if (Math.abs(r1 - r2) < 5) {
        return {
          resolved: true,
          isTie: true,
          winnerId: null,
          scoreUpdate: { ...fighterScores },
          gameStatePatch: { reactions: qd.reactions },
        };
      }

      // LOWER reactionMs wins!
      const winnerId = r1 < r2 ? f1 : f2;
      return {
        resolved: true,
        isTie: false,
        winnerId,
        scoreUpdate: { ...fighterScores },
        gameStatePatch: { reactions: qd.reactions },
      };
    }

    return {
      resolved: false,
      isTie: false,
      winnerId: null,
      scoreUpdate: { ...fighterScores },
      gameStatePatch: { reactions: qd.reactions },
    };
  }

  return { resolved: false, isTie: false, winnerId: null };
}

/**
 * Handles expiration of round duration when neither reached automatic win condition.
 */
export function resolveGameTimeout(
  internal: InternalGameState,
  fighterScores: Record<string, number>
): { winnerId: string | null; isTie: boolean; gameStatePatch?: Record<string, unknown> } {
  const [f1, f2] = internal.fighterIds;
  const s1 = fighterScores[f1];
  const s2 = fighterScores[f2];

  if (internal.miniGameId === 'millisecond_stop') {
    const has1 = s1 !== undefined && s1 > 0;
    const has2 = s2 !== undefined && s2 > 0;
    if (has1 && has2) {
      const d1 = Math.abs(s1 - 5.0);
      const d2 = Math.abs(s2 - 5.0);
      if (Math.abs(d1 - d2) < 0.005) return { winnerId: null, isTie: true };
      return { winnerId: d1 < d2 ? f1 : f2, isTie: false };
    }
    if (has1 && !has2) return { winnerId: f1, isTie: false };
    if (!has1 && has2) return { winnerId: f2, isTie: false };
    return { winnerId: null, isTie: true }; // Neither stopped
  }

  if (internal.miniGameId === 'rapid_red_green' || internal.miniGameId === 'speed_math' || internal.miniGameId === 'higher_lower') {
    const score1 = s1 || 0;
    const score2 = s2 || 0;
    if (score1 === score2) return { winnerId: null, isTie: true };
    return { winnerId: score1 > score2 ? f1 : f2, isTie: false };
  }

  if (internal.miniGameId === 'blind_pinpoint') {
    const bp = internal.blindPinpoint!;
    const p1 = bp.pins[f1];
    const p2 = bp.pins[f2];
    const patch = { revealedCity: bp.targetCity, pins: bp.pins };

    if (p1 && p2) {
      if (Math.abs(p1.km - p2.km) < 10) return { winnerId: null, isTie: true, gameStatePatch: patch };
      return { winnerId: p1.km < p2.km ? f1 : f2, isTie: false, gameStatePatch: patch };
    }
    if (p1 && !p2) return { winnerId: f1, isTie: false, gameStatePatch: patch };
    if (!p1 && p2) return { winnerId: f2, isTie: false, gameStatePatch: patch };
    return { winnerId: null, isTie: true, gameStatePatch: patch };
  }

  if (internal.miniGameId === 'quick_draw') {
    const qd = internal.quickDraw!;
    if (qd.fouls[f1]) return { winnerId: f2, isTie: false };
    if (qd.fouls[f2]) return { winnerId: f1, isTie: false };

    const r1 = qd.reactions[f1];
    const r2 = qd.reactions[f2];
    if (r1 !== undefined && r2 !== undefined) {
      if (Math.abs(r1 - r2) < 5) return { winnerId: null, isTie: true };
      return { winnerId: r1 < r2 ? f1 : f2, isTie: false };
    }
    if (r1 !== undefined && r2 === undefined) return { winnerId: f1, isTie: false };
    if (r1 === undefined && r2 !== undefined) return { winnerId: f2, isTie: false };
    return { winnerId: null, isTie: true };
  }

  return { winnerId: null, isTie: true };
}
