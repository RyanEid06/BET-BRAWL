import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import { discoverLanAddresses, isRfc1918, isLinkLocal, isLoopback } from './networkDiscovery.ts';

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
