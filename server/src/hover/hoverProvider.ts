import { Hover, MarkupKind, Position } from 'vscode-languageserver/node';
import { HaproxyDocument, HaproxySection, HaproxyDirective } from '../parser/ast';
import { VersionRegistry, DirectiveDefinition } from '../registry/versionRegistry';

/**
 * Provides hover documentation for HAProxy directives.
 */
export class HoverProvider {
  constructor(
    private readonly registry: VersionRegistry,
    private readonly version: string
  ) {}

  provideHover(doc: HaproxyDocument, position: Position): Hover | null {
    const hit = this.findDirectiveAtPosition(doc, position);
    if (!hit) return null;

    const { directive, section } = hit;
    const name = directive.keyword.value.toLowerCase();
    const def = this.registry.getDirective(name, this.version);

    if (!def) return null;

    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: this.buildHoverContent(def, section),
      },
      range: {
        start: {
          line: directive.keyword.range.startLine,
          character: directive.keyword.range.startCharacter,
        },
        end: {
          line: directive.keyword.range.endLine,
          character: directive.keyword.range.endCharacter,
        },
      },
    };
  }

  private buildHoverContent(def: DirectiveDefinition, section: HaproxySection): string {
    const isDeprecated = this.registry.isDeprecated(def.name, this.version);
    const lines: string[] = [];

    // Title line
    lines.push(`**\`${def.name}\`** \`${def.signature}\``);
    lines.push('---');

    // Description
    lines.push(def.description);
    lines.push('');

    // Valid sections
    lines.push(`**Valid in:** ${def.sections.join(', ')}`);

    // Version info
    const versionInfo: string[] = [`**Since:** HAProxy ${def.sinceVersion}`];
    if (isDeprecated && def.deprecatedSinceVersion) {
      versionInfo.push(`~~**Deprecated in:** ${def.deprecatedSinceVersion}~~`);
    }
    if (def.removedInVersion) {
      versionInfo.push(`**Removed in:** ${def.removedInVersion}`);
    }
    lines.push(versionInfo.join('  |  '));

    // Mode constraint
    if (def.httpOnly) lines.push('**Requires:** HTTP mode');
    if (def.tcpOnly) lines.push('**Requires:** TCP mode');

    // Current section context
    if (section.mode) {
      lines.push(`**Current mode:** ${section.mode}`);
    }

    // Docs link
    if (def.docsUrl) {
      lines.push('');
      lines.push(`[📖 HAProxy Docs](${def.docsUrl})`);
    }

    return lines.join('\n');
  }

  private findDirectiveAtPosition(
    doc: HaproxyDocument,
    position: Position
  ): { directive: HaproxyDirective; section: HaproxySection } | null {
    for (const section of doc.sections) {
      if (section.headerRange.startLine === position.line) {
        return null; // Hovering on section header — not a directive
      }
      for (const directive of section.directives) {
        if (
          directive.range.startLine <= position.line &&
          directive.range.endLine >= position.line
        ) {
          // Check if hovering over the keyword token specifically
          const kw = directive.keyword;
          if (
            position.line === kw.range.startLine &&
            position.character >= kw.range.startCharacter &&
            position.character <= kw.range.endCharacter
          ) {
            return { directive, section };
          }
        }
      }
    }
    return null;
  }
}
