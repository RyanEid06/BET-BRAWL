import React from 'react';
import { createRoot } from 'react-dom/client';
import { BlindPinpointGame } from '../../src/components/games/BlindPinpointGame';
import '../../src/index.css';

const root = createRoot(document.getElementById('root')!);
const players: any[] = [
  { id: 'a', name: 'Alexandra', avatar: '🦊', color: '#06b6d4' },
  { id: 'b', name: 'Benjamin', avatar: '🐻', color: '#f59e0b' },
];
const api: any = { actions: [], spectator: false, locked: false };
function Harness() {
  const [revision, setRevision] = React.useState(0);
  api.refresh = () => setRevision((value: number) => value + 1);
  void revision;
  return <div style={{ padding: 8 }}>
    <BlindPinpointGame
      fighterA={players[0]} fighterB={players[1]}
      isPlayerFighter={!api.spectator} playerFighterSlot={api.spectator ? 'spectator' : 'A'}
      fighterScores={{ a: 0, b: 0 }}
      gameState={api.locked ? { pins: { a: { normX: 0.5, normY: 0.5, km: 0 } } } : { pins: {} }}
      gameConfig={{ targetCity: { city: 'Tokyo', country: 'Japan' } }}
      onSendAction={(action) => api.actions.push(action)}
    />
  </div>;
}
(window as any).__pinpoint = api;
root.render(<Harness />);
