/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: Safe LAN IPv4 Address Discovery
 * 
 * Discovers real physical Wi-Fi / Ethernet private IPv4 addresses.
 * Safely filters out 169.254.x.x (APIPA/link-local), loopback, and virtual adapters.
 */

import os from 'os';

export interface LanDiscoveryResult {
  primaryIp: string;
  candidateIps: string[];
}

export function isRfc1918(ip: string): boolean {
  const parts = ip.split('.').map(p => parseInt(p, 10));
  if (parts.length !== 4 || parts.some(isNaN)) return false;

  // 10.0.0.0 - 10.255.255.255
  if (parts[0] === 10) return true;

  // 172.16.0.0 - 172.31.255.255
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;

  // 192.168.0.0 - 192.168.255.255
  if (parts[0] === 192 && parts[1] === 168) return true;

  return false;
}

export function isLinkLocal(ip: string): boolean {
  return ip.startsWith('169.254.');
}

export function isLoopback(ip: string): boolean {
  return ip.startsWith('127.');
}

export function isLoopbackUrl(url: string | undefined): boolean {
  if (!url) return true;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1';
  } catch {
    return url.includes('localhost') || url.includes('127.0.0.1') || url.includes('0.0.0.0') || url.includes('::1');
  }
}

interface ScoredInterface {
  address: string;
  interfaceName: string;
  score: number;
}

export function discoverLanAddresses(
  customInterfaces?: NodeJS.Dict<os.NetworkInterfaceInfo[]>
): LanDiscoveryResult {
  const interfaces = customInterfaces || os.networkInterfaces();
  const scored: ScoredInterface[] = [];

  for (const [name, infos] of Object.entries(interfaces)) {
    if (!infos) continue;
    const lowerName = name.toLowerCase();

    for (const iface of infos) {
      if (iface.family !== 'IPv4' || iface.internal) continue;
      const ip = iface.address;

      // Never advertise loopback or 169.254.x.x link-local
      if (isLoopback(ip) || isLinkLocal(ip)) continue;

      let score = 0;

      // RFC1918 priority
      if (isRfc1918(ip)) {
        if (ip.startsWith('192.168.')) {
          score += 100; // Common home/office Wi-Fi
        } else if (ip.startsWith('10.')) {
          score += 90;
        } else {
          score += 80;
        }
      } else {
        score += 40;
      }

      // Name heuristics: prefer physical Wi-Fi/Ethernet
      if (/^(wlan|wi-fi|wifi|wireless|en|eth|ethernet)/i.test(lowerName)) {
        score += 50;
      }

      // Demote virtual / container / VPN interfaces
      if (/(docker|veth|br-|virbr|tailscale|tun|tap|wsl|hyper-v|vmnet|vbox)/i.test(lowerName)) {
        score -= 90;
      }

      scored.push({ address: ip, interfaceName: name, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  const candidateIps = Array.from(new Set(scored.map(s => s.address)));
  const primaryIp = candidateIps.length > 0 ? candidateIps[0] : '127.0.0.1';

  return {
    primaryIp,
    candidateIps: candidateIps.length > 0 ? candidateIps : ['127.0.0.1'],
  };
}
