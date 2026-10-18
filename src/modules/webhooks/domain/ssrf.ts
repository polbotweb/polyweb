/**
 * Garde SSRF pour les webhooks sortants (brique d).
 *
 * 1. Validation de l'URL à l'enregistrement (schéma, identifiants, port).
 * 2. À l'envoi, la résolution DNS passe par `guardedLookup` : chaque adresse
 *    résolue est vérifiée AVANT la connexion (protège aussi du DNS rebinding,
 *    car c'est l'adresse réellement utilisée par le socket qui est contrôlée).
 * 3. Pas de suivi de redirection (`redirect: 'manual'`).
 */
import { BlockList, isIP } from 'node:net';
import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { Effect } from 'effect';
import { ValidationError } from '@/lib/effect/errors';

const blocked = new BlockList();
// IPv4
for (const [net, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blocked.addSubnet(net, prefix, 'ipv4');
// IPv6
for (const [net, prefix] of [
  ['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['2001:db8::', 32], ['64:ff9b::', 96], ['100::', 64],
] as const) blocked.addSubnet(net, prefix, 'ipv6');

export function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return true; // pas une IP → refus par prudence
  if (family === 6) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
    if (mapped) return blocked.check(mapped[1]!, 'ipv4');
    return blocked.check(address, 'ipv6');
  }
  return blocked.check(address, 'ipv4');
}

export interface UrlPolicy {
  readonly allowPrivate: boolean;
  readonly requireHttps: boolean;
}

/** Validation statique (sans DNS) d'une URL de webhook. */
export const validateWebhookUrl = (raw: string, policy: UrlPolicy) =>
  Effect.gen(function* () {
    const fail = (message: string) => new ValidationError({ issues: [{ path: 'url', message }] });
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return yield* fail('URL invalide');
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return yield* fail('Schéma http(s) requis');
    if (policy.requireHttps && url.protocol !== 'https:') return yield* fail('HTTPS requis en production');
    if (url.username || url.password) return yield* fail('Identifiants interdits dans l’URL');
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (!policy.allowPrivate) {
      if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
        return yield* fail('Hôte interne interdit');
      }
      if (isIP(host) && isPrivateAddress(host)) return yield* fail('Adresse IP privée/réservée interdite');
    }
    return url;
  });

export class SsrfBlockedError extends Error {
  readonly code = 'ESSRFBLOCKED';
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/** `lookup` compatible net/undici qui refuse les adresses privées. */
export function guardedLookup(allowPrivate: boolean) {
  return (hostname: string, options: object, callback: LookupCallback) => {
    dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err, []);
      const list = addresses as LookupAddress[];
      if (!allowPrivate) {
        const bad = list.find((a) => isPrivateAddress(a.address));
        if (bad) return callback(new SsrfBlockedError(`Blocked private address ${bad.address} for ${hostname}`), []);
      }
      if ((options as { all?: boolean }).all) return callback(null, list);
      const first = list[0];
      if (!first) return callback(new Error(`No address for ${hostname}`), []);
      callback(null, first.address, first.family);
    });
  };
}
