import {
  CompletionItem,
  CompletionItemKind,
  CompletionItemTag,
  MarkupKind,
  Position,
} from 'vscode-languageserver/node';
import { HaproxyDocument, HaproxySection, SectionType } from '../parser/ast';
import { VersionRegistry, DirectiveDefinition } from '../registry/versionRegistry';
import { ACTIONS, ActionDef, ActionRulesets } from '../data/actions';
import { FETCH_METHODS, PREDEFINED_ACLS, FetchMethodDef, FetchLayer } from '../data/acl';
import { SERVER_PARAMS, ServerParamDef } from '../data/server-params';

const SECTION_KEYWORDS: SectionType[] = [
  'global', 'defaults', 'frontend', 'backend', 'listen',
  'userlist', 'peers', 'resolvers', 'mailers', 'ring',
  'log-forward', 'program', 'http-errors', 'cache',
];


/**
 * Provides context-aware completion items for HAProxy config files.
 *
 * Three completion modes, selected by analysing the current line:
 *  1. Section keywords  — cursor is outside any section (col 0 area)
 *  2. Action sub-keywords — cursor follows an action directive (http-request, tcp-request, etc.)
 *  3. ACL fetch methods — cursor follows "acl <name>" (third token position)
 *  4. Directive keywords — default: all directives valid for the current section/mode
 */
export class CompletionProvider {
  constructor(
    private readonly registry: VersionRegistry,
    private readonly version: string
  ) {}

  /**
   * @param doc        Parsed HAProxy document
   * @param position   Cursor position
   * @param linePrefix Text of the current line up to the cursor (used for context detection)
   */
  provideCompletions(
    doc: HaproxyDocument,
    position: Position,
    linePrefix: string = ''
  ): CompletionItem[] {
    const section = this.findSectionAtLine(doc, position.line);

    if (!section) {
      return this.sectionKeywordCompletions();
    }

    const context = parseLineContext(linePrefix);

    switch (context.kind) {
      case 'http-request-action':
        return this.actionCompletions({ httpReq: true });

      case 'http-response-action':
        return this.actionCompletions({ httpRes: true });

      case 'http-after-response-action':
        return this.actionCompletions({ httpAft: true });

      case 'tcp-request-connection-action':
        return this.actionCompletions({ tcpRqCon: true });

      case 'tcp-request-session-action':
        return this.actionCompletions({ tcpRqSes: true });

      case 'tcp-request-content-action':
        return this.actionCompletions({ tcpRqCnt: true });

      case 'tcp-request-keyword':
        // User typed "tcp-request " — offer the sub-type keywords first
        return this.tcpRequestKeywordCompletions();

      case 'tcp-response-action':
        return this.actionCompletions({ tcpRsCnt: true });

      case 'tcp-response-keyword':
        return this.tcpResponseKeywordCompletions();

      case 'acl-criterion':
        return this.fetchMethodCompletions(section);

      case 'server-param':
        return this.serverParamCompletions();

      default:
        return this.directiveCompletions(section);
    }
  }

  // ── Section keywords ───────────────────────────────────────────────────────

  private sectionKeywordCompletions(): CompletionItem[] {
    return SECTION_KEYWORDS.map((kw) => ({
      label: kw,
      kind: CompletionItemKind.Keyword,
      detail: 'HAProxy section',
      documentation: {
        kind: MarkupKind.Markdown,
        value: `Start a new \`${kw}\` section.`,
      },
    }));
  }

  // ── Directive completions (default) ───────────────────────────────────────

  private directiveCompletions(section: HaproxySection): CompletionItem[] {
    const directives = this.registry.getDirectives(this.version);
    const items: CompletionItem[] = [];

    for (const [, def] of directives) {
      if (!def.sections.includes(section.type)) continue;
      if (def.httpOnly && section.mode === 'tcp') continue;
      if (def.tcpOnly && section.mode === 'http') continue;

      const isDeprecated = this.registry.isDeprecated(def.name, this.version);
      const item: CompletionItem = {
        label: def.name,
        kind: CompletionItemKind.Keyword,
        detail: def.signature,
        documentation: {
          kind: MarkupKind.Markdown,
          value: this.buildDirectiveDoc(def, isDeprecated),
        },
      };

      if (isDeprecated) {
        item.tags = [CompletionItemTag.Deprecated];
      }

      items.push(item);
    }

    items.sort((a, b) => {
      const aD = a.tags?.includes(CompletionItemTag.Deprecated) ? 1 : 0;
      const bD = b.tags?.includes(CompletionItemTag.Deprecated) ? 1 : 0;
      if (aD !== bD) return aD - bD;
      return a.label.localeCompare(b.label);
    });

    return items;
  }

  private buildDirectiveDoc(def: DirectiveDefinition, isDeprecated: boolean): string {
    const lines: string[] = [def.description, ''];
    lines.push(`**Since:** HAProxy ${def.sinceVersion}`);
    if (isDeprecated && def.deprecatedSinceVersion) {
      lines.push(`**Deprecated since:** HAProxy ${def.deprecatedSinceVersion}`);
    }
    if (def.docsUrl) {
      lines.push('', `[📖 HAProxy Docs](${def.docsUrl})`);
    }
    return lines.join('\n');
  }

  // ── Action completions ─────────────────────────────────────────────────────

  private actionCompletions(requiredRuleset: Partial<ActionRulesets>): CompletionItem[] {
    const key = Object.keys(requiredRuleset)[0] as keyof ActionRulesets;
    const items: CompletionItem[] = [];

    for (const action of ACTIONS) {
      if (!action.rulesets[key]) continue;

      const isDeprecated = action.deprecated !== undefined;
      const item: CompletionItem = {
        label: action.name,
        kind: CompletionItemKind.Value,
        detail: action.signature || action.name,
        documentation: {
          kind: MarkupKind.Markdown,
          value: this.buildActionDoc(action),
        },
        sortText: isDeprecated ? `z_${action.name}` : action.name,
      };

      if (isDeprecated) {
        item.tags = [CompletionItemTag.Deprecated];
      }

      items.push(item);
    }

    return items;
  }

  private buildActionDoc(action: ActionDef): string {
    const lines: string[] = [action.description, ''];
    lines.push(`**Since:** HAProxy ${action.since}`);
    if (action.deprecated) {
      lines.push(`**Deprecated since:** HAProxy ${action.deprecated}`);
    }
    lines.push('', `**Valid in:** ${describeRulesets(action.rulesets)}`);
    return lines.join('\n');
  }

  // ── tcp-request / tcp-response sub-type keywords ──────────────────────────

  private tcpRequestKeywordCompletions(): CompletionItem[] {
    return [
      {
        label: 'connection',
        kind: CompletionItemKind.Keyword,
        detail: 'tcp-request connection <action> [cond]',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Rules evaluated right after a connection is accepted, before any data is received.',
        },
      },
      {
        label: 'session',
        kind: CompletionItemKind.Keyword,
        detail: 'tcp-request session <action> [cond]',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Rules evaluated after a session is established (post-handshake).',
        },
      },
      {
        label: 'content',
        kind: CompletionItemKind.Keyword,
        detail: 'tcp-request content <action> [cond]',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Rules evaluated after content is available in the request buffer.',
        },
      },
      {
        label: 'inspect-delay',
        kind: CompletionItemKind.Keyword,
        detail: 'tcp-request inspect-delay <timeout>',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Set the maximum time to wait for data before evaluating content rules.',
        },
      },
    ];
  }

  private tcpResponseKeywordCompletions(): CompletionItem[] {
    return [
      {
        label: 'content',
        kind: CompletionItemKind.Keyword,
        detail: 'tcp-response content <action> [cond]',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Rules evaluated after content is available in the response buffer.',
        },
      },
      {
        label: 'inspect-delay',
        kind: CompletionItemKind.Keyword,
        detail: 'tcp-response inspect-delay <timeout>',
        documentation: {
          kind: MarkupKind.Markdown,
          value: 'Set the maximum time to wait for response data before evaluating content rules.',
        },
      },
    ];
  }

  // ── ACL fetch method completions ───────────────────────────────────────────

  private fetchMethodCompletions(section: HaproxySection): CompletionItem[] {
    const items: CompletionItem[] = [];
    const isHttp = section.mode === 'http' || section.type === 'frontend' || section.type === 'backend';
    const allowedLayers = allowedFetchLayers(isHttp);

    // Fetch methods
    for (const method of FETCH_METHODS) {
      if (!allowedLayers.has(method.layer)) continue;

      items.push({
        label: method.name,
        kind: CompletionItemKind.Function,
        detail: `${method.name}${method.signature} : ${method.outputType}`,
        documentation: {
          kind: MarkupKind.Markdown,
          value: this.buildFetchMethodDoc(method),
        },
        sortText: `a_${method.name}`,
      });

      // Also add ACL declinations as separate items
      if (method.aclDeclinations) {
        for (const decl of method.aclDeclinations) {
          if (decl === method.name) continue; // already added
          items.push({
            label: decl,
            kind: CompletionItemKind.Function,
            detail: `${decl} (ACL variant of ${method.name}) : ${method.outputType}`,
            documentation: {
              kind: MarkupKind.Markdown,
              value: `ACL declination of \`${method.name}\`.\n\n${method.description}`,
            },
            sortText: `b_${decl}`,
          });
        }
      }
    }

    // Pre-defined ACLs (usable as criteria after "acl <name>")
    for (const predef of PREDEFINED_ACLS) {
      items.push({
        label: predef.name,
        kind: CompletionItemKind.Constant,
        detail: `≡ ${predef.equivalent}`,
        documentation: {
          kind: MarkupKind.Markdown,
          value: `**Pre-defined ACL**\n\n${predef.description}\n\nEquivalent to: \`${predef.equivalent}\``,
        },
        sortText: `c_${predef.name}`,
      });
    }

    return items;
  }

  private buildFetchMethodDoc(method: FetchMethodDef): string {
    const lines: string[] = [method.description, ''];
    lines.push(`**Output type:** ${method.outputType}`);
    lines.push(`**Layer:** ${method.layer}`);
    lines.push(`**Since:** HAProxy ${method.since}`);
    if (method.aclDeclinations && method.aclDeclinations.length > 1) {
      lines.push('', `**ACL variants:** ${method.aclDeclinations.join(', ')}`);
    }
    return lines.join('\n');
  }

  // ── Server parameter completions ──────────────────────────────────────────

  private serverParamCompletions(): CompletionItem[] {
    const items: CompletionItem[] = [];

    for (const param of SERVER_PARAMS) {
      const isDeprecated = param.deprecated !== undefined;
      const item: CompletionItem = {
        label: param.name,
        kind: CompletionItemKind.Property,
        detail: param.signature ? `${param.name} ${param.signature}` : param.name,
        documentation: {
          kind: MarkupKind.Markdown,
          value: this.buildServerParamDoc(param, isDeprecated),
        },
        sortText: isDeprecated ? `z_${param.name}` : param.name,
      };

      if (isDeprecated) {
        item.tags = [CompletionItemTag.Deprecated];
      }

      items.push(item);
    }

    return items;
  }

  private buildServerParamDoc(param: ServerParamDef, isDeprecated: boolean): string {
    const lines: string[] = [param.description, ''];
    lines.push(`**Since:** HAProxy ${param.since}`);
    if (isDeprecated && param.deprecated) {
      lines.push(`**Deprecated since:** HAProxy ${param.deprecated}`);
    }
    if (param.removed) {
      lines.push(`**Removed in:** HAProxy ${param.removed}`);
    }
    return lines.join('\n');
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private findSectionAtLine(doc: HaproxyDocument, line: number): HaproxySection | null {
    let active: HaproxySection | null = null;
    for (const section of doc.sections) {
      if (section.headerRange.startLine <= line) {
        active = section;
      } else {
        break;
      }
    }
    return active;
  }
}

// ── Context detection ────────────────────────────────────────────────────────

type CompletionContext =
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
  | { kind: 'server-param' };

/**
 * Parse the line prefix up to the cursor and determine what kind of completion
 * should be offered.
 *
 * Examples:
 *   ""                         → directive
 *   "http-request "            → http-request-action
 *   "http-response deny "      → directive (already has action, no more sub-key)
 *   "tcp-request "             → tcp-request-keyword
 *   "tcp-request connection "  → tcp-request-connection-action
 *   "acl my_acl "              → acl-criterion
 *   "acl my_acl path_beg "     → directive (already has criterion, completing value)
 */
function parseLineContext(linePrefix: string): CompletionContext {
  const tokens = tokenize(linePrefix);
  if (tokens.length === 0) return { kind: 'directive' };

  const first = tokens[0]?.toLowerCase() ?? '';
  const second = tokens[1]?.toLowerCase() ?? '';
  const tokenCount = tokens.length;

  // "acl <name> " → cursor at position 3 (offering criterion)
  // "acl <name> <criterion> " → already has criterion
  if (first === 'acl') {
    if (tokenCount === 2 && linePrefix.endsWith(' ')) return { kind: 'acl-criterion' };
    if (tokenCount === 2 && !linePrefix.endsWith(' ')) return { kind: 'directive' }; // still typing name
    return { kind: 'directive' }; // past criterion
  }

  // http-request / http-response / http-after-response
  if (first === 'http-request') {
    if (tokenCount === 1 && linePrefix.endsWith(' ')) return { kind: 'http-request-action' };
    return { kind: 'directive' };
  }
  if (first === 'http-response') {
    if (tokenCount === 1 && linePrefix.endsWith(' ')) return { kind: 'http-response-action' };
    return { kind: 'directive' };
  }
  if (first === 'http-after-response') {
    if (tokenCount === 1 && linePrefix.endsWith(' ')) return { kind: 'http-after-response-action' };
    return { kind: 'directive' };
  }

  // tcp-request
  if (first === 'tcp-request') {
    if (tokenCount === 1 && linePrefix.endsWith(' ')) return { kind: 'tcp-request-keyword' };
    if (tokenCount >= 2) {
      if (tokenCount === 2 && linePrefix.endsWith(' ')) {
        if (second === 'connection') return { kind: 'tcp-request-connection-action' };
        if (second === 'session') return { kind: 'tcp-request-session-action' };
        if (second === 'content') return { kind: 'tcp-request-content-action' };
      }
    }
    return { kind: 'directive' };
  }

  // tcp-response
  if (first === 'tcp-response') {
    if (tokenCount === 1 && linePrefix.endsWith(' ')) return { kind: 'tcp-response-keyword' };
    if (tokenCount === 2 && linePrefix.endsWith(' ') && second === 'content') {
      return { kind: 'tcp-response-action' };
    }
    return { kind: 'directive' };
  }

  // server <name> <addr:port> [params...] — params start after 3rd token
  if (first === 'server') {
    if (tokenCount >= 3 && linePrefix.endsWith(' ')) return { kind: 'server-param' };
    return { kind: 'directive' };
  }

  // default-server [params...] — params start after the keyword itself
  if (first === 'default-server') {
    if (tokenCount >= 1 && linePrefix.endsWith(' ')) return { kind: 'server-param' };
    return { kind: 'directive' };
  }

  return { kind: 'directive' };
}

/** Simple whitespace tokenizer (no quote handling needed for context detection). */
function tokenize(line: string): string[] {
  return line.trim().split(/\s+/).filter(Boolean);
}

/** Determine which fetch layers are accessible given the section context. */
function allowedFetchLayers(isHttpMode: boolean): Set<FetchLayer> {
  const layers: FetchLayer[] = ['internal', 'L4', 'L5', 'L6'];
  if (isHttpMode) layers.push('L7');
  return new Set(layers);
}

/** Human-readable ruleset list for action documentation. */
function describeRulesets(rs: ActionRulesets): string {
  const parts: string[] = [];
  if (rs.httpReq) parts.push('http-request');
  if (rs.httpRes) parts.push('http-response');
  if (rs.httpAft) parts.push('http-after-response');
  if (rs.tcpRqCon) parts.push('tcp-request connection');
  if (rs.tcpRqSes) parts.push('tcp-request session');
  if (rs.tcpRqCnt) parts.push('tcp-request content');
  if (rs.tcpRsCnt) parts.push('tcp-response content');
  if (rs.quicIni) parts.push('quic-initial');
  return parts.join(', ');
}
