import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { PublicPlayer } from '../../engine/types.ts';
import type { V2Action, V2GameId } from '../../engine/v2Games.ts';

export interface V2GameViewProps {
  gameId: V2GameId;
  gameConfig: Record<string, unknown>;
  gameState: Record<string, unknown>;
  fighterA: PublicPlayer;
  fighterB: PublicPlayer;
  myPlayerId: string | null;
  serverTimeOffset: number;
  onSendAction: (action: V2Action) => void;
}
type Data = Record<string, unknown>;
const record = (value: unknown): Data => value && typeof value === 'object' && !Array.isArray(value) ? value as Data : {};
const list = <T,>(value: unknown): T[] => Array.isArray(value) ? value : [];
const symbols = ['◆', '●', '▲', '★', '✚', '☾'];
const symbolName = (value: number | null) => value === null ? 'Blank' : `${String.fromCharCode(65 + value)} ${symbols[value]}`;
const titles: Record<V2GameId, string> = {
  memory_heist: 'Memory Heist', crowd_count: 'Crowd Count', mirror_trouble: 'Mirror Trouble',
  safecracker: 'Safecracker', circuit_sprint: 'Circuit Sprint', split_decision: 'Split Decision',
  treasure_tug: 'Treasure Tug', pocket_territory: 'Pocket Territory',
};
const rounds: Partial<Record<V2GameId, number>> = { crowd_count: 3, mirror_trouble: 5, split_decision: 5, treasure_tug: 3, pocket_territory: 6 };
const instructions: Record<V2GameId, string> = {
  memory_heist: 'Study six symbols for 4 seconds. Rebuild their positions; each correct symbol earns 1 point. Blanks earn no points.',
  crowd_count: 'Count the gold stars in each scene, then lock an estimate. Lowest total error across three heats wins.',
  mirror_trouble: 'Choose the shape that matches the target when rotated. A reflection does not count. Five puzzles, 1 point each.',
  safecracker: 'Crack a three-symbol code in five guesses. Symbols may repeat. Solving wins; fewer guesses breaks a solved tie. If neither solves, compare the best exact count, then misplaced count.',
  circuit_sprint: 'Rotate tiles clockwise to connect the source on the left to the sink on the right. Solving wins; fewer moves breaks a solved tie. If neither solves, most powered tiles wins.',
  split_decision: 'Attack costs 1 energy and deals 1 damage. Guard blocks attacks. Charge gains 1 energy, up to 3, even when hit. Knockout wins; simultaneous knockout ties. Otherwise, highest health, then energy wins.',
  treasure_tug: 'Split exactly 10 energy across three lanes. Higher energy captures the lane’s points; equal allocations earn nothing. Most points across three rounds wins.',
  pocket_territory: 'Claim an empty tile beside your territory. Both claims resolve together; a collision blocks the tile. Most territory value after six turns wins.',
};

function Notice({ children }: { children: ReactNode }) { return <p className="v2-notice">{children}</p>; }
function Shape({ cells, label }: { cells: number[]; label: string }) {
  return <svg viewBox="0 0 50 50" role="img" aria-label={label} className="v2-shape">
    {Array.from({ length: 25 }, (_, cell) => <rect key={cell} x={cell % 5 * 10 + 1} y={Math.floor(cell / 5) * 10 + 1} width="8" height="8" rx="1" fill={cells.includes(cell) ? 'currentColor' : '#253249'} />)}
  </svg>;
}
function SymbolBoard({ board, label }: { board: (number | null)[]; label: string }) {
  return <div className="v2-grid v2-grid-3" role="group" aria-label={label}>{board.map((value, cell) => <div className="v2-tile" key={cell} aria-label={`Row ${Math.floor(cell / 3) + 1}, column ${cell % 3 + 1}: ${symbolName(value)}`}><span>{symbolName(value)}</span></div>)}</div>;
}

interface GameProps extends V2GameViewProps { mine: Data; phase: string; active: boolean; send: (action: V2Action) => void }
function Memory({ gameConfig: config, mine, phase, active, send }: GameProps) {
  const authoritative = list<number | null>(mine.board);
  const [draft, setDraft] = useState<(number | null)[]>(() => authoritative.length === 9 ? [...authoritative] : Array(9).fill(null));
  const [selected, setSelected] = useState<number | null>(0);
  const [history, setHistory] = useState<(number | null)[][]>([]);
  const edited = useRef(false);
  const serverBoard = JSON.stringify(authoritative);
  useEffect(() => {
    if ((!edited.current || mine.locked) && authoritative.length === 9) setDraft([...authoritative]);
  }, [serverBoard, mine.locked]);
  if (phase === 'study') return <><Notice>Memorize this board. Reconstruction starts after the study phase.</Notice><SymbolBoard board={list(config.board)} label="Board to memorize" /></>;
  const disabled = !active || !!mine.locked;
  const update = (next: (number | null)[]) => {
    edited.current = true; setHistory(previous => [...previous, [...draft]]); setDraft(next);
    send({ type: 'MEMORY_DRAFT', board: next, lock: false });
  };
  return <>
    <Notice>{mine.locked ? 'Board locked by the server. Waiting for the result.' : active ? 'Select a symbol, then tap its tile. Select Clear tile to remove one. Unlocked drafts also count at timeout.' : 'Fighters are rebuilding the board privately.'}</Notice>
    {active || mine.locked ? <>
      <div className="v2-palette" role="group" aria-label="Symbol to place">{symbols.map((symbol, index) => <button type="button" key={symbol} disabled={disabled} aria-pressed={selected === index} onClick={() => setSelected(index)}>{String.fromCharCode(65 + index)} {symbol}</button>)}<button type="button" disabled={disabled} aria-pressed={selected === null} onClick={() => setSelected(null)}>Clear tile</button></div>
      <div className="v2-grid v2-grid-3" role="group" aria-label="Your reconstruction">{draft.map((value, cell) => <button type="button" className="v2-tile" key={cell} disabled={disabled} aria-label={`Row ${Math.floor(cell / 3) + 1}, column ${cell % 3 + 1}: ${symbolName(value)}. Place ${symbolName(selected)}`} onClick={() => update(draft.map((old, index) => index === cell ? selected : selected !== null && old === selected ? null : old))}>{symbolName(value)}</button>)}</div>
      <div className="v2-actions"><button type="button" disabled={disabled || !history.length} onClick={() => { const previous = history[history.length - 1]; edited.current = true; setDraft(previous); setHistory(history.slice(0, -1)); send({ type: 'MEMORY_DRAFT', board: previous, lock: false }); }}>Undo</button><button type="button" className="v2-primary" disabled={disabled} onClick={() => send({ type: 'MEMORY_DRAFT', board: draft, lock: true })}>Lock board</button></div>
      {!mine.locked && <p className="v2-muted">{JSON.stringify(draft) === serverBoard ? 'Current draft confirmed by the server.' : 'Local draft — waiting for server confirmation.'}</p>}
    </> : <div className="v2-watch">Six symbols. Nine tiles. Every position matters.</div>}
  </>;
}

function Count({ gameConfig: config, mine, phase, active, send }: GameProps) {
  const [guess, setGuess] = useState(18);
  const locked = !!mine.locked;
  return <>
    <Notice>{phase === 'view' ? 'Count only the gold stars ★. The scene disappears before you answer.' : phase === 'answer' ? locked ? `Server locked your estimate: ${mine.commit}.` : 'How many gold stars did you see?' : 'Estimates are being revealed.'}</Notice>
    {phase === 'view' ? <div className="v2-scene" role="img" aria-label="Counting scene: count gold stars, ignore gray circles">{list<{ target: boolean; x: number; y: number; rotation: number }>(config.objects).map((object, index) => <span key={index} aria-hidden="true" className={object.target ? 'v2-object v2-target' : 'v2-object'} style={{ left: `${object.x * 100}%`, top: `${object.y * 100}%`, transform: `translate(-50%, -50%) rotate(${object.rotation}deg)` }}>{object.target ? '★' : '●'}</span>)}</div> : phase === 'answer' && active ? <>
      <label className="v2-estimate">Your estimate <output>{locked ? String(mine.commit) : guess}</output><input aria-label="Gold star estimate" type="range" min="0" max="36" step="1" value={locked ? Number(mine.commit) : guess} disabled={locked} onChange={event => setGuess(Number(event.target.value))} /></label>
      <div className="v2-actions"><button type="button" aria-label="Decrease estimate" disabled={locked || guess === 0} onClick={() => setGuess(guess - 1)}>− 1</button><button type="button" aria-label="Increase estimate" disabled={locked || guess === 36} onClick={() => setGuess(guess + 1)}>+ 1</button></div>
      <button type="button" className="v2-primary" disabled={locked} onClick={() => send({ type: 'COUNT_GUESS', value: guess })}>Lock estimate</button>
    </> : <div className="v2-watch">{phase === 'answer' ? 'Fighters are locking their estimates.' : 'The next scene follows the reveal.'}</div>}
  </>;
}

function Mirror({ gameConfig: config, mine, active, send }: GameProps) {
  return <>
    <Notice>{mine.locked ? `Server locked choice ${Number(mine.commit) + 1}.` : 'Find the rotated match. Mirrored shapes are different.'}</Notice>
    <div className="v2-reference"><span>Target</span><Shape cells={list(config.target)} label="Target shape" /></div>
    <div className="v2-choices">{list<number[]>(config.choices).map((choice, index) => <button type="button" key={index} disabled={!active || !!mine.locked} aria-pressed={mine.commit === index} onClick={() => send({ type: 'MIRROR_PICK', choice: index })}><Shape cells={choice} label={`Choice ${index + 1}`} /><span>Choice {index + 1}{mine.locked && mine.commit === index ? ' · Locked' : ''}</span></button>)}</div>
    {!active && <Notice>Watch the target and choices. Fighters choose privately.</Notice>}
  </>;
}

function Safecracker({ mine, active, send }: GameProps) {
  const [code, setCode] = useState([0, 0, 0]);
  const [pendingHistory, setPendingHistory] = useState<number | null>(null);
  const history = list<{ symbols: number[]; exact: number; misplaced: number }>(mine.history);
  const awaitingClue = pendingHistory === history.length;
  const disabled = !active || !!mine.solved || history.length >= 5;
  return <>
    <Notice>{mine.solved ? 'Code cracked! Your board is complete.' : history.length >= 5 ? 'Five guesses used. Waiting for the result.' : 'Exact = correct symbol and position. Misplaced = correct symbol in another position. Repeats are allowed.'}</Notice>
    {active || history.length ? <>
      <div className="v2-code">{code.map((value, index) => <label key={index}>Slot {index + 1}<select value={value} disabled={disabled || awaitingClue} onChange={event => setCode(code.map((old, at) => at === index ? Number(event.target.value) : old))}>{symbols.slice(0, 5).map((symbol, symbolIndex) => <option key={symbol} value={symbolIndex}>{symbolName(symbolIndex)}</option>)}</select></label>)}</div>
      <button type="button" className="v2-primary" disabled={disabled || awaitingClue} onClick={() => { setPendingHistory(history.length); send({ type: 'CODE_GUESS', symbols: code }); }}>{awaitingClue ? 'Waiting for server clue…' : `Submit guess ${Math.min(history.length + 1, 5)} / 5`}</button>
      {awaitingClue && !disabled && <><p className="v2-muted">Wait for your clue before guessing again. Another accepted submission uses an attempt.</p><button type="button" onClick={() => setPendingHistory(null)}>Edit or retry guess</button></>}
      <ol className="v2-history" aria-label="Your server-confirmed guesses">{history.map((attempt, index) => <li key={index}><strong>{attempt.symbols.map(symbolName).join(' · ')}</strong><span>{attempt.exact} exact · {attempt.misplaced} misplaced</span></li>)}</ol>
      {!history.length && <p className="v2-muted">Your confirmed guesses and clues will appear here.</p>}
    </> : <div className="v2-watch">Each fighter has five private guesses. The code is revealed when the game ends.</div>}
  </>;
}

function Pipe({ kind, rotation }: { kind: string; rotation: number }) {
  return <svg className="v2-pipe" viewBox="0 0 50 50" aria-hidden="true"><g transform={`rotate(${rotation * 90} 25 25)`}><path d={kind === 'straight' ? 'M25 0V50' : 'M25 0V25H50'} stroke="currentColor" strokeWidth="9" fill="none" /><circle cx="25" cy="25" r="5" fill="currentColor" /></g></svg>;
}
function Circuit({ gameConfig: config, mine, active, send }: GameProps) {
  const rotations = list<number>(mine.rotations).length ? list<number>(mine.rotations) : list<number>(config.initialRotations);
  const powered = list<number>(mine.powered);
  const kinds = list<string>(config.pipeKinds);
  return <>
    <Notice>{mine.solved ? 'Connected! Your server-confirmed board is locked.' : active ? 'Tap a tile to rotate it 90° clockwise. Every rotation counts, including undoing a turn.' : 'Both fighters have the same puzzle. Their moves remain private until the result.'}</Notice>
    <p className="v2-metrics">{active ? `Moves: ${Number(mine.moves ?? 0)} · Powered tiles: ${powered.length} / 16` : 'Preview of the starting circuit'}</p>
    <div className="v2-grid v2-grid-4" role="group" aria-label={active ? 'Your circuit' : 'Starting circuit'}>{kinds.map((kind, cell) => <button type="button" className={`v2-tile ${powered.includes(cell) ? 'v2-powered' : ''}`} key={cell} disabled={!active || !!mine.solved} onClick={() => send({ type: 'PIPE_ROTATE', cell })} aria-label={`Row ${Math.floor(cell / 4) + 1}, column ${cell % 4 + 1}, ${kind}, rotation ${rotations[cell] * 90} degrees${powered.includes(cell) ? ', powered' : ', unpowered'}${cell === 4 ? ', source enters from left' : cell === 11 ? ', sink exits right' : ''}`}><Pipe kind={kind} rotation={rotations[cell]} />{cell === 4 && <span className="v2-port">IN →</span>}{cell === 11 && <span className="v2-port">OUT →</span>}{powered.includes(cell) && <span className="v2-power-mark">●</span>}</button>)}</div>
    <p className="v2-muted">Source: row 2, left edge → Sink: row 3, right edge. Connected tiles show a dot. Dangling branches are allowed.</p>
  </>;
}

function Duel({ gameState: state, fighterA, fighterB, myPlayerId, mine, active, send }: GameProps) {
  const players = record(state.players);
  const energy = Number(record(myPlayerId ? players[myPlayerId] : null).energy ?? 0);
  return <>
    <div className="v2-player-pair">{[fighterA, fighterB].map((fighter, index) => { const player = record(players[fighter.id]); return <div key={fighter.id}><strong>{index === 0 ? 'A' : 'B'} · {fighter.avatar} {fighter.name}</strong><span>Health {Number(player.hp ?? 3)} / 3</span><span>Energy {Number(player.energy ?? 1)} / 3</span></div>; })}</div>
    <Notice>{mine.locked ? `Server locked: ${String(mine.commit)}.` : active ? 'Choose once. Both moves reveal together.' : 'Both fighters choose in secret. Their health and energy are public.'}</Notice>
    <div className="v2-duel">{(['ATTACK', 'GUARD', 'CHARGE'] as const).map(choice => <button type="button" key={choice} disabled={!active || !!mine.locked || choice === 'ATTACK' && energy === 0} aria-pressed={mine.commit === choice} onClick={() => send({ type: 'DUEL_COMMIT', choice })}><strong>{choice}</strong><span>{choice === 'ATTACK' ? energy === 0 && active ? 'Needs 1 energy' : '−1 energy · 1 damage' : choice === 'GUARD' ? 'Block attacks' : '+1 energy · cap 3'}</span></button>)}</div>
    <p className="v2-muted">No choice defaults to Guard. Charging does not block damage; simultaneous attacks both hit.</p>
  </>;
}

function Treasure({ mine, active, send }: GameProps) {
  const [allocation, setAllocation] = useState([0, 0, 0]);
  const committed = list<number>(mine.commit);
  const shown = mine.locked && committed.length === 3 ? committed : allocation;
  const remaining = 10 - shown.reduce((sum, value) => sum + value, 0);
  return <>
    <Notice>{mine.locked ? 'Allocation locked by the server. Waiting for the reveal.' : active ? `Energy remaining: ${remaining} / 10. Assign all 10 before locking.` : 'Fighters secretly distribute 10 energy across three lanes.'}</Notice>
    <div className="v2-lanes">{shown.map((value, lane) => <div key={lane}><strong>Lane {lane + 1}</strong><span>{lane + 1} {lane === 0 ? 'point' : 'points'}</span><output aria-label={`Lane ${lane + 1} energy`}>{value}</output><div className="v2-actions"><button type="button" aria-label={`Remove one energy from lane ${lane + 1}`} disabled={!active || !!mine.locked || value === 0} onClick={() => setAllocation(shown.map((old, index) => index === lane ? old - 1 : old))}>−</button><button type="button" aria-label={`Add one energy to lane ${lane + 1}`} disabled={!active || !!mine.locked || remaining === 0} onClick={() => setAllocation(shown.map((old, index) => index === lane ? old + 1 : old))}>+</button></div></div>)}</div>
    {active && <button type="button" className="v2-primary" disabled={!!mine.locked || remaining !== 0} onClick={() => send({ type: 'TREASURE_COMMIT', allocation })}>Lock allocation {10 - remaining} / 10</button>}
    <p className="v2-muted">Equal energy ties a lane: nobody earns its points. Each round starts with fresh energy.</p>
  </>;
}

function Territory({ gameConfig: config, gameState: state, fighterA, fighterB, mine, active, send }: GameProps) {
  const board = list<string | null>(state.board);
  const weights = list<number>(config.weights);
  const legal = list<number>(mine.legalCells);
  return <>
    <Notice>{mine.locked ? mine.commit === null ? 'Server locked your Pass.' : `Server locked tile ${Number(mine.commit) + 1}.` : active ? legal.length ? 'Tap a tile marked + to lock your claim, or Pass.' : 'No legal tiles remain. Pass or wait for the next reveal.' : 'Watch both territories grow. Secret pending claims stay hidden.'}</Notice>
    <p className="v2-muted">A: {fighterA.name} · B: {fighterB.name} · ×: blocked · +: legal claim. Each tile shows its value.</p>
    <div className="v2-grid v2-grid-5" role="group" aria-label="Territory board">{board.map((owner, cell) => { const marker = owner === fighterA.id ? 'A' : owner === fighterB.id ? 'B' : owner === 'blocked' ? '×' : active && legal.includes(cell) ? '+' : '·'; return <button type="button" key={cell} className={`v2-territory ${owner === fighterA.id ? 'v2-owner-a' : owner === fighterB.id ? 'v2-owner-b' : ''}`} disabled={!active || !!mine.locked || !legal.includes(cell)} onClick={() => send({ type: 'TERRITORY_COMMIT', cell })} aria-label={`Tile ${cell + 1}, row ${Math.floor(cell / 5) + 1}, column ${cell % 5 + 1}, value ${weights[cell]}, ${owner === fighterA.id ? fighterA.name : owner === fighterB.id ? fighterB.name : owner === 'blocked' ? 'permanently blocked' : legal.includes(cell) && active ? 'available to claim' : 'empty'}`}><strong>{marker}</strong><span>{weights[cell]}</span></button>; })}</div>
    {active && <button type="button" disabled={!!mine.locked} onClick={() => send({ type: 'TERRITORY_COMMIT', cell: null })}>Pass this turn</button>}
    <p className="v2-muted">Claims must share an edge with your territory. If both fighters claim the same tile, it becomes permanently blocked.</p>
  </>;
}

function Outcome({ gameId, outcome, fighterA, fighterB }: { gameId: V2GameId; outcome: Data; fighterA: PublicPlayer; fighterB: PublicPlayer }) {
  if (!Object.keys(outcome).length) return null;
  const index = Number(outcome.stageIndex ?? 0) + 1;
  return <section className="v2-outcome" aria-label={`Round ${index} revealed result`}><h4>Round {index} revealed</h4>
    {gameId === 'crowd_count' && <p>Gold stars: <strong>{Number(outcome.count)}</strong></p>}
    {gameId === 'mirror_trouble' && <p>Correct choice: <strong>{Number(outcome.correct) + 1}</strong></p>}
    {[fighterA, fighterB].map((fighter, slot) => {
      let detail = '';
      if (gameId === 'crowd_count') { const guess = record(outcome.guesses)[fighter.id]; detail = guess === null ? 'No estimate · 37 error' : `Estimate: ${String(guess)}`; }
      if (gameId === 'mirror_trouble') { const choice = record(outcome.choices)[fighter.id]; detail = choice === null ? 'No answer' : `Choice ${Number(choice) + 1}${choice === outcome.correct ? ' · Correct' : ' · Incorrect'}`; }
      if (gameId === 'split_decision') { const player = record(record(outcome.players)[fighter.id]); detail = `${String(record(outcome.choices)[fighter.id])} · Health ${player.hp} · Energy ${player.energy}`; }
      if (gameId === 'treasure_tug') detail = `Energy ${list<number>(record(outcome.allocations)[fighter.id]).join(' / ')} · +${record(outcome.points)[fighter.id]} points`;
      if (gameId === 'pocket_territory') { const cell = record(outcome.cells)[fighter.id]; detail = cell === null ? 'Passed' : `Claimed tile ${Number(cell) + 1}${record(outcome.cells)[fighterA.id] === record(outcome.cells)[fighterB.id] ? ' · Collision: blocked' : ''}`; }
      return <p key={fighter.id}><strong>{slot === 0 ? 'A' : 'B'} · {fighter.name}:</strong> {detail}</p>;
    })}
  </section>;
}

function Finished({ gameId, gameConfig, gameState, fighterA, fighterB }: V2GameViewProps) {
  const recap = record(gameState.recap);
  const players = record(recap.players);
  const winner = gameState.winnerId === fighterA.id ? fighterA : gameState.winnerId === fighterB.id ? fighterB : null;
  return <>
    <div className="v2-result" role="status"><h4>{winner ? `${winner.name} wins` : 'Draw'}</h4><p>Final result confirmed by the server.</p></div>
    {gameId === 'memory_heist' && <><h4>Original board</h4><SymbolBoard board={list(gameConfig.board)} label="Original memory board" />{[fighterA, fighterB].map(fighter => <div className="v2-recap" key={fighter.id}><h4>{fighter.name}’s reconstruction</h4><SymbolBoard board={list(record(players[fighter.id]).board)} label={`${fighter.name}'s final board`} /></div>)}</>}
    {gameId === 'safecracker' && <><Notice>Secret code: {list<number>(recap.secret).map(symbolName).join(' · ')}</Notice>{[fighterA, fighterB].map(fighter => { const player = record(players[fighter.id]); return <div key={fighter.id} className="v2-recap"><h4>{fighter.name} · {player.solved ? 'Solved' : 'Unsolved'}</h4><ol className="v2-history">{list<{ symbols: number[]; exact: number; misplaced: number }>(player.history).map((attempt, index) => <li key={index}><strong>{attempt.symbols.map(symbolName).join(' · ')}</strong><span>{attempt.exact} exact · {attempt.misplaced} misplaced</span></li>)}</ol>{!list(player.history).length && <p>No guesses</p>}</div>; })}</>}
    {gameId === 'circuit_sprint' && [fighterA, fighterB].map(fighter => { const player = record(players[fighter.id]); return <div className="v2-recap" key={fighter.id}><h4>{fighter.name} · {player.solved ? 'Connected' : 'Unsolved'}</h4><p>{Number(player.moves ?? 0)} moves · {list(player.powered).length} powered tiles</p><div className="v2-grid v2-grid-4" aria-label={`${fighter.name}'s final circuit`}>{list<string>(recap.pipeKinds).map((kind, cell) => <div key={cell} className={`v2-tile ${list<number>(player.powered).includes(cell) ? 'v2-powered' : ''}`}><Pipe kind={kind} rotation={list<number>(player.rotations)[cell]} /><span className="v2-port">{cell + 1}{list<number>(player.powered).includes(cell) ? ' ●' : ''}</span></div>)}</div></div>; })}
    {gameId === 'pocket_territory' && <Territory {...{ gameId, gameConfig, gameState, fighterA, fighterB, myPlayerId: null, serverTimeOffset: 0, onSendAction: () => {}, mine: {}, phase: 'finished', active: false, send: () => {} }} />}
    {gameId === 'split_decision' && <div className="v2-player-pair">{[fighterA, fighterB].map(fighter => { const player = record(players[fighter.id]); return <div key={fighter.id}><strong>{fighter.name}</strong><span>Health {Number(player.hp ?? 0)} · Energy {Number(player.energy ?? 0)}</span></div>; })}</div>}
    {list<Data>(recap.outcomes).map((outcome, index) => <Outcome key={index} gameId={gameId} outcome={outcome} fighterA={fighterA} fighterB={fighterB} />)}
  </>;
}

function ActiveGame(props: GameProps) {
  switch (props.gameId) {
    case 'memory_heist': return <Memory {...props} />;
    case 'crowd_count': return <Count {...props} />;
    case 'mirror_trouble': return <Mirror {...props} />;
    case 'safecracker': return <Safecracker {...props} />;
    case 'circuit_sprint': return <Circuit {...props} />;
    case 'split_decision': return <Duel {...props} />;
    case 'treasure_tug': return <Treasure {...props} />;
    case 'pocket_territory': return <Territory {...props} />;
  }
}

/** The caller keys this component by match ID. Only server projections confirm commitments and results. */
export function V2GameView(props: V2GameViewProps) {
  const { gameId, gameState, fighterA, fighterB, myPlayerId, serverTimeOffset } = props;
  const phase = String(gameState.phase ?? 'waiting');
  const mine = record(gameState.mine);
  const isOwner = (myPlayerId === fighterA.id || myPlayerId === fighterB.id) && !!gameState.mine;
  const finished = gameState.finished === true || phase === 'finished';
  const stageIndex = Number(gameState.stageIndex ?? 0);
  const [now, setNow] = useState(() => Date.now());
  const [sent, setSent] = useState(false);
  const serverSnapshot = JSON.stringify(mine);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 100); return () => window.clearInterval(timer); }, []);
  useEffect(() => { setSent(false); }, [gameId, phase, stageIndex, serverSnapshot]);
  const phaseEndsAt = Number(gameState.phaseEndsAt);
  const seconds = Number.isFinite(phaseEndsAt) ? Math.max(0, Math.ceil((phaseEndsAt - (now + serverTimeOffset)) / 1000)) : null;
  const active = isOwner && !finished && !['waiting', 'study', 'view', 'reveal'].includes(phase);
  const send = (action: V2Action) => { if (!active || mine.locked || mine.solved) return; setSent(true); props.onSendAction(action); };
  const phaseLabel: Record<string, string> = { waiting: 'Get ready', study: 'Study', draft: 'Reconstruct', view: 'Observe', answer: 'Estimate', puzzle: 'Choose', play: 'Play', commit: 'Choose privately', reveal: 'Reveal', finished: 'Final result' };
  return <section className="v2-game" aria-label={titles[gameId]}>
    <header className="v2-header"><div><p className="v2-eyebrow">{rounds[gameId] ? `Round ${Math.min(stageIndex + 1, rounds[gameId]!)} / ${rounds[gameId]}` : 'Head to head'} · {myPlayerId === fighterA.id || myPlayerId === fighterB.id ? 'Fighter' : 'Spectating'}</p><h3>{titles[gameId]}</h3></div><div className="v2-clock" aria-label={finished ? 'Finished' : `${phaseLabel[phase] ?? phase}, ${seconds ?? '—'} seconds remaining`}><strong>{finished ? '✓' : seconds === null ? '—' : `${seconds}s`}</strong><span>{phaseLabel[phase] ?? phase}</span></div></header>
    <p className="v2-rules">{instructions[gameId]}</p>
    {phase === 'waiting' ? <div className="v2-watch">{fighterA.avatar} {fighterA.name} vs {fighterB.avatar} {fighterB.name}<p>The server will start the game shortly.</p></div> : finished ? <Finished {...props} /> : <>
      <ActiveGame key={`${gameId}-${stageIndex}`} {...props} mine={mine} phase={phase} active={active} send={send} />
      <Outcome gameId={gameId} outcome={record(gameState.outcome)} fighterA={fighterA} fighterB={fighterB} />
    </>}
    {!finished && <p className="v2-feedback" role="status">{sent ? 'Sent — waiting for server confirmation.' : mine.locked ? 'Your choice is locked.' : !isOwner ? 'Watch-only view. Private choices appear after resolution.' : phase === 'reveal' ? 'Round resolved. Preparing the next turn.' : 'The server confirms every move and controls the clock.'}</p>}
  </section>;
}
