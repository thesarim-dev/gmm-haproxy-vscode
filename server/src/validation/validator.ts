import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver/node';
import { HaproxyDocument, HaproxySection, HaproxyDirective, SourceRange } from '../parser/ast';
import { VersionRegistry } from '../registry/versionRegistry';

const MAX_DIAGNOSTICS = 100;

/**
 * Validates a parsed HAProxy document against a specific version's directive set.
 */
export class ValidationProvider {
  constructor(
    private readonly registry: VersionRegistry,
    private readonly version: string
  ) {}

  validate(doc: HaproxyDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    // Surface parse errors first
    for (const err of doc.parseErrors) {
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: toRange(err.range),
        message: err.message,
        source: 'haproxy',
      });
      if (diagnostics.length >= MAX_DIAGNOSTICS) return diagnostics;
    }

    for (const section of doc.sections) {
      this.validateSection(section, diagnostics);
      if (diagnostics.length >= MAX_DIAGNOSTICS) return diagnostics;
    }

    return diagnostics;
  }

  private validateSection(section: HaproxySection, out: Diagnostic[]): void {
    for (const directive of section.directives) {
      this.validateDirective(directive, section, out);
      if (out.length >= MAX_DIAGNOSTICS) return;
    }
  }

  private validateDirective(
    directive: HaproxyDirective,
    section: HaproxySection,
    out: Diagnostic[]
  ): void {
    const name = directive.keyword.value.toLowerCase();
    const def = this.registry.getDirective(name, this.version);

    if (!def) {
      if (!this.registry.isAvailable(name, this.version)) {
        const nearestVersion = this.findSinceVersion(name);
        const msg = nearestVersion
          ? `Unknown directive '${name}'. It may be available since HAProxy ${nearestVersion}.`
          : `Unknown directive '${name}'.`;
        out.push(error(toRange(directive.range), msg));
        return;
      }
    }

    if (!def) return;

    // Check if directive was removed in this version
    if (def.removedInVersion) {
      out.push(
        error(
          toRange(directive.keyword.range),
          `'${name}' was removed in HAProxy ${def.removedInVersion}. ${migrationHint(name)}`
        )
      );
      return;
    }

    // Check if directive is deprecated
    if (this.registry.isDeprecated(name, this.version)) {
      out.push(
        warning(
          toRange(directive.keyword.range),
          `'${name}' is deprecated since HAProxy ${def.deprecatedSinceVersion ?? '?'}. ${migrationHint(name)}`
        )
      );
    }

    // Check section validity
    if (!def.sections.includes(section.type)) {
      out.push(
        error(
          toRange(directive.keyword.range),
          `'${name}' is not valid in a '${section.type}' section. Valid sections: ${def.sections.join(', ')}.`
        )
      );
    }

    // Check mode compatibility
    if (def.httpOnly && section.mode === 'tcp') {
      out.push(
        error(
          toRange(directive.keyword.range),
          `'${name}' requires HTTP mode but this section is in TCP mode.`
        )
      );
    }
    if (def.tcpOnly && section.mode === 'http') {
      out.push(
        error(
          toRange(directive.keyword.range),
          `'${name}' requires TCP mode but this section is in HTTP mode.`
        )
      );
    }
  }

  private findSinceVersion(name: string): string | undefined {
    for (const v of this.registry.getKnownVersions()) {
      const def = this.registry.getDirective(name, v);
      if (def) return def.sinceVersion;
    }
    return undefined;
  }
}

const MIGRATION_HINTS: Record<string, string> = {
  reqrep: "Use 'http-request replace-value' instead.",
  rsprep: "Use 'http-response replace-value' instead.",
};

function migrationHint(name: string): string {
  return MIGRATION_HINTS[name] ?? '';
}

function toRange(r: SourceRange): Range {
  return {
    start: { line: r.startLine, character: r.startCharacter },
    end: { line: r.endLine, character: r.endCharacter },
  };
}

function error(range: Range, message: string): Diagnostic {
  return { severity: DiagnosticSeverity.Error, range, message, source: 'haproxy' };
}

function warning(range: Range, message: string): Diagnostic {
  return { severity: DiagnosticSeverity.Warning, range, message, source: 'haproxy' };
}
