/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: Authoritative Synchronized 3-2-1 Countdown
 */

import React, { useState, useEffect } from 'react';

interface Props {
  gameStartsAt: number;
  serverTimeOffset: number;
  miniGameName: string;
}

export const SynchronizedCountdown: React.FC<Props> = ({
  gameStartsAt,
  serverTimeOffset,
  miniGameName,
}) => {
  const [displayText, setDisplayText] = useState<string>('3');

  useEffect(() => {
    let animFrame: number;

    const update = () => {
      const serverNow = Date.now() + serverTimeOffset;
      const msUntilStart = gameStartsAt - serverNow;

      if (msUntilStart > 2200) {
        setDisplayText('3');
      } else if (msUntilStart > 1200) {
        setDisplayText('2');
      } else if (msUntilStart > 200) {
        setDisplayText('1');
      } else {
        setDisplayText('BRAWL!');
      }

      animFrame = requestAnimationFrame(update);
    };

    animFrame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animFrame);
  }, [gameStartsAt, serverTimeOffset]);

  const isBrawl = displayText === 'BRAWL!';

  return (
    <div className="flex-1 flex flex-col items-center justify-center space-y-4 p-4 my-auto">
      <span className="text-xs font-mono text-cyan-400 uppercase tracking-widest animate-pulse">
        FIGHTERS READY
      </span>
      <div
        key={displayText}
        className={`font-black font-display text-transparent bg-clip-text transition-transform ${
          isBrawl
            ? 'text-8xl sm:text-9xl bg-gradient-to-r from-cyan-400 via-amber-400 to-rose-400 scale-110 animate-pulse'
            : 'text-9xl sm:text-[12rem] bg-gradient-to-b from-white to-slate-400 scale-100'
        }`}
      >
        {displayText}
      </div>
      <p className="text-base font-display font-bold text-slate-300">
        {miniGameName}
      </p>
    </div>
  );
};
