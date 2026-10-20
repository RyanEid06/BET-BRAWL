import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import { discoverLanAddresses, isRfc1918, isLinkLocal, isLoopback, buildJoinUrl, isLoopbackUrl, resolveJoinEndpoint, resolveWsUrl } from './networkDiscovery.ts';

test('LAN addresses reject malformed octets instead of accepting numeric prefixes', () => {
  for (const address of ['10.bad.1.2.3', '10.1.2.999', '10.1.2.3x', '192.168.-1.2']) {
    assert.equal(isRfc1918(address), false, address);
  }
});

test('guest QR links reject unsafe targets and replace existing room parameters', () => {
  for (const source of ['brawl://join?host=127.0.0.1&port=8080', 'brawl://join?host=169.254.1.1&port=8080',
    'brawl://join?host=192.168.1.2&port=wrong', 'brawl://join?host=192.168.1.2&port=99999',
    'http://127.0.0.1:8080', 'http://169.254.1.1:8080', 'javascript:alert(1)', 'not-a-url']) {
    assert.equal(buildJoinUrl(source, 'ABC123'), '', source);
  }
  const url = new URL(buildJoinUrl('brawl://join?host=192.168.1.2&port=8181&room=OLD123&room=OLD456', 'ABC123'));
  assert.deepEqual(url.searchParams.getAll('room'), ['ABC123']);
  assert.equal(url.searchParams.get('port'), '8181');
});

test('guest endpoint resolution rejects invalid or ambiguous external targets', () => {
  for (const search of ['?room=ABC123&host=127.0.0.1&port=8080', '?room=ABC123&host=192.168.1.2&port=bad',
    '?room=ABC123&host=192.168.1.2&port=8080&port=8181', '?room=ABC123&room=DEF456&host=192.168.1.2']) {
    assert.equal(resolveJoinEndpoint('ABC123', undefined, search).hostToConnect, undefined, search);
  }
  assert.equal(resolveJoinEndpoint('ABC123', '127.0.0.1:8080').hostToConnect, undefined);
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

test('Android QR never becomes null?room=... and rejects null/file origins while preserving brawl scheme', () => {
  // Rejection of null, file, about, and empty URLs
  assert.equal(buildJoinUrl('null', 'BRAWL'), '');
  assert.equal(buildJoinUrl('  null  ', 'BRAWL'), '');
  assert.equal(buildJoinUrl('file:///android_asset/web/index.html', 'BRAWL'), '');
  assert.equal(buildJoinUrl('', 'BRAWL'), '');

  // Loopback / unroutable check
  assert.equal(isLoopbackUrl('null'), true);
  assert.equal(isLoopbackUrl('file:///android_asset/web/index.html'), true);
  assert.equal(isLoopbackUrl(''), true);
  assert.equal(isLoopbackUrl('brawl://join?host=127.0.0.1&port=8080'), true);
  assert.equal(isLoopbackUrl('brawl://join?host=192.168.1.50&port=8080'), false);

  // Valid Android brawl scheme produces proper URI: brawl://join?host=<LAN_IP>&port=8080&room=<ROOM_CODE>
  const androidQr = buildJoinUrl('brawl://join?host=192.168.1.50&port=8080', 'BRAWL');
  assert.equal(androidQr, 'brawl://join?host=192.168.1.50&port=8080&room=BRAWL');
  assert.ok(!androidQr.includes('null'), 'Android QR must never contain string null');

  // Normal browser keeps original URL with query param
  const browserQr = buildJoinUrl('http://192.168.1.50:3000', 'BRAWL');
  assert.equal(browserQr, 'http://192.168.1.50:3000/?room=BRAWL');
});

test('cold deep-link host/port reaches join target and bypasses discovery via real production endpoint resolver', () => {
  // Empty discovered rooms map proves discovery is bypassed
  const emptyDiscoveredRooms = new Map<string, { hostIp: string; port: number }>();
  const coldSearch = '?room=BRAWL&host=192.168.1.42&port=8080';

  // 1. Cold deep link directly resolves host and port from query search params
  const resolution = resolveJoinEndpoint('BRAWL', undefined, coldSearch, emptyDiscoveredRooms);
  assert.equal(resolution.source, 'query', 'Cold deep-link must resolve via query source');
  assert.equal(resolution.hostToConnect, '192.168.1.42:8080');

  // 2. Real resolveWsUrl maps the resolved target to canonical WebSocket endpoint
  const wsUrl = resolveWsUrl(resolution.hostToConnect);
  assert.equal(wsUrl, 'ws://192.168.1.42:8080/ws', 'WebSocket URL must connect directly to supplied cold deep-link host/port');
});

test('manual room joins without deep-link parameters use normal discovery', () => {
  // When no query params exist, manual join with no discovered room returns none
  const emptyDiscoveredRooms = new Map<string, { hostIp: string; port: number }>();
  const noDiscoveryRes = resolveJoinEndpoint('BRAWL', undefined, '', emptyDiscoveredRooms);
  assert.equal(noDiscoveryRes.source, 'none');
  assert.equal(noDiscoveryRes.hostToConnect, undefined);

  // When room is discovered via mDNS/UDP discovery, it resolves via discovered source
  const discoveredRooms = new Map<string, { hostIp: string; port: number }>();
  discoveredRooms.set('BRAWL', { hostIp: '192.168.1.88', port: 8080 });

  const manualJoinRes = resolveJoinEndpoint('BRAWL', undefined, '', discoveredRooms);
  assert.equal(manualJoinRes.source, 'discovered', 'Manual join must use normal discovery');
  assert.equal(manualJoinRes.hostToConnect, '192.168.1.88:8080');

  const wsUrl = resolveWsUrl(manualJoinRes.hostToConnect);
  assert.equal(wsUrl, 'ws://192.168.1.88:8080/ws');
});
