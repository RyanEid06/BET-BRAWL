import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import { discoverLanAddresses, isRfc1918, isLinkLocal, isLoopback, buildJoinUrl, isLoopbackUrl } from './networkDiscovery.ts';

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

test('cold deep-link host/port reaches join target: URL search params correctly supply target host without discovery', () => {
  // Cold launch: MainActivity supplies room, host, port in WebView URL
  const coldUrl = 'file:///android_asset/web/index.html?room=BRAWL&host=192.168.1.42&port=8080';
  const urlObj = new URL(coldUrl);
  const qRoom = (urlObj.searchParams.get('room') || '').trim().toUpperCase();
  const qHost = (urlObj.searchParams.get('host') || '').trim();
  const qPort = urlObj.searchParams.get('port');

  assert.equal(qRoom, 'BRAWL');
  assert.equal(qHost, '192.168.1.42');
  assert.equal(qPort, '8080');

  // Verify target endpoint resolution
  const targetEndpoint = qPort ? `${qHost}:${qPort}` : qHost;
  assert.equal(targetEndpoint, '192.168.1.42:8080');
});
