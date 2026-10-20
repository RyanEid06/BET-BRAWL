import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import { discoverLanAddresses, isRfc1918, isLinkLocal, isLoopback } from './networkDiscovery.ts';
import { buildRoomJoinUrl, type RoomNetworkInfo } from './types.ts';

test('buildRoomJoinUrl sets one room query on a public Cloudflare URL', () => {
  const result = buildRoomJoinUrl('https://brawl.example.com/?campaign=summer&room=OLD', 'abc123', 'cloud');
  assert.equal(result, 'https://brawl.example.com/?campaign=summer&room=ABC123');
});

test('buildRoomJoinUrl rejects non-public or non-HTTP Cloudflare sources', () => {
  for (const source of ['file:///game/index.html', 'null', 'brawl://join', 'http://localhost:5173', 'https://192.168.1.2']) {
    assert.equal(buildRoomJoinUrl(source, 'ABC123', 'cloud'), null, source);
  }
});

test('Cloudflare entry and lobby copy describe online play while LAN keeps Wi-Fi guidance', async t => {
  let React: typeof import('react');
  let renderToStaticMarkup: typeof import('react-dom/server').renderToStaticMarkup;
  let TitleAndDiscovery: typeof import('../components/TitleAndDiscovery.tsx').TitleAndDiscovery;
  let LobbyScreen: typeof import('../components/LobbyScreen.tsx').LobbyScreen;
  try {
    [React, { renderToStaticMarkup }, { TitleAndDiscovery }, { LobbyScreen }] = await Promise.all([
      import('react'), import('react-dom/server'), import('../components/TitleAndDiscovery.tsx'), import('../components/LobbyScreen.tsx'),
    ]);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND') {
      t.skip('React dependencies are not installed in this worktree');
      return;
    }
    throw error;
  }

  const networkInfo = (deploymentMode: 'cloud' | 'lan'): RoomNetworkInfo => ({
    deploymentMode,
    localIp: 'brawl.example.com',
    port: 443,
    roomCode: 'ABC123',
    fullJoinUrl: 'https://brawl.example.com/',
    hasActiveRoom: false,
    candidateUrls: deploymentMode === 'lan' ? ['http://192.168.1.10:3000', 'http://10.0.0.4:3000'] : ['https://brawl.example.com/'],
  });
  const entryProps = {
    playerName: '', setPlayerName: () => {}, playerAvatar: '🥊', setPlayerAvatar: () => {},
    onHostGame: () => {}, onJoinGame: () => {}, errorMessage: null, status: 'IDLE',
  };
  const lobbyProps = {
    players: [], roomCode: 'ABC123', isHost: true, myPlayer: null,
    onToggleReady: () => {}, onStartGame: () => {},
  };

  const cloud = renderToStaticMarkup(React.createElement(React.Fragment, null,
    React.createElement(TitleAndDiscovery, { ...entryProps, networkInfo: networkInfo('cloud') }),
    React.createElement(LobbyScreen, { ...lobbyProps, networkInfo: networkInfo('cloud') }),
  ));
  assert.match(cloud, /3–9 players/);
  assert.match(cloud, /different networks/);
  assert.match(cloud, /Internet connection required/);
  assert.match(cloud, /share room code or QR/i);
  assert.doesNotMatch(cloud, /Same Wi-Fi|No internet needed|Alternative LAN Addresses|router AP isolation|Finding your local game/i);

  const lan = renderToStaticMarkup(React.createElement(React.Fragment, null,
    React.createElement(TitleAndDiscovery, { ...entryProps, networkInfo: networkInfo('lan') }),
    React.createElement(LobbyScreen, { ...lobbyProps, networkInfo: networkInfo('lan') }),
  ));
  assert.match(lan, /Same Wi-Fi/);
  assert.match(lan, /No internet needed/);
  assert.match(lan, /Alternative LAN Addresses/);
  assert.match(lan, /router AP isolation/);

  const unknownMode = renderToStaticMarkup(React.createElement(React.Fragment, null,
    React.createElement(TitleAndDiscovery, { ...entryProps, networkInfo: null }),
    React.createElement(LobbyScreen, { ...lobbyProps, networkInfo: null }),
  ));
  assert.match(unknownMode, /3–9 players/);
  assert.doesNotMatch(unknownMode, /Same Wi-Fi|No internet needed|Having trouble joining|Finding your local game|router AP isolation/i);
});

test('networkDiscovery: correctly identifies RFC1918 and link-local ranges', () => {
  assert.equal(isRfc1918('192.168.1.10'), true);
  assert.equal(isRfc1918('10.0.0.5'), true);
  assert.equal(isRfc1918('172.20.1.1'), true);
  assert.equal(isRfc1918('169.254.8.1'), false);
  assert.equal(isRfc1918('127.0.0.1'), false);
  assert.equal(isRfc1918('8.8.8.8'), false);

  assert.equal(isLinkLocal('169.254.8.1'), true);
  assert.equal(isLinkLocal('192.168.1.1'), false);

  assert.equal(isLoopback('127.0.0.1'), true);
  assert.equal(isLoopback('192.168.1.1'), false);
});

test('networkDiscovery: rejects 169.254.x.x and prefers physical Wi-Fi over virtual adapters', () => {
  const mockInterfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]> = {
    'Ethernet 2': [
      {
        address: '169.254.8.1',
        netmask: '255.255.0.0',
        family: 'IPv4',
        mac: '00:00:00:00:00:00',
        internal: false,
        cidr: '169.254.8.1/16',
      },
    ],
    'docker0': [
      {
        address: '172.17.0.1',
        netmask: '255.255.0.0',
        family: 'IPv4',
        mac: '02:42:c6:81:65:b6',
        internal: false,
        cidr: '172.17.0.1/16',
      },
    ],
    'Wi-Fi': [
      {
        address: '192.168.1.45',
        netmask: '255.255.255.0',
        family: 'IPv4',
        mac: '00:11:22:33:44:55',
        internal: false,
        cidr: '192.168.1.45/24',
      },
    ],
    'lo': [
      {
        address: '127.0.0.1',
        netmask: '255.0.0.0',
        family: 'IPv4',
        mac: '00:00:00:00:00:00',
        internal: true,
        cidr: '127.0.0.1/8',
      },
    ],
  };

  const { primaryIp, candidateIps } = discoverLanAddresses(mockInterfaces);

  assert.equal(primaryIp, '192.168.1.45', 'Must select physical Wi-Fi private IP');
  assert.ok(!candidateIps.includes('169.254.8.1'), 'Must NEVER include link-local APIPA address');
  assert.ok(!candidateIps.includes('127.0.0.1'), 'Must not include internal loopback when valid LAN IP exists');
});
