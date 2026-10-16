/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: Mini-Game Catalog & Data Definitions
 */

import type { MiniGameMeta, MiniGameId } from './types.ts';

export const MINI_GAMES: Record<MiniGameId, MiniGameMeta> = {
  millisecond_stop: {
    id: 'millisecond_stop',
    name: 'Millisecond Stop',
    tagline: 'Internal Clock Showdown',
    durationSeconds: 10,
    description: 'The timer counts toward 05.000s. At 03.000s, the display blinds out! Tap as close to 05.000s as you can.',
    rules: [
      'Watch the live counter until 03.000s',
      'At 03.000s the clock blinds out into ??.???',
      'Hit SLAM as close to 05.000s as possible',
      'Smallest delta from 5.000s wins the Brawl'
    ],
  },
  rapid_red_green: {
    id: 'rapid_red_green',
    name: 'Rapid Red Light, Green Light',
    tagline: 'Fingers of Fury',
    durationSeconds: 15,
    description: 'Screens flip between Green and Red unpredictably. Tap on Green for distance (+1); tapping Red penalizes (-3). First to 50 or highest score wins.',
    rules: [
      'Mash TAP rapidly while the screen is GREEN (+1 point)',
      'FREEZE immediately on RED light',
      'Tapping on RED deducts 3 points!',
      'First fighter to 50 points or leader at time-up wins'
    ],
  },
  speed_math: {
    id: 'speed_math',
    name: 'Speed Math',
    tagline: 'Mental Sprint',
    durationSeconds: 15,
    description: 'A rapid 3-question arithmetic race. Fastest fighter to lock 3 correct answers wins the pot.',
    rules: [
      'Solve 3 mental math problems back to back',
      'Four answer choices per question',
      'Mistakes incur a 1.5s freeze penalty',
      'First fighter to 3 correct answers takes the crown'
    ],
  },
  higher_lower: {
    id: 'higher_lower',
    name: 'Higher or Lower',
    tagline: 'Stat Showdown',
    durationSeconds: 18,
    description: 'Compare crazy real-world stats. Is the second item higher or lower than the first? First to 3 correct wins.',
    rules: [
      'Read the baseline statistic on the card',
      'Guess whether the challenger item is HIGHER or LOWER',
      'First fighter to lock 3 correct predictions wins'
    ],
  },
  blind_pinpoint: {
    id: 'blind_pinpoint',
    name: 'Blind Pinpoint',
    tagline: 'Geoguess-Lite',
    durationSeconds: 15,
    description: 'A country silhouette appears with a target city name. Tap where you think the city sits. Closest in km wins.',
    rules: [
      'Inspect the target country silhouette',
      'Pinpoint the secret city location with your finger',
      'Distance error is measured in kilometers',
      'Closest pin wins the round'
    ],
  },
  coin_flip_double: {
    id: 'coin_flip_double',
    name: 'Coin Flip Double-Down',
    tagline: 'Bluff & Risk',
    durationSeconds: 12,
    description: 'Heads or Tails flip with a 5-second bluff window. Press Double Risk to double the pot stakes!',
    rules: [
      'Pick Heads or Tails before the toss',
      'Hit "DOUBLE RISK" during the 5s bluff phase to double the match pot',
      'Watch the 3D coin spin and land',
      'Correct prediction claims the doubled bounty'
    ],
  },
};

export const SPEED_MATH_SETS = [
  [
    { q: '18 + 27', choices: [45, 43, 47, 55], correct: 45 },
    { q: '12 × 4', choices: [48, 44, 46, 52], correct: 48 },
    { q: '91 − 34', choices: [57, 53, 67, 59], correct: 57 },
  ],
  [
    { q: '36 + 49', choices: [85, 83, 75, 95], correct: 85 },
    { q: '15 × 3', choices: [45, 35, 55, 40], correct: 45 },
    { q: '84 − 29', choices: [55, 53, 65, 45], correct: 55 },
  ],
  [
    { q: '24 + 38', choices: [62, 52, 64, 58], correct: 62 },
    { q: '14 × 4', choices: [56, 46, 54, 60], correct: 56 },
    { q: '100 − 47', choices: [53, 57, 43, 63], correct: 53 },
  ],
];

export const HIGHER_LOWER_QUESTIONS = [
  {
    baseItem: 'France Population',
    baseStat: '68 Million',
    challengerItem: 'United Kingdom Population',
    actualHigher: false, // UK ~ 67 Million (Lower)
    revealStat: '67.7 Million (Lower)',
  },
  {
    baseItem: 'Eiffel Tower Height',
    baseStat: '330 Meters',
    challengerItem: 'Empire State Building Height',
    actualHigher: true, // Empire State ~ 381 Meters (Higher)
    revealStat: '381 Meters (Higher)',
  },
  {
    baseItem: 'Despacito YouTube Views',
    baseStat: '8.4 Billion Views',
    challengerItem: 'Baby Shark YouTube Views',
    actualHigher: true, // Baby Shark ~ 14.8 Billion (Higher)
    revealStat: '14.8 Billion Views (Higher)',
  },
  {
    baseItem: 'Speed of Sound',
    baseStat: '1,235 km/h',
    challengerItem: 'Cruising Speed of Boeing 747',
    actualHigher: false, // 747 ~ 920 km/h (Lower)
    revealStat: '920 km/h (Lower)',
  },
  {
    baseItem: 'Average Earth Distance to Moon',
    baseStat: '384,400 km',
    challengerItem: 'Earth Equatorial Circumference',
    actualHigher: false, // Earth circumference ~ 40,075 km (Lower)
    revealStat: '40,075 km (Lower)',
  },
];

export const BLIND_PINPOINT_CHALLENGES = [
  {
    country: 'France',
    city: 'Paris',
    targetNormX: 0.52,
    targetNormY: 0.32,
    mapWidthKm: 950,
  },
  {
    country: 'United States',
    city: 'Los Angeles',
    targetNormX: 0.15,
    targetNormY: 0.58,
    mapWidthKm: 4500,
  },
  {
    country: 'Japan',
    city: 'Tokyo',
    targetNormX: 0.68,
    targetNormY: 0.62,
    mapWidthKm: 2800,
  },
  {
    country: 'Australia',
    city: 'Sydney',
    targetNormX: 0.85,
    targetNormY: 0.75,
    mapWidthKm: 3900,
  },
];
