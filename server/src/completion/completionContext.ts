// ── Context detection ────────────────────────────────────────────────────────

export type CompletionContext =
  | { kind: 'directive' }
  | { kind: 'http-request-action' }
  | { kind: 'http-response-action' }
  | { kind: 'http-after-response-action' }
  | { kind: 'tcp-request-keyword' }
  | { kind: 'tcp-request-connection-action' }
  | { kind: 'tcp-request-session-action' }
  | { kind: 'tcp-request-content-action' }
  | { kind: 'tcp-response-keyword' }
  | { kind: 'tcp-response-action' }
  | { kind: 'acl-criterion' }
  | { kind: 'server-param' }
  | { kind: 'backend-name' }
  | { kind: 'from-defaults-name' }
  | { kind: 'condition-acl-name' }
  | { kind: 'server-name' }
  | { kind: 'cache-name' }
  | { kind: 'resolvers-name' }
  | { kind: 'peers-name' };

/**
 * Parse the line prefix up to the cursor and determine what kind of completion
 * should be offered. Handles both section-header lines (col 0, no indent) and
 * directive lines (indented).
 */
export function parseLineContext(linePrefix: string): CompletionContext {
  const tokens = tokenize(linePrefix);
  if (tokens.length === 0) return { kind: 'directive' };
  const first = tokens[0].toLowerCase();
  const second = tokens[1]?.toLowerCase() ?? '';
  const last = tokens[tokens.length - 1].toLowerCase();
  const tokenCount = tokens.length;
  const sp = /\s$/.test(linePrefix);

  return (
    detectFromContext(tokens, linePrefix) ??
    detectConditionContext(tokens, sp) ??
    detectBackendContext(first, tokenCount, sp) ??
    detectAclContext(first, tokenCount, sp) ??
    detectHttpContext(first, second, tokenCount, sp) ??
    detectTcpContext(first, second, tokenCount, sp) ??
    detectServerContext(first, last, tokenCount, sp) ??
    { kind: 'directive' }
  );
}

/** Simple whitespace tokenizer (no quote handling needed for context detection). */
export function tokenize(line: string): string[] {
  return line.trim().split(/\s+/).filter(Boolean);
}

// ─── Private detectors ────────────────────────────────────────────────────────

/** Section header (col 0): `from <defaults-name>` completion */
function detectFromContext(tokens: string[], linePrefix: string): CompletionContext | null {
  const sp = /\s$/.test(linePrefix);
  const last = tokens[tokens.length - 1]?.toLowerCase() ?? '';
  if (!/^\s/.test(linePrefix) && sp && last === 'from') {
    return { kind: 'from-defaults-name' };
  }
  return null;
}

/** `use_backend` / `default_backend` → backend names; `use-server` → server names */
function detectBackendContext(first: string, tokenCount: number, sp: boolean): CompletionContext | null {
  if ((first === 'use_backend' || first === 'default_backend') && tokenCount === 1 && sp) {
    return { kind: 'backend-name' };
  }
  if (first === 'use-server' && tokenCount === 1 && sp) {
    return { kind: 'server-name' };
  }
  return null;
}

/** `acl <name>` → criterion (fetch method) */
function detectAclContext(first: string, tokenCount: number, sp: boolean): CompletionContext | null {
  if (first !== 'acl') return null;
  if (tokenCount === 2 && sp)  return { kind: 'acl-criterion' };
  if (tokenCount >= 3)         return { kind: 'acl-criterion' };
  return { kind: 'directive' };
}

/** `http-request`, `http-response`, `http-after-response` contexts */
function detectHttpContext(first: string, second: string, tokenCount: number, sp: boolean): CompletionContext | null {
  if (first === 'http-request') {
    if (tokenCount === 1 && sp) return { kind: 'http-request-action' };
    if (second === 'cache-use' && tokenCount === 2 && sp) return { kind: 'cache-name' };
    return { kind: 'directive' };
  }
  if (first === 'http-response') {
    if (tokenCount === 1 && sp) return { kind: 'http-response-action' };
    if (second === 'cache-store' && tokenCount === 2 && sp) return { kind: 'cache-name' };
    return { kind: 'directive' };
  }
  if (first === 'http-after-response') {
    if (tokenCount === 1 && sp) return { kind: 'http-after-response-action' };
    return { kind: 'directive' };
  }
  return null;
}

/** `tcp-request`, `tcp-response` contexts */
function detectTcpContext(first: string, second: string, tokenCount: number, sp: boolean): CompletionContext | null {
  if (first === 'tcp-request') {
    if (tokenCount === 1 && sp) return { kind: 'tcp-request-keyword' };
    if (tokenCount === 2 && sp) {
      if (second === 'connection') return { kind: 'tcp-request-connection-action' };
      if (second === 'session')    return { kind: 'tcp-request-session-action' };
      if (second === 'content')    return { kind: 'tcp-request-content-action' };
    }
    return { kind: 'directive' };
  }
  if (first === 'tcp-response') {
    if (tokenCount === 1 && sp) return { kind: 'tcp-response-keyword' };
    if (tokenCount === 2 && sp && second === 'content') return { kind: 'tcp-response-action' };
    return { kind: 'directive' };
  }
  return null;
}

/** `server`, `default-server`, `stick-table` contexts */
function detectServerContext(first: string, last: string, tokenCount: number, sp: boolean): CompletionContext | null {
  if (first === 'server') {
    if (tokenCount >= 3 && sp) {
      if (last === 'resolvers') return { kind: 'resolvers-name' };
      return { kind: 'server-param' };
    }
    return null;
  }
  if (first === 'default-server') {
    if (tokenCount >= 1 && sp) return { kind: 'server-param' };
    return null;
  }
  if (first === 'stick-table' && last === 'peers' && sp) {
    return { kind: 'peers-name' };
  }
  return null;
}

/** `if` / `unless` → ACL names */
function detectConditionContext(tokens: string[], sp: boolean): CompletionContext | null {
  let lastIfIdx = -1;
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (tokens[i] === 'if' || tokens[i] === 'unless') { lastIfIdx = i; break; }
  }
  if (lastIfIdx === -1) return null;
  // Trailing space after if/unless, or user is typing an ACL name token after it
  if (sp || lastIfIdx < tokens.length - 1) return { kind: 'condition-acl-name' };
  return null;
}
