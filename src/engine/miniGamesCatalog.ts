/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: Mini-Game Catalog & Authoritative Data
 */

import type { MiniGameMeta, MiniGameId } from './types.ts';

export const MINI_GAMES: Record<MiniGameId, MiniGameMeta> = {
  millisecond_stop: {
    id: 'millisecond_stop',
    name: 'Millisecond Stop',
    tagline: 'Internal Clock Showdown',
    durationSeconds: 9,
    description: 'The timer counts toward 05.000s. At 03.000s the display blinds out into ??.??? Tap as close to 05.000s as you can.',
    rules: [
      'Watch the live counter until 03.000s',
      'At 03.000s the clock blinds out into ??.???',
      'Tap SLAM as close to 05.000s as possible',
      'Closest tap to 5.000s wins the Brawl'
    ],
  },
  rapid_red_green: {
    id: 'rapid_red_green',
    name: 'Rapid Red Light, Green Light',
    tagline: 'Reflex Sprint',
    durationSeconds: 15,
    description: 'Screens flip between Green and Red unpredictably. Mash on Green (+1), freeze on Red (-3). First to 40 or leader at 15s wins.',
    rules: [
      'Tap rapidly while GREEN (+1 point)',
      'FREEZE immediately when RED appears',
      'Tapping on RED deducts 3 points!',
      'First to 40 points or leader at time-up wins'
    ],
  },
  speed_math: {
    id: 'speed_math',
    name: 'Speed Math',
    tagline: 'Mental Sprint',
    durationSeconds: 16,
    description: 'A rapid 3-question arithmetic race. Fastest fighter to lock 3 correct answers wins.',
    rules: [
      'Solve 3 mental math problems back to back',
      'Pick from 4 answer choices',
      'Mistakes cause a 1.5s freeze penalty',
      'First fighter to 3 correct answers wins'
    ],
  },
  higher_lower: {
    id: 'higher_lower',
    name: 'Higher or Lower',
    tagline: 'Stat Showdown',
    durationSeconds: 18,
    description: 'Compare stable real-world stats. Is the second item higher or lower than the first? First to 3 correct wins.',
    rules: [
      'Read the baseline statistic on the card',
      'Guess whether the challenger is HIGHER or LOWER',
      'First fighter to 3 correct locks wins'
    ],
  },
  blind_pinpoint: {
    id: 'blind_pinpoint',
    name: 'Blind Pinpoint',
    tagline: 'Geoguess-Lite',
    durationSeconds: 15,
    description: 'A target city is displayed on an equirectangular world map. Tap where you think it is located. Closest distance in km wins.',
    rules: [
      'Read the target world city and country',
      'Tap your pin on the world map',
      'Distance error is calculated with the Haversine formula in genuine km',
      'Smallest distance error wins'
    ],
  },
  quick_draw: {
    id: 'quick_draw',
    name: 'Quick Draw',
    tagline: 'Fastest Finger',
    durationSeconds: 10,
    description: 'Watch the screen closely. When "GO!" flashes, tap instantly! Tapping before "GO!" is an instant false-start disqualification.',
    rules: [
      'Wait on high alert during the "WAIT..." phase',
      'DO NOT tap early (instant false-start foul!)',
      'When "DRAW!" flashes, tap as fast as humanly possible',
      'Fastest valid reaction time wins'
    ],
  },
};

// -------------------------------------------------------------
// SPEED MATH RANDOM GENERATOR
// -------------------------------------------------------------

export interface MathQuestion {
  q: string;
  choices: number[];
  correct: number;
}

export function generateMathQuestions(count = 3): MathQuestion[] {
  const questions: MathQuestion[] = [];
  const operators = ['+', '-', '×'];

  for (let i = 0; i < count; i++) {
    const op = operators[Math.floor(Math.random() * operators.length)];
    let a = 0;
    let b = 0;
    let correct = 0;

    if (op === '+') {
      a = Math.floor(15 + Math.random() * 45);
      b = Math.floor(15 + Math.random() * 45);
      correct = a + b;
    } else if (op === '-') {
      a = Math.floor(40 + Math.random() * 55);
      b = Math.floor(12 + Math.random() * 35);
      correct = a - b;
    } else {
      a = Math.floor(6 + Math.random() * 10);
      b = Math.floor(4 + Math.random() * 9);
      correct = a * b;
    }

    const wrongDeltas = [-10, -2, 2, 10, -1, 1, -3, 3];
    const shuffled = wrongDeltas.sort(() => Math.random() - 0.5);
    const choicesSet = new Set<number>([correct]);

    for (const delta of shuffled) {
      if (choicesSet.size >= 4) break;
      const wrong = correct + delta;
      if (wrong > 0 && wrong !== correct) {
        choicesSet.add(wrong);
      }
    }

    // Ensure 4 choices
    while (choicesSet.size < 4) {
      choicesSet.add(correct + Math.floor((Math.random() - 0.5) * 20));
    }

    const choices = Array.from(choicesSet).sort(() => Math.random() - 0.5);
    questions.push({ q: `${a} ${op} ${b}`, choices, correct });
  }

  return questions;
}

// -------------------------------------------------------------
// STABLE HIGHER OR LOWER TRIVIA BANK
// -------------------------------------------------------------

export interface HigherLowerTrivia {
  baseItem: string;
  baseStat: string;
  baseValue: number;
  challengerItem: string;
  challengerStat: string;
  challengerValue: number;
  isHigher: boolean;
}

export const STABLE_HIGHER_LOWER_BANK: HigherLowerTrivia[] = [
  {
    baseItem: 'France Population',
    baseStat: '68 Million',
    baseValue: 68,
    challengerItem: 'United Kingdom Population',
    challengerStat: '67.7 Million',
    challengerValue: 67.7,
    isHigher: false,
  },
  {
    baseItem: 'Eiffel Tower Height',
    baseStat: '330 Meters',
    baseValue: 330,
    challengerItem: 'Empire State Building Height',
    challengerStat: '381 Meters',
    challengerValue: 381,
    isHigher: true,
  },
  {
    baseItem: 'Speed of Sound in Air',
    baseStat: '1,235 km/h',
    baseValue: 1235,
    challengerItem: 'Cruising Speed of Boeing 747',
    challengerStat: '920 km/h',
    challengerValue: 920,
    isHigher: false,
  },
  {
    baseItem: 'Mount Everest Elevation',
    baseStat: '8,849 Meters',
    baseValue: 8849,
    challengerItem: 'Mount Kilimanjaro Elevation',
    challengerStat: '5,895 Meters',
    challengerValue: 5895,
    isHigher: false,
  },
  {
    baseItem: 'Tokyo Population (Metro)',
    baseStat: '37 Million',
    baseValue: 37,
    challengerItem: 'New York City Population (Metro)',
    challengerStat: '19.5 Million',
    challengerValue: 19.5,
    isHigher: false,
  },
  {
    baseItem: 'Apollo 11 Moon Landing',
    baseStat: 'Year 1969',
    baseValue: 1969,
    challengerItem: 'First Commercial Jet Flight',
    challengerStat: 'Year 1952',
    challengerValue: 1952,
    isHigher: false,
  },
  {
    baseItem: 'Great Pyramid of Giza Height',
    baseStat: '139 Meters',
    baseValue: 139,
    challengerItem: 'Statue of Liberty Total Height',
    challengerStat: '93 Meters',
    challengerValue: 93,
    isHigher: false,
  },
  {
    baseItem: 'Amazon River Length',
    baseStat: '6,400 km',
    baseValue: 6400,
    challengerItem: 'Nile River Length',
    challengerStat: '6,650 km',
    challengerValue: 6650,
    isHigher: true,
  },
];

// -------------------------------------------------------------
// GENUINE BLIND PINPOINT (HAVERSINE KM FORMULA)
// -------------------------------------------------------------

export interface CityLocation {
  city: string;
  country: string;
  lat: number;   // -90 to 90
  lon: number;   // -180 to 180
}

export const WORLD_CITIES: CityLocation[] = [
  { city: 'Paris', country: 'France', lat: 48.8566, lon: 2.3522 },
  { city: 'Tokyo', country: 'Japan', lat: 35.6762, lon: 139.6503 },
  { city: 'New York', country: 'United States', lat: 40.7128, lon: -74.0060 },
  { city: 'Cairo', country: 'Egypt', lat: 30.0444, lon: 31.2357 },
  { city: 'Sydney', country: 'Australia', lat: -33.8688, lon: 151.2093 },
  { city: 'Rio de Janeiro', country: 'Brazil', lat: -22.9068, lon: -43.1729 },
  { city: 'London', country: 'United Kingdom', lat: 51.5074, lon: -0.1278 },
  { city: 'Cape Town', country: 'South Africa', lat: -33.9249, lon: 18.4241 },
];

/**
 * Calculates genuine great-circle distance between two coordinates in kilometers.
 */
export function calculateHaversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's mean radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Converts normalized 0..1 map coordinates (equirectangular projection)
 * to latitude and longitude.
 */
export function normCoordsToLatLon(normX: number, normY: number): { lat: number; lon: number } {
  const lon = normX * 360 - 180;
  const lat = 90 - normY * 180;
  return { lat, lon };
}

/**
 * Converts latitude and longitude to normalized 0..1 map coordinates.
 */
export function latLonToNormCoords(lat: number, lon: number): { normX: number; normY: number } {
  const normX = (lon + 180) / 360;
  const normY = (90 - lat) / 180;
  return { normX, normY };
}
