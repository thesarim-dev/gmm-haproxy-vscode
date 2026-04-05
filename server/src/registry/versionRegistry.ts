import { SectionType } from '../parser/ast';

/** A single directive's definition for a given HAProxy version. */
export interface DirectiveDefinition {
  readonly name: string;
  readonly sections: readonly SectionType[];
  readonly description: string;
  readonly signature: string;
  readonly sinceVersion: string;
  readonly deprecatedSinceVersion?: string;
  readonly removedInVersion?: string;
  readonly docsUrl?: string;
  /** If true, directive is only valid in tcp mode sections. */
  readonly tcpOnly?: boolean;
  /** If true, directive is only valid in http mode sections. */
  readonly httpOnly?: boolean;
}

/** Ordered list of known versions, from oldest to newest. */
const KNOWN_VERSIONS = ['2.4', '2.6', '2.8', '3.0', '3.1'] as const;
type KnownVersion = (typeof KNOWN_VERSIONS)[number];

/**
 * Registry that loads directive definitions per HAProxy version.
 * Uses nearest-lower-version fallback if exact version not found.
 */
export class VersionRegistry {
  private readonly cache = new Map<string, Map<string, DirectiveDefinition>>();

  /** Returns all directive definitions valid for a given version. */
  getDirectives(version: string): Map<string, DirectiveDefinition> {
    const resolved = this.resolveVersion(version);
    const cached = this.cache.get(resolved);
    if (cached) return cached;

    const data = this.loadVersion(resolved as KnownVersion);
    const map = new Map<string, DirectiveDefinition>(data.map((d) => [d.name, d]));
    this.cache.set(resolved, map);
    return map;
  }

  /** Returns a single directive definition, or undefined if not found in version. */
  getDirective(name: string, version: string): DirectiveDefinition | undefined {
    return this.getDirectives(version).get(name.toLowerCase());
  }

  /** Checks whether a directive exists in the given version. */
  isAvailable(name: string, version: string): boolean {
    const def = this.getDirective(name, version);
    if (!def) return false;
    if (def.removedInVersion && this.compareVersions(version, def.removedInVersion) >= 0) {
      return false;
    }
    return true;
  }

  /** Checks whether a directive is deprecated in the given version. */
  isDeprecated(name: string, version: string): boolean {
    const def = this.getDirective(name, version);
    if (!def?.deprecatedSinceVersion) return false;
    return this.compareVersions(version, def.deprecatedSinceVersion) >= 0;
  }

  getKnownVersions(): readonly string[] {
    return KNOWN_VERSIONS;
  }

  private resolveVersion(version: string): string {
    if ((KNOWN_VERSIONS as readonly string[]).includes(version)) return version;
    // Find nearest lower known version
    for (let i = KNOWN_VERSIONS.length - 1; i >= 0; i--) {
      const known = KNOWN_VERSIONS[i];
      if (known && this.compareVersions(version, known as string) >= 0) return known;
    }
    return KNOWN_VERSIONS[0] as string;
  }

  private compareVersions(a: string, b: string): number {
    const aParts = a.split('.').map(Number);
    const bParts = b.split('.').map(Number);
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const diff = (aParts[i] ?? 0) - (bParts[i] ?? 0);
      if (diff !== 0) return diff;
    }
    return 0;
  }

  private loadVersion(version: KnownVersion): DirectiveDefinition[] {
    // Inline baseline data — will be moved to data/*.json files in a follow-up
    return BASELINE_DIRECTIVES.filter((d) => {
      if (this.compareVersions(version as string, d.sinceVersion) < 0) return false;
      if (d.removedInVersion && this.compareVersions(version as string, d.removedInVersion) >= 0) return false;
      return true;
    });
  }
}

/**
 * Baseline directive definitions shared across versions.
 * Full per-version JSON data files will be added in server/src/data/.
 */
const BASELINE_DIRECTIVES: DirectiveDefinition[] = [
  // global
  { name: 'daemon', sections: ['global'], description: 'Run HAProxy in background (daemon mode).', signature: 'daemon', sinceVersion: '1.0', docsUrl: 'https://docs.haproxy.org/dev/configuration.html#daemon' },
  { name: 'log', sections: ['global', 'defaults', 'frontend', 'backend', 'listen'], description: 'Define a log target.', signature: 'log <address> [len <len>] [format <fmt>] <facility> [max level [min level]]', sinceVersion: '1.0', docsUrl: 'https://docs.haproxy.org/dev/configuration.html#log' },
  { name: 'maxconn', sections: ['global', 'defaults', 'frontend', 'listen'], description: 'Maximum concurrent connections.', signature: 'maxconn <number>', sinceVersion: '1.0' },
  { name: 'nbthread', sections: ['global'], description: 'Number of threads to use.', signature: 'nbthread <number>', sinceVersion: '1.8' },
  { name: 'stats', sections: ['global'], description: 'Enable stats socket or listener.', signature: 'stats socket <path> [param*] | stats timeout <timeout>', sinceVersion: '1.0' },
  // defaults / general
  { name: 'mode', sections: ['defaults', 'frontend', 'backend', 'listen'], description: 'Set operating mode: tcp or http.', signature: 'mode { tcp | http }', sinceVersion: '1.0' },
  { name: 'timeout', sections: ['defaults', 'frontend', 'backend', 'listen'], description: 'Set a timeout value.', signature: 'timeout <keyword> <value>', sinceVersion: '1.0' },
  { name: 'option', sections: ['defaults', 'frontend', 'backend', 'listen'], description: 'Enable a configuration option.', signature: 'option <keyword> [args]', sinceVersion: '1.0' },
  { name: 'retries', sections: ['defaults', 'backend', 'listen'], description: 'Number of retries after a connection failure.', signature: 'retries <number>', sinceVersion: '1.0' },
  { name: 'balance', sections: ['defaults', 'backend', 'listen'], description: 'Load balancing algorithm.', signature: 'balance <algorithm> [<arguments>]', sinceVersion: '1.0' },
  // frontend
  { name: 'bind', sections: ['frontend', 'listen'], description: 'Define listening address and port.', signature: 'bind [<address>]:<port_range> [param*]', sinceVersion: '1.0' },
  { name: 'acl', sections: ['frontend', 'backend', 'listen'], description: 'Define an Access Control List.', signature: 'acl <name> <criterion> [flags] [operator] [<value>]', sinceVersion: '1.2' },
  { name: 'use_backend', sections: ['frontend', 'listen'], description: 'Switch to backend if condition is true.', signature: 'use_backend <backend> if|unless <condition>', sinceVersion: '1.2' },
  { name: 'default_backend', sections: ['defaults', 'frontend', 'listen'], description: 'Default backend when no rule matches.', signature: 'default_backend <backend>', sinceVersion: '1.2' },
  { name: 'http-request', sections: ['frontend', 'backend', 'listen'], description: 'Apply action on HTTP request.', signature: 'http-request <action> [<condition>]', sinceVersion: '1.5', httpOnly: true },
  { name: 'http-response', sections: ['frontend', 'backend', 'listen'], description: 'Apply action on HTTP response.', signature: 'http-response <action> [<condition>]', sinceVersion: '1.5', httpOnly: true },
  // backend
  { name: 'server', sections: ['backend', 'listen'], description: 'Define a backend server.', signature: 'server <name> <address>[:<port>] [param*]', sinceVersion: '1.0' },
  { name: 'server-template', sections: ['backend', 'listen'], description: 'Define a range of similar backend servers.', signature: 'server-template <prefix> <num_or_range> <address>[:<port>] [param*]', sinceVersion: '1.8' },
  { name: 'cookie', sections: ['defaults', 'backend', 'listen'], description: 'Enable cookie-based persistence.', signature: 'cookie <name> [rewrite|insert|prefix] [...]', sinceVersion: '1.0' },
  // deprecated
  { name: 'reqrep', sections: ['frontend', 'backend', 'listen'], description: 'Replace a string in HTTP request (deprecated — use http-request replace-value).', signature: 'reqrep <search> <replace>', sinceVersion: '1.0', deprecatedSinceVersion: '2.4', removedInVersion: '2.4', httpOnly: true },
  { name: 'rsprep', sections: ['frontend', 'backend', 'listen'], description: 'Replace a string in HTTP response (deprecated — use http-response replace-value).', signature: 'rsprep <search> <replace>', sinceVersion: '1.0', deprecatedSinceVersion: '2.4', removedInVersion: '2.4', httpOnly: true },
];
