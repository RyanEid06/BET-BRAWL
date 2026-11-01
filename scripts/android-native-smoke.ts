import { execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import WebSocket from 'ws';
import { BRAWL_PROTOCOL_VERSION } from '../src/engine/types.ts';
import { getV2BotAction, type V2View } from '../src/engine/v2Games.ts';

const PACKAGE = 'com.betbrawl.app';
const ACTIVITY = `${PACKAGE}/.MainActivity`;
const SERVICE = `${PACKAGE}/.server.HostService`;
const UI_PATH = `/sdcard/betbrawl-native-smoke-${process.pid}.xml`;
const ROOM_NAMES = new Set(['BRAWL', 'FIGHT', 'CLASH', 'VIPER', 'TITAN', 'SWIFT', 'SPARK', 'TURBO', 'BLITZ', 'ARENA']);
const DEFAULT_EVIDENCE = 'artifacts/android-native-smoke';
const WAIT_MS = 120_000;

type Args = { serial: string; adb: string; evidenceDir: string };
type UiNode = { attrs: Record<string, string>; parent?: UiNode; children: UiNode[] };
type Envelope = { type?: string; payload?: any };
type RoomState = { roomCode: string; phase: string; players: any[]; currentRound?: any; tournamentSchedule?: any; roundHistory?: any[] };

function argumentsFrom(argv: string[]): Args {
  const result: Args = { serial: '', adb: 'adb', evidenceDir: DEFAULT_EVIDENCE };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--help' || argv[i] === '-h') {
      console.log('Usage: npx tsx scripts/android-native-smoke.ts --serial emulator-5554 [--adb adb] [--evidence-dir artifacts/android-native-smoke]');
      process.exit(0);
    }
    if (argv[i] === '--serial') result.serial = argv[++i] ?? '';
    else if (argv[i] === '--adb') result.adb = argv[++i] ?? 'adb';
    else if (argv[i] === '--evidence-dir') result.evidenceDir = argv[++i] ?? DEFAULT_EVIDENCE;
    else throw new Error(`Unknown option: ${argv[i]}`);
  }
  if (!/^emulator-\d+$/.test(result.serial)) throw new Error('Pass an explicit emulator serial (emulator-N); physical devices are rejected.');
  return result;
}

function adb(args: string[], timeout = 12_000): string {
  return execFileSync(options.adb, ['-s', options.serial, ...args], {
    encoding: 'utf8', timeout, maxBuffer: 4 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function shell(...args: string[]): string { return adb(['shell', ...args]); }
function sleep(ms: number): Promise<void> { return new Promise(resolveSleep => setTimeout(resolveSleep, ms)); }
async function waitFor<T>(read: () => T | null | undefined | false, label: string, timeout = 20_000, interval = 300): Promise<T> {
  const end = Date.now() + timeout;
  let lastError: unknown;
  while (Date.now() < end) {
    try {
      const value = read();
      if (value) return value as T;
    } catch (error) { lastError = error; }
    await sleep(interval);
  }
  throw new Error(`Timed out waiting for ${label}${lastError ? ` (${String(lastError)})` : ''}.`);
}

function decodeXml(value: string): string {
  return value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function parseUi(xml: string): UiNode[] {
  const roots: UiNode[] = [];
  const stack: UiNode[] = [];
  for (const match of xml.matchAll(/<\/?node\b[^>]*>/g)) {
    const tag = match[0];
    if (tag.startsWith('</')) { stack.pop(); continue; }
    const attrs: Record<string, string> = {};
    for (const attr of tag.slice(5, tag.length - (tag.endsWith('/>') ? 2 : 1)).matchAll(/([\w:-]+)="([^"]*)"/g)) {
      attrs[attr[1]] = decodeXml(attr[2]);
    }
    const node: UiNode = { attrs, parent: stack.at(-1), children: [] };
    if (node.parent) node.parent.children.push(node); else roots.push(node);
    if (!tag.endsWith('/>')) stack.push(node);
  }
  return roots;
}

function allNodes(roots: UiNode[]): UiNode[] {
  const result: UiNode[] = [];
  const visit = (node: UiNode) => { result.push(node); node.children.forEach(visit); };
  roots.forEach(visit);
  return result;
}

function nodeLabel(node: UiNode): string { return `${node.attrs.text ?? ''} ${node.attrs['content-desc'] ?? ''}`.trim(); }
function matches(node: UiNode, query: string | RegExp): boolean {
  const label = nodeLabel(node).replace(/\s+/g, ' ').trim();
  return typeof query === 'string' ? label.toLowerCase() === query.toLowerCase() : query.test(label);
}

function bounds(node: UiNode): [number, number, number, number] | null {
  const found = node.attrs.bounds?.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/);
  return found ? [Number(found[1]), Number(found[2]), Number(found[3]), Number(found[4])] : null;
}

function tapNode(node: UiNode, label: string): void {
  let target = node;
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.attrs.clickable === 'true') { target = parent; break; }
  }
  const box = bounds(target);
  if (!box || box[2] <= box[0] || box[3] <= box[1]) throw new Error(`UI tree has no usable bounds for ${label}.`);
  const x = Math.floor((box[0] + box[2]) / 2);
  const y = Math.floor((box[1] + box[3]) / 2);
  shell('input', 'tap', String(x), String(y));
}

function scrollOnce(roots: UiNode[]): boolean {
  const candidate = allNodes(roots).filter(node => node.attrs.scrollable === 'true')
    .map(node => ({ node, box: bounds(node) })).filter((item): item is { node: UiNode; box: [number, number, number, number] } => !!item.box)
    .sort((a, b) => (b.box[2] - b.box[0]) * (b.box[3] - b.box[1]) - (a.box[2] - a.box[0]) * (a.box[3] - a.box[1]))[0];
  if (!candidate) return false;
  const [left, top, right, bottom] = candidate.box;
  const x = Math.floor((left + right) / 2);
  const fromY = Math.floor(top + (bottom - top) * 0.78);
  const toY = Math.floor(top + (bottom - top) * 0.28);
  shell('input', 'swipe', String(x), String(fromY), String(x), String(toY), '350');
  return true;
}

function sanitize(value: string, roomCode = ''): string {
  let safe = value;
  if (roomCode) safe = safe.replaceAll(roomCode, '[ROOM]');
  return safe.replace(/\b(?:tok_|p_)[A-Za-z0-9_-]{8,}\b/g, '[REDACTED_TOKEN]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP]');
}

let options: Args;
let evidenceDir = '';
let roomCode = '';
let hostStarted = false;
let hostRoomCreated = false;
let forwardPort = 0;
let guestSockets: Guest[] = [];
let readonlyEvents: Array<Record<string, unknown>> = [];
let cleanupFailure = '';

function event(name: string, details: Record<string, unknown> = {}): void {
  readonlyEvents.push({ at: new Date().toISOString(), name, ...details });
  writeFileSync(resolve(evidenceDir, 'steps.jsonl'), readonlyEvents.map(entry => JSON.stringify(entry)).join('\n') + '\n');
}

function dumpUi(): { xml: string; nodes: UiNode[] } {
  shell('uiautomator', 'dump', UI_PATH);
  const xml = shell('cat', UI_PATH);
  if (xml.length > 2_000_000) throw new Error('UI tree exceeded the evidence size limit.');
  return { xml, nodes: parseUi(xml) };
}

function saveUi(label: string, xml: string): void {
  writeFileSync(resolve(evidenceDir, `${label}.xml`), sanitize(xml, roomCode));
}

function findNode(roots: UiNode[], query: string | RegExp): UiNode | undefined {
  return allNodes(roots).find(node => node.attrs.enabled !== 'false' && matches(node, query));
}

async function clickText(query: string | RegExp, label: string, timeout = 20_000): Promise<void> {
  const end = Date.now() + timeout;
  let scrolls = 0;
  while (Date.now() < end) {
    const ui = dumpUi();
    const node = findNode(ui.nodes, query);
    if (node) { tapNode(node, label); event('tap', { target: label }); return; }
    if (scrolls < 3 && scrollOnce(ui.nodes)) { scrolls++; await sleep(500); continue; }
    await sleep(300);
  }
  throw new Error(`UI tree did not expose ${label}.`);
}

async function waitForText(query: string | RegExp, label: string, timeout = 20_000): Promise<{ xml: string; nodes: UiNode[] }> {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const ui = dumpUi();
    if (findNode(ui.nodes, query)) return ui;
    const tip = allNodes(ui.nodes).find(node => node.attrs['resource-id'] === 'com.android.systemui:id/ok' && /^Got it$/i.test(node.attrs.text ?? ''));
    if (tip) { tapNode(tip, 'fullscreen tip'); await sleep(250); continue; }
    await sleep(300);
  }
  throw new Error(`UI tree did not expose ${label}.`);
}

function appPid(): string { return shell('pidof', PACKAGE).trim(); }
function resumedActivity(): string { return shell('dumpsys', 'activity', 'activities'); }
function isAppResumed(): boolean {
  return /(?:mResumedActivity:|topResumedActivity=|ResumedActivity:).*com\.betbrawl\.app\//.test(resumedActivity());
}
function mainActivityInTask(): boolean { return /ActivityRecord[^\r\n]*com\.betbrawl\.app\/(?:\.MainActivity|com\.betbrawl\.app\.MainActivity)/.test(resumedActivity()); }
function hostServiceDump(): string { return shell('dumpsys', 'activity', 'services', PACKAGE); }
function hostServiceStatus(): { running: boolean; foreground: boolean } {
  const dump = hostServiceDump();
  const at = dump.indexOf('HostService');
  if (at < 0) return { running: false, foreground: false };
  const service = dump.slice(Math.max(0, at - 256), at + 2_048);
  return { running: true, foreground: /(?:isForeground|foreground)\s*=\s*true|foregroundId\s*=\s*1001/i.test(service) };
}
function hostServiceRunning(): boolean { return hostServiceStatus().running; }
function imeVisible(): boolean { return /(?:mInputShown|mShowRequested|mImeWindowVis)\s*[=:]\s*(?:true|1)\b/i.test(shell('dumpsys', 'input_method')); }
function notificationPermission(): string {
  const state = shell('dumpsys', 'package', PACKAGE);
  if (!state.includes('android.permission.POST_NOTIFICATIONS')) throw new Error('App does not declare its notification permission.');
  return /android\.permission\.POST_NOTIFICATIONS:\s*granted=true\b/.test(state) ? 'granted' : 'denied';
}

function findRoomCode(roots: UiNode[]): string {
  const nodes = allNodes(roots);
  if (!nodes.some(node => /\bROOM CODE\b/i.test(nodeLabel(node)))) return '';
  return nodes.map(node => node.attrs.text?.trim().toUpperCase() ?? '').find(text => ROOM_NAMES.has(text)) ?? '';
}

class Guest {
  readonly messages: Envelope[] = [];
  latestState?: RoomState;
  playerId = '';
  sessionToken = '';
  private socket = new WebSocket(`ws://127.0.0.1:${forwardPort}/ws`);
  private heartbeat?: NodeJS.Timeout;
  private lastBotScope = '';
  private readonly botRandom = () => 0.5;

  constructor(readonly name: string) {
    this.socket.on('message', (data: WebSocket.RawData) => {
      let message: Envelope;
      try { message = JSON.parse(data.toString()) as Envelope; } catch { return; }
      this.messages.push(message);
      if (message.type === 'ROOM_STATE' && message.payload) {
        this.latestState = message.payload as RoomState;
        this.driveV2Bot(this.latestState);
      }
    });
    this.socket.on('error', () => {});
  }

  async open(): Promise<void> {
    await waitFor(() => this.socket.readyState === WebSocket.OPEN, `${this.name} socket open`, 15_000);
    this.heartbeat = setInterval(() => this.send('PING', { clientSentAt: Date.now() }), 5_000);
    this.heartbeat.unref();
  }

  send(type: string, payload?: Record<string, unknown>): void {
    if (this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify(payload ? { type, payload } : { type }));
  }

  async waitMessage(type: string, after = 0, timeout = 15_000): Promise<Envelope> {
    return waitFor(() => this.messages.slice(after).find(message => message.type === type), `${this.name} ${type}`, timeout);
  }

  async waitState(predicate: (state: RoomState) => boolean, label: string, timeout = 15_000, interval = 300): Promise<RoomState> {
    return waitFor(() => this.latestState && predicate(this.latestState) ? this.latestState : null, `${this.name} ${label}`, timeout, interval);
  }

  private driveV2Bot(state: RoomState): void {
    const round = state.currentRound;
    if (state.phase !== 'MINIGAME_ACTIVE' || !round?.gameConfig || !round?.gameState || !round.matchId) return;
    const view: V2View = { config: round.gameConfig, state: round.gameState, scores: round.fighterScores ?? {} };
    const scope = JSON.stringify([round.matchId, round.gameState.stageIndex, round.gameState.mine]);
    if (scope === this.lastBotScope) return;
    const action = getV2BotAction(view, this.botRandom);
    if (!action) return;
    this.lastBotScope = scope;
    this.send('FIGHTER_ACTION', { ...action, matchId: round.matchId, stageIndex: round.gameState.stageIndex, actionId: randomUUID() });
  }

  close(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) this.socket.close();
  }
}

async function joinGuest(name: string, code: string, token?: string): Promise<Guest> {
  const guest = new Guest(name);
  guestSockets.push(guest);
  await guest.open();
  guest.send('JOIN_ROOM', { roomCode: code, playerName: name, avatar: '🎲', sessionToken: token, protocolVersion: BRAWL_PROTOCOL_VERSION });
  const accepted = await guest.waitMessage('JOIN_SUCCESS');
  guest.sessionToken = String(accepted.payload?.sessionToken ?? '');
  guest.playerId = String(accepted.payload?.player?.id ?? '');
  if (!guest.sessionToken || !guest.playerId || accepted.payload?.roomCode !== code) throw new Error(`${name} joined without a valid assigned seat.`);
  return guest;
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolveListen, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolveListen));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not allocate adb forward port.');
  await new Promise<void>(resolveClose => server.close(() => resolveClose()));
  return address.port;
}

async function foregroundApp(): Promise<void> {
  adb(['shell', 'am', 'start', '-W', '-n', ACTIVITY], 30_000);
  await waitFor(() => isAppResumed(), 'MainActivity foreground', 15_000);
}

async function testEntryBackAndIme(): Promise<void> {
  shell('settings', 'put', 'secure', 'show_ime_with_hard_keyboard', '1');
  let ui = await waitForText(/HOST NEW GAME/i, 'entry screen');
  saveUi('entry', ui.xml);
  const pid = appPid();
  if (!pid) throw new Error('Entry screen is visible but its app process is missing.');
  shell('input', 'keyevent', '4');
  await waitFor(() => !isAppResumed(), 'entry Back minimizing the task');
  if (appPid() !== pid || !mainActivityInTask()) throw new Error('Entry Back destroyed the Activity instead of minimizing its task.');
  event('entry-back-minimized', { processAlive: true, activityRetained: true });

  await foregroundApp();
  ui = await waitForText(/HOST NEW GAME/i, 'entry screen after foreground');
  await clickText(/JOIN GAME WITH CODE/i, 'Join game with code');
  await waitForText(/ENTER ROOM CODE/i, 'room-code form');
  const inputUi = dumpUi();
  const input = allNodes(inputUi.nodes).find(node =>
    /room-code-input/i.test(node.attrs['resource-id'] ?? '') || node.attrs.class === 'android.widget.EditText' ||
    /e\.g\. BRAWL/i.test(node.attrs.hint ?? node.attrs.text ?? '')
  );
  if (!input) throw new Error('The room-code input was not exposed by the UI tree.');
  tapNode(input, 'room-code input');
  await waitFor(() => imeVisible(), 'software keyboard visible', 10_000);
  saveUi('keyboard-visible', dumpUi().xml);
  shell('input', 'keyevent', '4');
  await waitFor(() => !imeVisible(), 'Back hiding the keyboard', 10_000);
  ui = await waitForText(/ENTER ROOM CODE/i, 'room-code form after keyboard Back');
  if (findNode(ui.nodes, /Leave this room\?|Close room and leave\?/i)) throw new Error('Keyboard Back reached the room-leave handler.');
  await clickText('Cancel', 'cancel join form');
  await waitForText(/HOST NEW GAME/i, 'entry screen after join cancel');
  event('keyboard-back-hides-ime-first');
}

async function hostWithDeniedNotifications(): Promise<void> {
  const sdk = Number(shell('getprop', 'ro.build.version.sdk'));
  if (sdk < 33) throw new Error(`Notification-denial flow requires Android 13+; emulator API is ${sdk}.`);
  const permissionBefore = notificationPermission();
  if (!permissionBefore.includes('denied')) {
    shell('pm', 'revoke', PACKAGE, 'android.permission.POST_NOTIFICATIONS');
  }
  shell('pm', 'clear-permission-flags', PACKAGE, 'android.permission.POST_NOTIFICATIONS', 'user-set');
  shell('pm', 'clear-permission-flags', PACKAGE, 'android.permission.POST_NOTIFICATIONS', 'user-fixed');
  hostStarted = true;
  await clickText(/HOST NEW GAME/i, 'Host new game');
  const prompt = await waitForText(/Don't allow|Not now|Allow/i, 'notification permission dialog', 15_000);
  saveUi('notification-permission', prompt.xml);
  const service = await waitFor(() => {
    const status = hostServiceStatus();
    return status.running && status.foreground ? status : null;
  }, 'foreground HostService started before permission result', 10_000);
  event('foreground-service-started-while-notification-prompt-open', { foreground: service.foreground });
  await clickText(/Don't allow|Not now/i, 'deny notification permission', 15_000);
  await waitFor(() => notificationPermission().includes('denied'), 'notification permission denied');
  await waitFor(() => hostServiceRunning(), 'native HostService remains running after denial');
  event('hosting-started-with-notifications-denied', { permission: 'denied', serviceRunning: true });
}

async function createReadyGuests(): Promise<{ first: Guest; second: Guest }> {
  const ui = await waitForText(/ROOM CODE/i, 'native host room lobby', 30_000);
  saveUi('host-lobby', ui.xml);
  roomCode = findRoomCode(ui.nodes);
  if (!roomCode) throw new Error('Room lobby appeared but its code was not a known engine room name in the UI tree.');
  hostRoomCreated = true;
  event('host-room-created', { roomCode: '[ROOM]' });

  const candidatePort = await freePort();
  adb(['forward', '--no-rebind', `tcp:${candidatePort}`, 'tcp:8080']);
  forwardPort = candidatePort;
  event('adb-forward-installed', { localPort: forwardPort, devicePort: 8080 });

  const first = await joinGuest('CI Guest Alpha', roomCode);
  await first.waitState(state => state.roomCode === roomCode && state.players.some(player => player.id === first.playerId), 'first guest seat');
  first.send('TOGGLE_READY');
  await first.waitState(state => state.players.some(player => player.id === first.playerId && player.isReady), 'first guest ready');

  const second = await joinGuest('CI Guest Bravo', roomCode);
  await second.waitState(state => state.roomCode === roomCode && state.players.length === 3, 'three-player room');
  second.send('TOGGLE_READY');
  await second.waitState(state => state.players.some(player => player.id === second.playerId && player.isReady), 'second guest ready');
  const roster = await second.waitState(state => state.players.length === 3 && state.players.every(player => player.connected), 'all three connected');
  if (!roster.players.every(player => player.isHost || player.isReady)) throw new Error('Host lobby did not have two ready guests.');
  saveUi('lobby-ready', dumpUi().xml);
  return { first, second };
}

async function reconnectGuestSeat(first: Guest, second: Guest): Promise<Guest> {
  const playerId = first.playerId;
  first.close();
  await second.waitState(state => state.players.some(player => player.id === playerId && !player.connected), 'guest disconnect');
  const reconnect = await joinGuest('CI Guest Alpha', roomCode, first.sessionToken);
  if (reconnect.playerId !== playerId || reconnect.sessionToken !== first.sessionToken) throw new Error('Reconnect did not restore the original guest seat.');
  const state = await reconnect.waitState(value => value.players.length === 3 && value.players.some(player => player.id === playerId && player.connected), 'same guest seat reconnect');
  if (state.players.filter(player => player.name === 'CI Guest Alpha').length !== 1) throw new Error('Reconnect created a duplicate guest seat.');
  event('guest-seat-reconnected', { samePlayerId: true, playerCount: state.players.length });
  return reconnect;
}

async function keepLobbyAfterBack(stateGuest: Guest): Promise<void> {
  shell('input', 'keyevent', '4');
  const ui = await waitForText(/Close room and leave\?|Leave this room\?/i, 'room-leave confirmation');
  saveUi('lobby-back-confirmation', ui.xml);
  await clickText('Keep playing', 'keep playing');
  const room = await stateGuest.waitState(state => state.roomCode === roomCode && state.phase === 'LOBBY' && state.players.length === 3, 'lobby preserved after Back cancel');
  if (!room.players.every(player => player.isHost || player.isReady)) throw new Error('Back cancel changed guest readiness.');
  if (findNode(dumpUi().nodes, /HOST NEW GAME/i)) throw new Error('Back cancel returned to the entry screen.');
  event('lobby-back-cancel-preserved-room', { phase: room.phase, playerCount: room.players.length });
}

async function backgroundHostAndResume(second: Guest): Promise<void> {
  shell('input', 'keyevent', '3');
  await waitFor(() => !isAppResumed(), 'HOME backgrounding MainActivity');
  if (!hostServiceStatus().foreground) throw new Error('Foreground HostService stopped when the Activity moved to the background.');
  await second.waitState(state => state.roomCode === roomCode && state.phase === 'LOBBY' && state.players.length === 3 && state.players.every(player => player.connected), 'host continuity while backgrounded', 8_000);
  await foregroundApp();
  await waitForText(/ROOM CODE/i, 'same lobby after foreground resume');
  if (!hostServiceStatus().foreground) throw new Error('Foreground HostService did not survive Activity resume.');
  event('home-foreground-host-continuity');
}

async function startTournamentAndCancelBack(second: Guest): Promise<string> {
  await clickText(/START BRAWL MATCH!/i, 'start tournament from host UI');
  const firstMatch = await second.waitState(state => state.roomCode === roomCode && state.phase === 'FIGHTER_REVEAL' && !!state.currentRound?.matchId, 'normal tournament start', 20_000);
  const matchId = firstMatch.currentRound!.matchId as string;
  if (!firstMatch.tournamentSchedule) throw new Error('Tournament UI action did not create a tournament schedule.');
  const reveal = await waitForText(/FIGHTER REVEAL|ROUND 1|Qualifier/i, 'tournament screen');
  saveUi('tournament-started', reveal.xml);

  shell('input', 'keyevent', '4');
  const dialog = await waitForText(/Close room and leave\?|Leave this room\?/i, 'in-tournament Back confirmation');
  saveUi('tournament-back-confirmation', dialog.xml);
  await clickText('Keep playing', 'keep playing during tournament');
  const stillPlaying = await second.waitState(state => state.roomCode === roomCode && state.phase !== 'LOBBY' && !!state.tournamentSchedule, 'tournament preserved after Back cancel', 10_000);
  if (stillPlaying.currentRound?.matchId !== matchId) throw new Error('Back cancel changed the current tournament match.');
  if (findNode(dumpUi().nodes, /HOST NEW GAME/i)) throw new Error('Back cancel left the tournament.');
  event('tournament-back-cancel-preserved-match');
  return matchId;
}

async function completeRoundAndAdvance(second: Guest, firstMatchId: string): Promise<void> {
  const payout = await second.waitState(state => state.roomCode === roomCode && state.phase === 'PAYOUT_RECAP' && state.currentRound?.matchId === firstMatchId, 'production-timed payout recap', WAIT_MS, 500);
  if (!payout.currentRound?.resolutionReason || !payout.roundHistory?.length) throw new Error('Payout recap had no completed native round record.');
  const payoutUi = await waitForText(/PROCEED TO QUALIFIER|BEGIN CHAMPIONSHIP SERIES|PLAY CHAMPIONSHIP GAME|REVEAL FINAL PODIUM/i, 'payout next-round action', 20_000);
  saveUi('payout-recap', payoutUi.xml);
  event('native-round-finished-at-production-timing', { reason: payout.currentRound.resolutionReason });
  await clickText(/PROCEED TO QUALIFIER|BEGIN CHAMPIONSHIP SERIES|PLAY CHAMPIONSHIP GAME|REVEAL FINAL PODIUM/i, 'advance next round');
  const next = await second.waitState(state => state.roomCode === roomCode && state.currentRound?.matchId !== firstMatchId && state.phase !== 'PAYOUT_RECAP', 'next tournament match', 20_000);
  if (!next.currentRound?.matchId || !next.tournamentSchedule) throw new Error('Next round did not advance to a new native match.');
  event('host-advanced-next-round', { phase: next.phase, roundNumber: next.currentRound.roundNumber });
  saveUi('next-round', dumpUi().xml);
}

async function cleanup(): Promise<void> {
  for (const guest of guestSockets) guest.close();
  if (hostStarted) {
    try {
      await foregroundApp();
      if (hostRoomCreated) {
        const current = dumpUi();
        if (!findNode(current.nodes, /Close room and leave/i)) {
          shell('input', 'keyevent', '4');
          await waitForText(/Close room and leave/i, 'owned room cleanup confirmation', 10_000);
        }
        await clickText(/Close room and leave/i, 'close owned test room', 10_000);
        await waitForText(/HOST NEW GAME/i, 'host room closed', 15_000);
        await waitFor(() => !hostServiceRunning(), 'HostService stop requested by host UI', 5_000);
        event('owned-room-closed-through-host-ui');
      }
    } catch (error) {
      cleanupFailure = sanitize(String(error), roomCode).slice(0, 300);
      event('ui-cleanup-fallback', { reason: sanitize(String(error), roomCode).slice(0, 200) });
    }
    if (hostServiceRunning()) {
      try {
        shell('am', 'stopservice', '-n', SERVICE);
        await waitFor(() => !hostServiceRunning(), 'owned HostService stopped', 15_000);
        event('owned-service-stopped-by-cleanup-fallback');
      } catch (error) {
        cleanupFailure ||= sanitize(String(error), roomCode).slice(0, 300);
      }
    }
  }
  if (forwardPort) {
    try { adb(['forward', '--remove', `tcp:${forwardPort}`]); event('adb-forward-removed', { localPort: forwardPort }); } catch {}
  }
}

async function main(): Promise<void> {
  options = argumentsFrom(process.argv.slice(2));
  evidenceDir = resolve(options.evidenceDir);
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(resolve(evidenceDir, 'steps.jsonl'), '');

  const devices = execFileSync(options.adb, ['devices'], { encoding: 'utf8' });
  if (!new RegExp(`^${options.serial}\\s+device\\s*$`, 'm').test(devices)) throw new Error(`Selected emulator ${options.serial} is not online.`);
  if (!shell('pm', 'path', PACKAGE).startsWith('package:')) throw new Error(`${PACKAGE} is not installed.`);
  event('emulator-and-installed-app-verified', { serial: options.serial, package: PACKAGE });

  let failure: unknown;
  try {
    await testEntryBackAndIme();
    await hostWithDeniedNotifications();
    const guests = await createReadyGuests();
    const reconnected = await reconnectGuestSeat(guests.first, guests.second);
    await keepLobbyAfterBack(reconnected);
    await backgroundHostAndResume(guests.second);
    const matchId = await startTournamentAndCancelBack(guests.second);
    await completeRoundAndAdvance(guests.second, matchId);
    if (!appPid() || !isAppResumed()) throw new Error('App crashed or left the foreground during the native smoke.');
    event('native-smoke-passed');
  } catch (error) {
    failure = error;
    try {
      const ui = dumpUi();
      saveUi('failure', ui.xml);
    } catch {}
    try {
      const crash = adb(['logcat', '-b', 'crash', '-d', '-v', 'brief']).split(/\r?\n/)
        .filter(line => /FATAL EXCEPTION|AndroidRuntime|Process: com\.betbrawl\.app/.test(line))
        .slice(-80).map(line => sanitize(line, roomCode)).join('\n');
      writeFileSync(resolve(evidenceDir, 'app-crash-scan.txt'), crash);
    } catch {}
    event('native-smoke-failed', { error: sanitize(String(error), roomCode).slice(0, 500) });
  } finally {
    await cleanup();
    try { shell('rm', '-f', UI_PATH); } catch {}
    if (!failure && cleanupFailure) failure = new Error(`Cleanup did not complete through the owned host flow: ${cleanupFailure}`);
    writeFileSync(resolve(evidenceDir, 'summary.json'), JSON.stringify({
      result: failure ? 'FAIL' : 'PASS', serial: options.serial, package: PACKAGE,
      roomCreated: hostRoomCreated, roomCode: hostRoomCreated ? '[ROOM]' : null,
      events: readonlyEvents.map(item => item.name), error: failure ? sanitize(String(failure), roomCode) : undefined,
    }, null, 2) + '\n');
  }
  if (failure) throw failure;
  console.log(`PASS Android native smoke on ${options.serial}; sanitized evidence: ${evidenceDir}`);
}

main().catch(error => { console.error(sanitize(String(error), roomCode)); process.exitCode = 1; });
