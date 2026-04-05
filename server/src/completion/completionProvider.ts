import {
  CompletionItem,
  CompletionItemKind,
  CompletionItemTag,
  MarkupKind,
  Position,
} from 'vscode-languageserver/node';
import { HaproxyDocument, HaproxySection, SectionType } from '../parser/ast';
import { VersionRegistry, DirectiveDefinition } from '../registry/versionRegistry';

const SECTION_KEYWORDS: SectionType[] = [
  'global', 'defaults', 'frontend', 'backend', 'listen',
  'userlist', 'peers', 'resolvers', 'mailers', 'ring',
  'log-forward', 'program', 'http-errors', 'cache',
];

/**
 * Provides context-aware completion items for HAProxy config files.
 */
export class CompletionProvider {
  constructor(
    private readonly registry: VersionRegistry,
    private readonly version: string
  ) {}

  provideCompletions(doc: HaproxyDocument, position: Position): CompletionItem[] {
    const section = this.findSectionAtLine(doc, position.line);

    if (!section) {
      // Outside any section — offer section keywords
      return this.sectionKeywordCompletions();
    }

    return this.directiveCompletions(section);
  }

  private sectionKeywordCompletions(): CompletionItem[] {
    return SECTION_KEYWORDS.map((kw) => ({
      label: kw,
      kind: CompletionItemKind.Keyword,
      detail: `HAProxy section`,
      documentation: {
        kind: MarkupKind.Markdown,
        value: `Start a new \`${kw}\` section.`,
      },
    }));
  }

  private directiveCompletions(section: HaproxySection): CompletionItem[] {
    const directives = this.registry.getDirectives(this.version);
    const items: CompletionItem[] = [];

    for (const [, def] of directives) {
      if (!def.sections.includes(section.type)) continue;

      // Filter by mode if known
      if (def.httpOnly && section.mode === 'tcp') continue;
      if (def.tcpOnly && section.mode === 'http') continue;

      const isDeprecated = this.registry.isDeprecated(def.name, this.version);
      const item: CompletionItem = {
        label: def.name,
        kind: CompletionItemKind.Keyword,
        detail: def.signature,
        documentation: {
          kind: MarkupKind.Markdown,
          value: this.buildCompletionDoc(def, isDeprecated),
        },
      };

      if (isDeprecated) {
        item.tags = [CompletionItemTag.Deprecated];
      }

      items.push(item);
    }

    // Sort: non-deprecated first, then alphabetical
    items.sort((a, b) => {
      const aDeprecated = a.tags?.includes(CompletionItemTag.Deprecated) ? 1 : 0;
      const bDeprecated = b.tags?.includes(CompletionItemTag.Deprecated) ? 1 : 0;
      if (aDeprecated !== bDeprecated) return aDeprecated - bDeprecated;
      return a.label.localeCompare(b.label);
    });

    return items;
  }

  private buildCompletionDoc(def: DirectiveDefinition, isDeprecated: boolean): string {
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
