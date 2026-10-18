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
  const trimmed = url.trim();
  if (!trimmed || trimmed === 'null' || trimmed.startsWith('file:') || trimmed.startsWith('about:')) {
    return true;
  }
  if (trimmed.startsWith('brawl://')) {
    const qIdx = trimmed.indexOf('?');
    if (qIdx !== -1) {
      const params = new URLSearchParams(trimmed.slice(qIdx + 1));
      const host = params.get('host');
      if (!host || host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1') {
        return true;
      }
      return false;
    }
    return true;
  }
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1';
  } catch {
    return trimmed.includes('localhost') || trimmed.includes('127.0.0.1') || trimmed.includes('0.0.0.0') || trimmed.includes('::1');
  }
}

/**
 * Safely constructs a canonical Join URL without duplicate query strings or malformed parameters.
 * Preserves host and port, supporting http://, https://, and custom brawl://join schemes.
 */
export function buildJoinUrl(baseUrl: string, roomCode: string): string {
  if (!baseUrl) return '';
  const trimmedBase = baseUrl.trim();
  if (trimmedBase === 'null' || trimmedBase.startsWith('file:') || trimmedBase.startsWith('about:')) {
    return '';
  }
  const trimmedCode = (roomCode || '').trim().toUpperCase();

  // Custom scheme: brawl://join
  if (trimmedBase.startsWith('brawl://')) {
    const questionIdx = baseUrl.indexOf('?');
    const baseUri = questionIdx !== -1 ? baseUrl.slice(0, questionIdx) : baseUrl;
    const queryString = questionIdx !== -1 ? baseUrl.slice(questionIdx + 1) : '';
    const params = new URLSearchParams(queryString);
    if (trimmedCode) {
      params.set('room', trimmedCode);
    }
    const qs = params.toString();
    return qs ? `${baseUri}?${qs}` : baseUri;
  }

  // Standard http/https URL
  try {
    const url = new URL(baseUrl);
    if (trimmedCode) {
      url.searchParams.set('room', trimmedCode);
    }
    return url.toString();
  } catch {
    const questionIdx = baseUrl.indexOf('?');
    const baseUri = questionIdx !== -1 ? baseUrl.slice(0, questionIdx) : baseUrl;
    const queryString = questionIdx !== -1 ? baseUrl.slice(questionIdx + 1) : '';
    const params = new URLSearchParams(queryString);
    if (trimmedCode) {
      params.set('room', trimmedCode);
    }
    const qs = params.toString();
    return qs ? `${baseUri}?${qs}` : baseUri;
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
